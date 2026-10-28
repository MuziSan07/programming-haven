"""Mock vetting runs: the whole hiring pipeline of a talent network, one stage after another.

Each stage is decided by real work elsewhere in the app (an AI interview, a proctored test attempt or a GitHub
take-home review). Only the FIRST attempt made after a stage begins counts, like the real thing. Failing a stage ends
the run; passing every stage earns a certificate.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..content import queries as q
from ..models import InterviewSession, ProjectSubmission, TestAttempt, User, VettingRun
from . import ai
from .gamification import issue_certificate
from .scoring import award

XP_PASS = 300
XP_PER_STAGE = 20
PROJECT_DAYS = 5
TEST_OVERTIME = timedelta(minutes=15)  # an unfinished attempt this long after its time limit counts as failed

PLATFORMS = {
    "toptal": {
        "label": "Toptal", "claim": "Says it accepts the top 3% of applicants",
        "about": "English call, a hard timed algorithm test, live coding with a senior engineer, then a real test "
                 "project. Toptal is the strictest of the three.",
        "stages": [
            {"key": "english", "type": "interview", "kind": "english", "pass": 70,
             "title": "English and personality screen",
             "summary": "A conversational call with a recruiter. Fluency, clarity and how you explain your work to "
                        "a client all count."},
            {"key": "algorithms", "type": "test", "test": "toptal-style-algorithm-screen",
             "title": "Timed algorithm test",
             "summary": "A proctored Codility-style test. Hidden edge-case tests decide the score, and the camera "
                        "and tab-switch checks stay on."},
            {"key": "live", "type": "interview", "kind": "live-coding", "pass": 75,
             "title": "Live coding with a senior engineer",
             "summary": "Solve a problem on a shared screen while the interviewer questions your approach, "
                        "complexity and tests."},
            {"key": "project", "type": "project", "pass": 75, "title": "Test project",
             "summary": f"Build a real take-home project and submit the GitHub repo within {PROJECT_DAYS} days. "
                        "It is reviewed like a hiring manager would review it."},
        ],
    },
    "turing": {
        "label": "Turing", "claim": "Says it accepts the top 1% of applicants",
        "about": "Turing leans on automated tests first: a tech-stack deep dive and a timed coding challenge, then "
                 "a technical interview and a soft-skills interview.",
        "stages": [
            {"key": "stack", "type": "test", "test": "turing-style-deep-dive", "title": "Tech stack deep dive",
             "summary": "Multiple-choice questions on your stack plus coding problems, under a timer and proctoring."},
            {"key": "challenge", "type": "test", "test": "algorithms-sprint", "title": "Timed coding challenge",
             "summary": "Three algorithm problems against the clock. Partial solutions earn partial credit."},
            {"key": "technical", "type": "interview", "kind": "technical", "pass": 70,
             "title": "Technical interview",
             "summary": "Concepts, past projects, a production incident and trade-offs, with sharp follow-ups."},
            {"key": "soft", "type": "interview", "kind": "behavioral", "pass": 70, "title": "Soft-skills interview",
             "summary": "Remote communication, ownership, conflict and feedback. Generic answers get probed."},
        ],
    },
    "lemon": {
        "label": "Lemon.io", "claim": "Says it accepts the top 1% of applicants",
        "about": "Lemon.io looks for senior developers who can talk to clients: a recruiter call, a technical test, "
                 "an interview with a senior developer and a live coding session.",
        "stages": [
            {"key": "recruiter", "type": "interview", "kind": "english", "pass": 70, "title": "Recruiter screen",
             "summary": "English level, experience and how you would handle a difficult client."},
            {"key": "test", "type": "test", "test": "lemon-io-senior-screen", "title": "Senior technical test",
             "summary": "A proctored test pitched at senior level, with an expert coding problem."},
            {"key": "technical", "type": "interview", "kind": "technical", "pass": 75,
             "title": "Interview with a senior developer",
             "summary": "A deep technical conversation about your stack, architecture and real projects."},
            {"key": "live", "type": "interview", "kind": "live-coding", "pass": 75, "title": "Live coding",
             "summary": "A live problem while the developer watches your code and pushes on edge cases."},
        ],
    },
}

ROLE_NICHE = {
    "Frontend Developer": "Frontend", "Backend Developer": "Backend", "Full Stack Developer": "Full Stack",
    "Mobile Developer": "Mobile", "Data Scientist": "Data Science", "AI Engineer": "AI / ML",
    "DevOps Engineer": "DevOps & Cloud", "Data Engineer": "Data Engineering", "QA Engineer": "QA Automation",
}
INTERVIEW_TITLES = {"english": "English interview", "live-coding": "live coding interview",
                    "technical": "technical interview", "behavioral": "HR and behavioural interview"}


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    # SQLite drops tzinfo; values are always stored in UTC
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _parse(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def stage_defs(platform: str) -> list[dict]:
    return PLATFORMS[platform]["stages"]


def pass_bar(db: Session, d: dict) -> int:
    if d["type"] == "test":
        return int((q.test(db, d["test"]) or {}).get("pass_mark", 75))
    return d["pass"]


def pick_project(db: Session, role: str) -> dict | None:
    """A take-home sized project for the role: intermediate first, then basic, at most 12 hours."""
    niche = ROLE_NICHE.get(role, "Full Stack")
    items = [p for p in q.projects(db) if p["hours"] <= 12]
    for level in ("Intermediate", "Basic"):
        pool = [p for p in items if p["niche"] == niche and p["level"] == level]
        if pool:
            return sorted(pool, key=lambda p: p["id"])[0]
    pool = [p for p in items if p["niche"] == "Full Stack"] or items
    return sorted(pool, key=lambda p: p["id"])[0] if pool else None


def new_stages(platform: str) -> list[dict]:
    return [{"key": d["key"], "status": "ready" if i == 0 else "locked", "ref": None, "started_at": None,
             "deadline": None, "score": None, "note": ""} for i, d in enumerate(stage_defs(platform))]


def current_index(run: VettingRun) -> int | None:
    return next((i for i, s in enumerate(run.stages) if s["status"] in ("ready", "active")), None)


# ---------------------------------------------------------------- syncing a stage with the work that decides it

def _decide_interview(db: Session, d: dict, st: dict) -> tuple[bool, float, str] | None:
    s = db.get(InterviewSession, st["ref"]) if st["ref"] else None
    if s is None:
        return False, 0, "The interview for this stage no longer exists."
    if not s.feedback:
        return None
    fb = s.feedback
    score = float(fb.get("overall_score") or 0)
    if fb.get("terminated") or (s.context or {}).get("terminated"):
        return False, score, "The interview was ended for an integrity violation."
    return score >= d["pass"], score, fb.get("summary") or fb.get("verdict") or ""


def _decide_test(db: Session, d: dict, st: dict) -> tuple[bool, float, str] | None:
    started = _parse(st["started_at"]) - timedelta(seconds=5)
    attempt = db.scalar(select(TestAttempt).where(TestAttempt.user_id == st["_user"], TestAttempt.test_id == d["test"],
                                                  TestAttempt.started_at >= started).order_by(TestAttempt.id))
    if attempt is None:
        return None
    st["ref"] = attempt.id
    if attempt.finished_at is None:
        test = q.test(db, d["test"]) or {"duration_minutes": 90}
        if now() > aware(attempt.started_at) + timedelta(minutes=test["duration_minutes"]) + TEST_OVERTIME:
            return False, 0, "Time ran out before the test was submitted."
        return None
    result = attempt.result or {}
    integrity = attempt.integrity_score if attempt.integrity_score is not None else 100
    if result.get("late"):
        note = "Submitted after the time limit."
    elif integrity < 60:
        note = f"Integrity score {integrity:.0f} is below the 60 needed to pass."
    else:
        note = f"Scored {attempt.score:.0f} against a pass mark of {result.get('pass_mark', pass_bar(db, d))}."
    return bool(result.get("passed")), float(attempt.score or 0), note


def _decide_project(db: Session, d: dict, st: dict) -> tuple[bool, float, str] | None:
    started = _parse(st["started_at"]) - timedelta(seconds=5)
    subs = db.scalars(select(ProjectSubmission).where(ProjectSubmission.user_id == st["_user"],
                                                      ProjectSubmission.project_id == st["ref"],
                                                      ProjectSubmission.created_at >= started)
                      .order_by(ProjectSubmission.id)).all()
    sub = next((s for s in subs if (s.review or {}).get("kind") == "repo"), None)
    if sub is None:
        if now() > _parse(st["deadline"]):
            return False, 0, "The deadline passed without a repository being submitted."
        return None
    st["submission"] = sub.id
    review = sub.review or {}
    score = float(review.get("overall_score") or 0)
    return score >= d["pass"], score, review.get("summary") or ""


DECIDERS = {"interview": _decide_interview, "test": _decide_test, "project": _decide_project}


def sync(db: Session, run: VettingRun, user: User) -> bool:
    """Advance the run if the active stage has been decided. Returns True when anything changed."""
    if run.status != "active":
        return False
    changed = False
    while True:
        i = current_index(run)
        if i is None or run.stages[i]["status"] != "active":
            break
        d, st = stage_defs(run.platform)[i], run.stages[i]
        st["_user"] = user.id
        ref_before = st.get("ref")
        outcome = DECIDERS[d["type"]](db, d, st)
        st.pop("_user", None)
        changed |= st.get("ref") != ref_before
        if outcome is None:
            break
        passed, score, note = outcome
        st.update(status="passed" if passed else "failed", score=round(score, 1), note=note[:600],
                  finished_at=now().isoformat())
        changed = True
        if not passed:
            finish(db, run, user, passed=False)
            break
        if i + 1 < len(run.stages):
            run.stages[i + 1]["status"] = "ready"
        else:
            finish(db, run, user, passed=True)
            break
    if changed:
        flag_modified(run, "stages")
    return changed


# ---------------------------------------------------------------- the final report

def _stage_evidence(db: Session, d: dict, st: dict) -> str:
    """A short text summary of how a finished stage went, for the AI report writer."""
    head = f"{d['title']}: {st['status']}, score {st['score']} (pass bar {pass_bar(db, d)}). {st['note']}"
    if d["type"] == "interview" and st["ref"]:
        fb = (db.get(InterviewSession, st["ref"]) or InterviewSession()).feedback or {}
        extra = "; ".join(str(x) for x in (fb.get("improvements") or [])[:3])
        return head + (f" Weak points: {extra}" if extra else "")
    if d["type"] == "project" and st.get("submission"):
        review = (db.get(ProjectSubmission, st["submission"]) or ProjectSubmission()).review or {}
        extra = "; ".join(str(x) for x in (review.get("must_fix") or [])[:3])
        return head + (f" Must fix: {extra}" if extra else "")
    return head


def _practice(d: dict, project_id: str | None) -> list[dict]:
    if d["type"] == "interview":
        k = d["kind"]
        items = [{"title": f"Do three more {INTERVIEW_TITLES[k]}s", "href": f"/interview?kind={k}",
                  "detail": "Open each report and fix the top weakness before the next one."}]
        if k == "live-coding":
            items.append({"title": "Race the clock in 1v1 duels", "href": "/duels",
                          "detail": "Speed and talking while you code both improve under pressure."})
        elif k == "english":
            items.append({"title": "Watch your interview replay", "href": "/interview",
                          "detail": "Check your pace and filler words answer by answer."})
        else:
            items.append({"title": "Drill interview questions", "href": "/questions",
                          "detail": "Short daily sets on the topics you were weakest at."})
        return items
    if d["type"] == "test":
        return [{"title": "Practise timed problems", "href": "/dsa",
                 "detail": "Hidden edge cases cost the most points. Test empty, single and huge inputs first."},
                {"title": "Enter the weekly contest", "href": "/contests",
                 "detail": "The closest thing to a proctored test with a hard clock."}]
    return [{"title": "Rework the test project", "href": f"/projects/{project_id}" if project_id else "/projects",
             "detail": "Fix every must-fix item, add tests and CI, then request a new review."},
            {"title": "Practise code review rounds", "href": "/rounds",
             "detail": "Reviewing other code trains you to spot what reviewers will flag in yours."}]


def build_report(db: Session, run: VettingRun, user: User, passed: bool) -> dict:
    platform = PLATFORMS[run.platform]
    defs = stage_defs(run.platform)
    done = [(d, st) for d, st in zip(defs, run.stages) if st["status"] in ("passed", "failed")]
    scores = [st["score"] or 0 for _, st in done]
    overall = round(sum(scores) / len(scores)) if scores else 0
    failed = next(((i, d) for i, (d, st) in enumerate(zip(defs, run.stages)) if st["status"] == "failed"), None)
    project_id = next((st["ref"] for d, st in zip(defs, run.stages) if d["type"] == "project"), None)

    if passed:
        verdict = "Offer-ready"
        weakest = min(done, key=lambda x: (x[1]["score"] or 0) - pass_bar(db, x[0]))[0] if done else None
    else:
        verdict = f"Rejected at stage {failed[0] + 1}" if failed else "Not finished"
        weakest = failed[1] if failed else None

    evidence = "\n".join(_stage_evidence(db, d, st) for d, st in done)
    first = user.name.split()[0]

    def fallback():
        if passed:
            return {"headline": f"You cleared every {platform['label']} stage.",
                    "summary": f"{first}, you passed all {len(defs)} stages with an average of {overall}. "
                               "On the real pipeline this profile would move to client matching. Keep your "
                               "weakest stage sharp, because real interviewers probe it harder.",
                    "strengths": [f"{d['title']}: {st['score']:.0f}" for d, st in done[:3]], "gaps": []}
        stage_title = failed[1]["title"] if failed else "the pipeline"
        return {"headline": f"The {stage_title.lower()} stopped this run.",
                "summary": f"{first}, you reached stage {failed[0] + 1 if failed else len(done)} of {len(defs)}. "
                           f"{run.stages[failed[0]]['note'] if failed else ''} Work through the plan below, "
                           "then start a new run.",
                "strengths": [f"{d['title']}: {st['score']:.0f}" for d, st in done if st["status"] == "passed"],
                "gaps": [run.stages[failed[0]]["note"]] if failed and run.stages[failed[0]]["note"] else []}

    messages = [
        {"role": "system", "content": f"You are the head of talent vetting at {platform['label']}. Write the "
                                      "candidate's final pipeline report: honest, specific, no flattery. Respond "
                                      "only with JSON."},
        {"role": "user", "content": f"Candidate: {first}, {run.level} {run.role}.\nOutcome: {verdict}.\n"
                                    f"Stage results:\n{evidence}\n\nReturn JSON: headline (one sentence), summary "
                                    "(3-4 sentences to the candidate, second person, naming the stage that decided "
                                    "the outcome), strengths (2-3 short items), gaps (2-3 short items, the most "
                                    "important first)."},
    ]
    text, used_ai = ai.chat_json(messages, fallback, max_tokens=900)
    base = fallback()
    report = {
        "verdict": verdict, "passed": passed, "overall_score": overall, "ai": used_ai,
        "headline": str(text.get("headline") or base["headline"])[:300],
        "summary": str(text.get("summary") or base["summary"])[:1500],
        "strengths": [str(x)[:200] for x in (text.get("strengths") or base["strengths"])][:4],
        "gaps": [str(x)[:200] for x in (text.get("gaps") or base["gaps"])][:4],
        "failed_stage": failed[0] if failed else None,
        "plan": (_practice(weakest, project_id) if weakest else [])
                + [{"title": f"Build a {platform['label']} study plan", "href": "/coach",
                    "detail": "The career coach turns these results into a week-by-week plan."}],
    }
    return report


def finish(db: Session, run: VettingRun, user: User, passed: bool) -> None:
    run.status = "passed" if passed else "failed"
    run.finished_at = now()
    for st in run.stages:
        if st["status"] in ("ready", "locked"):
            st["status"] = "skipped"
    report = build_report(db, run, user, passed)
    stages_passed = sum(1 for st in run.stages if st["status"] == "passed")
    xp = XP_PASS if passed else XP_PER_STAGE * stages_passed
    if xp:
        award(user, xp)
    report["xp_gained"] = xp
    if passed:
        label = PLATFORMS[run.platform]["label"]
        cert = issue_certificate(db, user, "vetting", run.platform, f"{label} mock vetting pipeline",
                                 score=report["overall_score"], meta={"role": run.role, "level": run.level,
                                                                      "stages": len(run.stages)})
        db.flush()
        report["certificate_id"] = cert.id
    run.report = report


def stats(db: Session, platform: str) -> dict:
    """How Haven candidates do on this pipeline, for the platform cards."""
    rows = db.execute(select(VettingRun.status).where(VettingRun.platform == platform,
                                                      VettingRun.status.in_(("passed", "failed")))).all()
    total = len(rows)
    passed = sum(1 for (s,) in rows if s == "passed")
    return {"finished": total, "passed": passed, "pass_rate": round(100 * passed / total) if total else None}
