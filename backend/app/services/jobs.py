"""Jobs posted by the Programming Haven team, applications from Job Seekers, and AI vetting of each applicant.

Stages reuse the Mock Vetting engine: interviews, proctored tests and take-home projects are decided by the same
code (`vetting.DECIDERS`). The AI resume screen is the one stage that only exists here. Seekers see where they are
in the pipeline and a short note at the end; scores and the full report are for the admin team.
"""

import re
import secrets
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..config import get_settings
from ..content import queries as q
from ..models import Job, JobApplication, SeekerProfile, User
from ..routers import interviews
from . import ai
from . import vetting as v

EMPLOYMENT_TYPES = ("Full-time", "Part-time", "Contract", "Freelance")
SENIORITY = ("Junior", "Mid-level", "Senior", "Lead")
JOB_STATUSES = ("draft", "open", "closed")
INTERVIEW_KINDS = ("english", "technical", "live-coding", "behavioral", "system-design")
ENGLISH_LEVELS = ("Basic", "Conversational", "Fluent", "Native")
RESUME_PASS = 60
PROJECT_DAYS = 5

# Statuses: the pipeline sets vetting / vetted / not_selected / withdrawn; the admin team moves vetted
# candidates on to shortlisted / submitted / hired / rejected.
ADMIN_STATUSES = ("vetted", "shortlisted", "submitted", "hired", "rejected")
SEEKER_LABEL = {
    "vetting": "Vetting in progress",
    "vetted": "Vetting complete, under review",
    "shortlisted": "Shortlisted",
    "submitted": "Profile shared with the hiring team",
    "hired": "Hired",
    "rejected": "Not moving forward",
    "not_selected": "Not moving forward",
    "withdrawn": "Withdrawn",
}
RANK = {"hired": 0, "submitted": 1, "shortlisted": 2, "vetted": 3, "vetting": 4, "not_selected": 5, "rejected": 6,
        "withdrawn": 7}
INTERVIEW_LABEL = {"english": "English interview", "technical": "Technical interview",
                   "live-coding": "Live coding interview", "behavioral": "HR and behavioural interview",
                   "system-design": "System design interview"}
LEVEL_FOR_INTERVIEW = {"Junior": "Junior", "Mid-level": "Mid-level", "Senior": "Senior", "Lead": "Senior"}
MIN_YEARS = {"Junior": 0, "Mid-level": 2, "Senior": 5, "Lead": 7}


def resumes_dir() -> Path:
    path = Path(get_settings().resumes_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


# ---------------------------------------------------------------- stage definitions

def blocks(db: Session) -> dict:
    """What the admin can build a pipeline from."""
    return {
        "types": [
            {"type": "resume", "label": "AI resume screen", "default_pass": RESUME_PASS,
             "summary": "The AI reads the resume and profile against the job description and scores the fit."},
            {"type": "interview", "label": "AI interview", "default_pass": 70,
             "summary": "A voice interview with the AI interviewer, graded like a hiring panel."},
            {"type": "test", "label": "Proctored test", "default_pass": None,
             "summary": "A timed, camera-proctored test. Uses the test's own pass mark."},
            {"type": "project", "label": "Take-home project", "default_pass": 70,
             "summary": f"A real project submitted as a GitHub repo, reviewed by AI. {PROJECT_DAYS} days by default."},
        ],
        "interviews": [{"kind": k, "label": INTERVIEW_LABEL[k], "minutes": interviews.KINDS[k]["minutes"]}
                       for k in INTERVIEW_KINDS],
        "tests": [{"id": t["id"], "title": t["title"], "minutes": t.get("duration_minutes"),
                   "pass_mark": t.get("pass_mark", 75)} for t in q.tests(db)],
        "projects": [{"id": p["id"], "title": p["title"], "level": p["level"], "hours": p["hours"],
                      "niche": p.get("niche")} for p in q.projects(db) if p["hours"] <= 16],
    }


def default_stages() -> list[dict]:
    return [{"type": "resume", "pass": RESUME_PASS}, {"type": "interview", "kind": "english", "pass": 65},
            {"type": "interview", "kind": "technical", "pass": 70}]


def normalize_stages(db: Session, raw: list[dict]) -> list[dict]:
    """Validate the admin's pipeline and fill in titles. Raises 400 on anything invalid."""
    if not raw:
        raise HTTPException(400, "Add at least one vetting stage")
    if len(raw) > 6:
        raise HTTPException(400, "Keep the pipeline to 6 stages or fewer")
    out = []
    for i, s in enumerate(raw):
        kind = s.get("type")
        stage = {"key": f"s{i + 1}", "type": kind}
        if kind == "resume":
            stage.update(title="AI resume screen", **{"pass": _pass(s, RESUME_PASS)})
        elif kind == "interview":
            if s.get("kind") not in INTERVIEW_KINDS:
                raise HTTPException(400, f"Stage {i + 1}: pick an interview type")
            stage.update(kind=s["kind"], title=INTERVIEW_LABEL[s["kind"]], **{"pass": _pass(s, 70)})
        elif kind == "test":
            test = q.test(db, s.get("test") or "")
            if not test:
                raise HTTPException(400, f"Stage {i + 1}: pick a test")
            stage.update(test=test["id"], title=test["title"])
        elif kind == "project":
            if s.get("project") and not q.project(db, s["project"]):
                raise HTTPException(400, f"Stage {i + 1}: that project doesn't exist")
            days = int(s.get("days") or PROJECT_DAYS)
            if not 1 <= days <= 21:
                raise HTTPException(400, f"Stage {i + 1}: allow between 1 and 21 days for the project")
            stage.update(project=s.get("project") or None, days=days, title="Take-home project",
                         **{"pass": _pass(s, 70)})
        else:
            raise HTTPException(400, f"Stage {i + 1}: unknown stage type")
        out.append(stage)
    if sum(st["type"] == "resume" for st in out) > 1:
        raise HTTPException(400, "Use the resume screen once at most")
    return out


def _pass(s: dict, default: int) -> int:
    value = int(s.get("pass") if s.get("pass") is not None else default)
    if not 1 <= value <= 100:
        raise HTTPException(400, "Pass marks must be between 1 and 100")
    return value


def pass_mark(db: Session, d: dict) -> int:
    return v.pass_bar(db, d) if d["type"] == "test" else d["pass"]


def new_stage_state(job: Job) -> list[dict]:
    return [{"key": d["key"], "status": "ready" if i == 0 else "locked", "ref": None, "started_at": None,
             "deadline": None, "score": None, "note": "", "finished_at": None} for i, d in enumerate(job.stages)]


def current_index(app: JobApplication) -> int | None:
    return next((i for i, s in enumerate(app.stages) if s["status"] in ("ready", "active")), None)


# ---------------------------------------------------------------- the AI resume screen

def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z][a-z0-9+#.]*", text.lower()))


def screen_resume(job: Job, user: User, profile: SeekerProfile | None, d: dict) -> tuple[bool, float, str, dict]:
    profile_text = ""
    if profile:
        profile_text = (f"Headline: {profile.headline}\nRole: {profile.primary_role}\nYears: {profile.years_experience}\n"
                        f"Skills: {', '.join(profile.skills or [])}\nEnglish: {profile.english_level}\n"
                        f"Location: {profile.location} ({profile.timezone})\nSummary: {profile.summary}")
    resume = (profile.resume_text if profile else "")[:12000]
    years = profile.years_experience if profile else None

    def fallback():
        text = f"{resume}\n{profile_text}".lower()
        words = _words(text)
        skills = [s for s in job.skills or []]
        matched = [s for s in skills if s.lower() in text or _words(s) <= words]
        missing = [s for s in skills if s not in matched]
        score = 45 + 45 * len(matched) / len(skills) if skills else 70
        need = MIN_YEARS.get(job.seniority, 0)
        if years is not None and years < need:
            score -= min(25, (need - years) * 8)
        if len(resume) < 300:
            score -= 15
        score = max(0, min(100, round(score)))
        return {"score": score, "matched_skills": matched, "missing_skills": missing,
                "summary": f"Matched {len(matched)} of {len(skills)} listed skills"
                           + (f"; {years} years against {need}+ expected." if years is not None else "."),
                "feedback": "Your resume was screened against the job's core skills and experience level."}

    messages = [
        {"role": "system", "content": "You screen developer resumes for a remote hiring team. Be strict and fair: "
                                      "score real evidence of the required skills and seniority, not keywords "
                                      "alone. Respond only with JSON."},
        {"role": "user", "content": f"Job: {job.seniority} {job.title} ({job.role}).\nRequired skills: "
                                    f"{', '.join(job.skills or [])}.\nJob description:\n{job.description[:4000]}\n\n"
                                    f"Candidate profile:\n{profile_text}\n\nResume text:\n{resume}\n\n"
                                    "Return JSON: score (0-100 fit), matched_skills (list), missing_skills (list), "
                                    "summary (2-3 sentences for the hiring team: evidence for and against), "
                                    "feedback (one encouraging, specific sentence to the candidate, no score)."},
    ]
    result, used_ai = ai.chat_json(messages, fallback, max_tokens=900, fast=True)
    base = fallback()
    try:
        score = max(0.0, min(100.0, float(result.get("score", base["score"]))))
    except (TypeError, ValueError):
        score = float(base["score"])
    detail = {"matched_skills": [str(s)[:60] for s in (result.get("matched_skills") or base["matched_skills"])][:15],
              "missing_skills": [str(s)[:60] for s in (result.get("missing_skills") or base["missing_skills"])][:15],
              "summary": str(result.get("summary") or base["summary"])[:800],
              "feedback": str(result.get("feedback") or base["feedback"])[:300], "ai": used_ai}
    return score >= d["pass"], score, detail["summary"], detail


# ---------------------------------------------------------------- moving through the pipeline

def _profile(db: Session, user_id: int) -> SeekerProfile | None:
    return db.get(SeekerProfile, user_id)


def _run_resume_stage(db: Session, app: JobApplication, i: int) -> None:
    d, st = app.job.stages[i], app.stages[i]
    passed, score, note, detail = screen_resume(app.job, app.user, _profile(db, app.user_id), d)
    now = v.now().isoformat()
    st.update(status="passed" if passed else "failed", score=round(score, 1), note=note, detail=detail,
              started_at=now, finished_at=now)


def advance(db: Session, app: JobApplication) -> bool:
    """Decide the active stage if its work is done, open the next one, run automatic stages. True if changed."""
    if app.status != "vetting":
        return False
    changed = False
    while True:
        i = current_index(app)
        if i is None:
            break
        d, st = app.job.stages[i], app.stages[i]
        if d["type"] == "resume":
            _run_resume_stage(db, app, i)
        elif st["status"] == "active":
            st["_user"] = app.user_id
            ref_before = st.get("ref")
            outcome = v.DECIDERS[d["type"]](db, d, st)
            st.pop("_user", None)
            changed |= st.get("ref") != ref_before
            if outcome is None:
                break
            passed, score, note = outcome
            st.update(status="passed" if passed else "failed", score=round(score, 1), note=note[:600],
                      finished_at=v.now().isoformat())
        else:
            break  # ready and waiting for the candidate
        changed = True
        if st["status"] == "failed":
            finish(db, app, passed=False)
            break
        if i + 1 < len(app.stages):
            app.stages[i + 1]["status"] = "ready"
        else:
            finish(db, app, passed=True)
            break
    if changed:
        flag_modified(app, "stages")
    return changed


def begin(db: Session, app: JobApplication, index: int, user: User) -> str | None:
    advance(db, app)
    if app.status != "vetting":
        raise HTTPException(400, "Vetting for this application is finished")
    st = app.stages[index] if 0 <= index < len(app.stages) else None
    if st and st["status"] == "active":
        return stage_href(app, index)
    if st is None or index != current_index(app) or st["status"] != "ready":
        raise HTTPException(400, "This stage isn't open yet")
    d = app.job.stages[index]
    started = v.now()
    if d["type"] == "interview":
        session = interviews.start(interviews.StartIn(kind=d["kind"], role=app.job.role,
                                                      level=LEVEL_FOR_INTERVIEW.get(app.job.seniority, "Mid-level"),
                                                      language=app.job.language if app.job.language in ("python", "javascript") else "python"),
                                   user, db)
        st["ref"] = session["id"]
    elif d["type"] == "project":
        project = q.project(db, d["project"]) if d.get("project") else v.pick_project(db, app.job.role)
        if not project:
            raise HTTPException(503, "No take-home projects are available yet")
        st["ref"] = project["id"]
        st["deadline"] = (started + timedelta(days=d.get("days", PROJECT_DAYS))).isoformat()
    st.update(status="active", started_at=started.isoformat())
    flag_modified(app, "stages")
    db.commit()
    return stage_href(app, index)


def finish(db: Session, app: JobApplication, passed: bool) -> None:
    app.status = "vetted" if passed else "not_selected"
    app.vetted_at = v.now()
    for st in app.stages:
        if st["status"] in ("ready", "locked"):
            st["status"] = "skipped"
    done = [(d, st) for d, st in zip(app.job.stages, app.stages) if st["status"] in ("passed", "failed")]
    scores = [st["score"] or 0 for _, st in done]
    app.score = round(sum(scores) / len(scores), 1) if scores else 0
    app.report = build_report(db, app, passed, done)
    first = (app.user.name or "there").split()[0]
    if passed:
        app.feedback = (f"Thanks {first}, you've completed every vetting step for this role. Our team is reviewing "
                        "the results and will update this application.")
    else:
        failed = next(d for d, st in done if st["status"] == "failed")
        resume_tip = next((st.get("detail", {}).get("feedback") for d, st in done if d["type"] == "resume"), "")
        app.feedback = (f"Thanks {first}. You didn't clear the {failed['title'].lower()} for this role, so we're not "
                        f"moving forward this time. {resume_tip} You're welcome to apply for other open roles.").strip()


def build_report(db: Session, app: JobApplication, passed: bool, done: list) -> dict:
    """Admin-only summary: scores per stage, fit, strengths, risks and a recommendation."""
    evidence = "\n".join(f"- {d['title']}: {st['score']:.0f} (pass {pass_mark(db, d)}), "
                         f"{'passed' if st['status'] == 'passed' else 'failed'}. {st.get('note', '')[:300]}"
                         for d, st in done)
    margin = min(((st["score"] or 0) - pass_mark(db, d) for d, st in done), default=0)
    default_rec = ("Strong yes" if passed and margin >= 15 else "Yes" if passed and margin >= 5 else
                   "Maybe" if passed else "No")

    def fallback():
        return {"recommendation": default_rec,
                "summary": f"{'Passed' if passed else 'Did not pass'} {len(done)} of {len(app.stages)} stages with an "
                           f"average of {app.score:.0f}.",
                "strengths": [f"{d['title']}: {st['score']:.0f}" for d, st in done if st["status"] == "passed"][:3],
                "risks": [f"{d['title']}: {st['score']:.0f}" for d, st in sorted(done, key=lambda x: x[1]["score"] or 0)
                          if (st["score"] or 0) - pass_mark(db, d) < 10][:3]}

    messages = [
        {"role": "system", "content": "You are a senior technical recruiter writing an internal candidate summary "
                                      "for the hiring team. Honest and specific. Respond only with JSON."},
        {"role": "user", "content": f"Role: {app.job.seniority} {app.job.title}.\nOutcome: "
                                    f"{'completed vetting' if passed else 'failed a stage'}.\nStage results:\n"
                                    f"{evidence}\n\nReturn JSON: recommendation (one of: Strong yes, Yes, Maybe, No), "
                                    "summary (2-3 sentences), strengths (2-3 short items), risks (1-3 short items)."},
    ]
    text, used_ai = ai.chat_json(messages, fallback, max_tokens=700, fast=True)
    base = fallback()
    rec = text.get("recommendation") if text.get("recommendation") in ("Strong yes", "Yes", "Maybe", "No") else base["recommendation"]
    if not passed:
        rec = "No"
    return {"recommendation": rec, "ai": used_ai, "overall_score": app.score,
            "summary": str(text.get("summary") or base["summary"])[:1200],
            "strengths": [str(x)[:200] for x in (text.get("strengths") or base["strengths"])][:4],
            "risks": [str(x)[:200] for x in (text.get("risks") or base["risks"])][:4]}


# ---------------------------------------------------------------- outputs

def poster(job: Job) -> str:
    return job.client_name if job.show_client and job.client_name else "Programming Haven"


def stage_brief(db: Session, d: dict) -> dict:
    out = {"type": d["type"], "title": d["title"]}
    if d["type"] == "interview":
        out["minutes"] = interviews.KINDS[d["kind"]]["minutes"]
    elif d["type"] == "test":
        out["minutes"] = (q.test(db, d["test"]) or {}).get("duration_minutes")
    elif d["type"] == "project":
        out["days"] = d.get("days", PROJECT_DAYS)
    return out


def job_public(db: Session, job: Job) -> dict:
    return {"id": job.id, "title": job.title, "company": poster(job), "location": job.location,
            "employment_type": job.employment_type, "seniority": job.seniority, "salary": job.salary,
            "skills": job.skills or [], "summary": job.summary, "description": job.description,
            "openings": job.openings, "closes_on": job.closes_on.isoformat() if job.closes_on else None,
            "status": job.status, "posted_at": (job.published_at or job.created_at).isoformat(),
            "stages": [stage_brief(db, d) for d in job.stages]}


def job_admin(db: Session, job: Job, counts: dict | None = None) -> dict:
    return {**job_public(db, job), "client_name": job.client_name, "show_client": job.show_client,
            "role": job.role, "language": job.language, "pipeline": job.stages, "counts": counts or {},
            "created_at": job.created_at.isoformat()}


def stage_href(app: JobApplication, i: int) -> str | None:
    d, st = app.job.stages[i], app.stages[i]
    suffix = f"?application={app.id}"
    if not st.get("ref") and d["type"] != "test":
        return None
    if d["type"] == "interview":
        return f"/interview/{st['ref']}{suffix}"
    if d["type"] == "test":
        if st["status"] == "active":
            return f"/tests/{d['test']}{suffix}"
        return f"/tests/result/{st['ref']}{suffix}" if st.get("ref") else None
    if d["type"] == "project":
        return (f"/projects/{st['ref']}/review/{st['submission']}{suffix}" if st.get("submission")
                else f"/projects/{st['ref']}{suffix}")
    return None


def _stage_out(db: Session, app: JobApplication, i: int, admin: bool) -> dict:
    d, st = app.job.stages[i], app.stages[i]
    out = {"index": i, **stage_brief(db, d), "status": st["status"], "started_at": st["started_at"],
           "deadline": st["deadline"], "finished_at": st.get("finished_at"),
           "href": stage_href(app, i) if st["status"] in ("active", "passed", "failed") else None}
    if d["type"] == "project" and st.get("ref"):
        project = q.project(db, st["ref"]) or {}
        out["project_title"] = project.get("title")
    if admin:
        out.update(score=st["score"], pass_mark=pass_mark(db, d), note=st["note"], detail=st.get("detail"))
    return out


def application_out(db: Session, app: JobApplication, admin: bool = False) -> dict:
    out = {"id": app.id, "status": app.status, "status_label": SEEKER_LABEL.get(app.status, app.status),
           "job": {"id": app.job.id, "title": app.job.title, "company": poster(app.job),
                   "seniority": app.job.seniority, "location": app.job.location, "status": app.job.status},
           "current": current_index(app), "stages_total": len(app.stages),
           "stages_done": sum(1 for s in app.stages if s["status"] in ("passed", "failed")),
           "stages": [_stage_out(db, app, i, admin) for i in range(len(app.stages))],
           "feedback": app.feedback if app.status not in ("vetting",) else "",
           "cover_note": app.cover_note, "created_at": app.created_at.isoformat(),
           "updated_at": (app.updated_at or app.created_at).isoformat()}
    if admin:
        profile = _profile(db, app.user_id)
        out.update(score=app.score, report=app.report, admin_note=app.admin_note,
                   vetted_at=app.vetted_at.isoformat() if app.vetted_at else None,
                   candidate={"id": app.user.id, "name": app.user.name, "email": app.user.email,
                              "profile": profile_out(profile) if profile else None})
    return out


def profile_out(p: SeekerProfile | None) -> dict:
    if p is None:
        return {"headline": "", "location": "", "timezone": "", "primary_role": "", "years_experience": None,
                "skills": [], "english_level": "", "availability": "", "expected_rate": "", "summary": "",
                "phone": "", "links": {}, "resume": None, "complete": False, "missing": ["profile"]}
    missing = [k for k, ok in (("headline", p.headline), ("primary role", p.primary_role),
                               ("skills", p.skills), ("years of experience", p.years_experience is not None),
                               ("resume", p.resume_file)) if not ok]
    return {"headline": p.headline, "location": p.location, "timezone": p.timezone, "primary_role": p.primary_role,
            "years_experience": p.years_experience, "skills": p.skills or [], "english_level": p.english_level,
            "availability": p.availability, "expected_rate": p.expected_rate, "summary": p.summary,
            "phone": p.phone, "links": p.links or {},
            "resume": {"name": p.resume_name, "uploaded_at": p.resume_uploaded_at.isoformat()
                       if p.resume_uploaded_at else None, "chars": len(p.resume_text or "")} if p.resume_file else None,
            "complete": not missing, "missing": missing}


def store_resume(db: Session, user: User, filename: str, data: bytes, text: str) -> SeekerProfile:
    profile = db.get(SeekerProfile, user.id) or SeekerProfile(user_id=user.id, skills=[], links={})
    db.add(profile)
    ext = Path(filename).suffix.lower()
    stored = f"{user.id}-{secrets.token_hex(6)}{ext}"
    (resumes_dir() / stored).write_bytes(data)
    if profile.resume_file:
        (resumes_dir() / profile.resume_file).unlink(missing_ok=True)
    profile.resume_file, profile.resume_name = stored, Path(filename).name[:200]
    profile.resume_text = text[:30000]
    profile.resume_uploaded_at = v.now()
    db.commit()
    return profile


def applications_for(db: Session, user: User) -> list[JobApplication]:
    return list(db.scalars(select(JobApplication).where(JobApplication.user_id == user.id)
                           .order_by(JobApplication.id.desc())))
