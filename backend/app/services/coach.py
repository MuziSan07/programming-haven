"""AI career coach: weak-spot analysis and a day-by-day study plan for a chosen hiring network.

The plan itself is built deterministically from real content and progress (so it always works offline);
the AI writes the coaching notes and weekly adjustments on top of it.
"""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..content import queries as q
from ..content import store
from ..models import InterviewSession, LessonProgress, QuestionAttempt, RoundAttempt, StudyPlan, TestAttempt, User
from . import ai
from .scoring import solved_slugs

# Category weights describe what each network's pipeline actually tests
TARGETS = {
    "toptal": {"label": "Toptal", "pipeline": ["English & culture call", "Timed Codility algorithms", "Live coding",
                                                "Test project"],
               "weights": {"dsa": 0.36, "interview": 0.16, "english": 0.12, "project": 0.12, "questions": 0.1,
                           "lesson": 0.08, "debug": 0.06},
               "tests": ["toptal-style-algorithm-screen", "codility-advanced-edge-cases", "algorithms-sprint"],
               "interviews": ["live-coding", "english", "technical", "system-design"]},
    "turing": {"label": "Turing", "pipeline": ["Tech stack MCQ tests", "Timed coding challenge", "Soft-skills vetting"],
               "weights": {"questions": 0.3, "dsa": 0.28, "lesson": 0.12, "test": 0.1, "interview": 0.1,
                           "english": 0.06, "debug": 0.04},
               "tests": ["turing-style-deep-dive", "python-dev-assessment", "javascript-fundamentals"],
               "interviews": ["technical", "behavioral", "english"]},
    "lemon": {"label": "Lemon.io", "pipeline": ["Profile screening", "English soft-skill call",
                                                "Technical interview with live coding"],
              "weights": {"questions": 0.22, "interview": 0.22, "dsa": 0.18, "english": 0.14, "debug": 0.1,
                          "review": 0.08, "lesson": 0.06},
              "tests": ["lemon-io-senior-screen", "backend-engineer-test", "frontend-engineer-test"],
              "interviews": ["technical", "live-coding", "english", "behavioral"]},
    "ateam": {"label": "A.Team", "pipeline": ["Profile & portfolio", "Product-minded builder interview",
                                              "System design"],
              "weights": {"system": 0.24, "interview": 0.18, "project": 0.18, "review": 0.14, "questions": 0.12,
                          "dsa": 0.08, "english": 0.06},
              "tests": ["backend-engineer-test", "cs-fundamentals-gauntlet"],
              "interviews": ["system-design", "behavioral", "technical"]},
    "braintrust": {"label": "Braintrust", "pipeline": ["Profile review", "AI screening interview",
                                                       "Client interviews"],
                   "weights": {"interview": 0.28, "questions": 0.22, "english": 0.16, "project": 0.12, "dsa": 0.1,
                               "review": 0.06, "lesson": 0.06},
                   "tests": ["backend-engineer-test", "frontend-engineer-test"],
                   "interviews": ["technical", "behavioral", "english"]},
    "remote": {"label": "Remote US/UK/EU jobs", "pipeline": ["Online assessment", "DSA rounds", "System design",
                                                              "Behavioral"],
               "weights": {"dsa": 0.36, "system": 0.14, "interview": 0.12, "test": 0.1, "questions": 0.1,
                           "review": 0.08, "debug": 0.06, "lesson": 0.04},
               "tests": ["google-style-oa", "amazon-style-oa", "meta-style-coding-screen", "microsoft-style-coding-round"],
               "interviews": ["live-coding", "behavioral", "system-design", "technical"]},
}

ROLE_TOPICS = {
    "Frontend": ["JavaScript", "React", "TypeScript", "Web & HTTP", "Testing & QA"],
    "Backend": ["Databases & SQL", "API Design", "System Design", "Node.js", "Security"],
    "Full Stack": ["JavaScript", "React", "Databases & SQL", "API Design", "Web & HTTP"],
    "Mobile": ["Mobile Development", "TypeScript", "API Design", "Testing & QA"],
    "Data": ["Data Science", "Machine Learning", "Python", "Databases & SQL"],
    "AI": ["Machine Learning", "Data Science", "Python", "System Design"],
    "DevOps": ["Cloud & DevOps", "Operating Systems", "Computer Networks", "Security"],
}
LANG_TOPIC = {"python": "Python", "javascript": "JavaScript", "typescript": "TypeScript", "java": "Java",
              "cpp": "C++", "go": "Go"}
ROLE_NICHE = {"Frontend": "Frontend", "Backend": "Backend", "Full Stack": "Full Stack", "Mobile": "Mobile",
              "Data": "Data Science", "AI": "AI", "DevOps": "DevOps"}
PROBLEM_MINUTES = {"Easy": 20, "Medium": 35, "Hard": 50, "Expert": 60}
LEVEL_RANK = {"Easy": 0, "Medium": 1, "Hard": 2, "Expert": 3}
PREFIX = {"lesson": "l:", "problem": "p:", "test": "t:", "debug": "r:", "review": "r:"}


def role_key(role: str) -> str:
    for key in ROLE_TOPICS:
        if key.lower() in (role or "").lower():
            return key
    return "Full Stack"


# ---------------------------------------------------------------- analysis

def analyse(db: Session, user: User) -> dict:
    """Score each skill area 0-100 from real activity. Areas with no data count as weak (score 0)."""
    solved = solved_slugs(db, user.id)
    problems = q.problems(db)
    by_pattern: dict[str, list[int]] = {}
    for p in problems:
        if p["slug"].startswith("oa-"):
            continue
        s = by_pattern.setdefault(p["pattern"].split(" / ")[0], [0, 0])
        s[1] += 1
        s[0] += p["slug"] in solved
    attempts = db.scalars(select(QuestionAttempt).where(QuestionAttempt.user_id == user.id)).all()
    items = {it["id"]: it for it in q.questions(db)}
    topic_stats: dict[str, list[int]] = {}
    for a in attempts:
        it = items.get(a.question_id)
        if it:
            t = topic_stats.setdefault(it["topic"], [0, 0])
            t[0] += a.correct
            t[1] += 1
    interviews = db.scalars(select(InterviewSession).where(InterviewSession.user_id == user.id,
                                                           InterviewSession.feedback.is_not(None))).all()
    by_kind: dict[str, list[float]] = {}
    for i in interviews:
        by_kind.setdefault(i.kind, []).append((i.feedback or {}).get("overall_score", 0))
    tests = db.scalars(select(TestAttempt).where(TestAttempt.user_id == user.id,
                                                 TestAttempt.finished_at.is_not(None))).all()
    rounds = db.scalars(select(RoundAttempt).where(RoundAttempt.user_id == user.id,
                                                   RoundAttempt.submitted_at.is_not(None))).all()

    def avg(xs):
        return round(sum(xs) / len(xs)) if xs else 0

    areas = {
        "dsa": min(100, round(100 * len(solved) / 40)),
        "questions": avg([100 * c / n for c, n in topic_stats.values() if n]),
        "interview": avg([avg(v) for k, v in by_kind.items() if k not in ("english", "system-design", "whiteboard")]),
        "english": avg(by_kind.get("english", [])),
        "system": avg(by_kind.get("system-design", []) + by_kind.get("whiteboard", [])),
        "test": avg([t.score or 0 for t in tests]),
        "debug": avg([r.score or 0 for r in rounds if r.kind == "debug"]),
        "review": avg([r.score or 0 for r in rounds if r.kind == "review"]),
    }
    weak_patterns = sorted(by_pattern, key=lambda k: (by_pattern[k][0] / max(1, by_pattern[k][1]), k))[:5]
    weak_topics = sorted(topic_stats, key=lambda k: topic_stats[k][0] / max(1, topic_stats[k][1]))[:5]
    return {"areas": areas, "weak_patterns": weak_patterns, "weak_topics": weak_topics,
            "solved": len(solved), "questions_answered": len(attempts), "interviews": len(interviews),
            "tests": len(tests)}


# ---------------------------------------------------------------- plan building

class _Picker:
    """Hands out the next suitable content item per category without repeats."""

    def __init__(self, db: Session, user: User, target: dict, language: str, analysis: dict):
        self.db, self.user, self.target, self.language = db, user, target, language
        self.used: set[str] = set()
        self.solved = solved_slugs(db, user.id)
        self.done_lessons = set(db.scalars(select(LessonProgress.lesson_id).where(LessonProgress.user_id == user.id)))
        rounds = db.scalars(select(RoundAttempt).where(RoundAttempt.user_id == user.id, RoundAttempt.passed.is_(True)))
        self.done_rounds = {r.round_id for r in rounds}
        self.passed_tests = {t.test_id for t in db.scalars(select(TestAttempt).where(
            TestAttempt.user_id == user.id, TestAttempt.finished_at.is_not(None))) if (t.result or {}).get("passed")}
        self.weak_patterns = analysis["weak_patterns"]
        role = role_key(user.target_role)
        topics = [LANG_TOPIC.get(language, "Python"), "Data Structures & Algorithms"] + ROLE_TOPICS[role]
        self.topics = list(dict.fromkeys(analysis["weak_topics"][:2] + topics))
        self.niche = ROLE_NICHE[role]
        self.topic_i = self.interview_i = 0
        self.project = None
        self.project_part = 0

    def _take(self, key: str) -> bool:
        if key in self.used:
            return False
        self.used.add(key)
        return True

    def lesson(self, progress: float):
        for les in q.track_lessons(self.db, self.language):
            if les["id"] not in self.done_lessons and self._take("l:" + les["id"]):
                return {"type": "lesson", "ref": les["id"], "title": les["title"], "minutes": les.get("minutes", 10),
                        "href": f"/learn/lesson/{les['id']}"}
        return None

    def dsa(self, progress: float):
        # Early weeks favour Easy/Medium in weak patterns; later weeks push Medium/Hard
        hi = 1 if progress < 0.34 else 2 if progress < 0.75 else 3
        lo = 0 if progress < 0.5 else 1
        pool = [p for p in q.problems(self.db) if not p["slug"].startswith("oa-") and p["slug"] not in self.solved
                and lo <= LEVEL_RANK.get(p["difficulty"], 1) <= hi and "p:" + p["slug"] not in self.used]
        if not pool:
            pool = [p for p in q.problems(self.db) if p["slug"] not in self.solved and "p:" + p["slug"] not in self.used
                    and not p["slug"].startswith("oa-")]
        if not pool:
            return None
        weak = {w: i for i, w in enumerate(self.weak_patterns)}
        pool.sort(key=lambda p: (weak.get(p["pattern"].split(" / ")[0], 99), LEVEL_RANK.get(p["difficulty"], 1),
                                 p["slug"]))
        # Rotate through patterns so one week isn't all the same topic
        p = pool[len(self.used) % min(len(pool), 6)]
        self._take("p:" + p["slug"])
        return {"type": "problem", "ref": p["slug"], "title": f"{p['title']} ({p['difficulty']}, {p['pattern']})",
                "minutes": PROBLEM_MINUTES.get(p["difficulty"], 35), "href": f"/dsa/{p['slug']}"}

    def questions(self, progress: float):
        topic = self.topics[self.topic_i % len(self.topics)]
        self.topic_i += 1
        return {"type": "questions", "ref": topic, "title": f"Answer 5 {topic} interview questions", "minutes": 15,
                "href": f"/questions?topic={topic}"}

    def interview(self, progress: float, kinds: list[str] | None = None):
        kinds = kinds or [k for k in self.target["interviews"] if k not in ("english", "system-design")] or ["technical"]
        kind = kinds[self.interview_i % len(kinds)]
        self.interview_i += 1
        label = {"technical": "Technical", "live-coding": "Live coding", "behavioral": "Behavioral / HR",
                 "english": "English proficiency", "system-design": "System design",
                 "whiteboard": "System design whiteboard"}.get(kind, kind)
        return {"type": "interview", "ref": kind, "title": f"{label} mock interview", "minutes": 30,
                "href": f"/interview?kind={kind}"}

    def english(self, progress: float):
        return self.interview(progress, ["english"])

    def system(self, progress: float):
        return self.interview(progress, ["whiteboard", "system-design"])

    def test(self, progress: float):
        ids = self.target["tests"] + [t["id"] for t in q.tests(self.db)]
        for tid in ids:
            t = q.test(self.db, tid)
            if t and tid not in self.passed_tests and self._take("t:" + tid):
                return {"type": "test", "ref": tid, "title": f"Mock test: {t['title']}",
                        "minutes": t.get("duration_minutes", 60), "href": f"/tests/{tid}"}
        return None

    def _round(self, kind: str):
        langs = {"python": 0, "javascript": 1, "typescript": 1} if kind == "debug" else {self.language: 0}
        items = [r for r in store.all_items(self.db, kind) if r["id"] not in self.done_rounds
                 and "r:" + r["id"] not in self.used]
        items.sort(key=lambda r: (langs.get(r["language"], 2 if kind == "review" else 0) if kind == "review"
                                  else (r["language"] != self.language), LEVEL_RANK.get(r["difficulty"], 1)))
        if not items:
            return None
        r = items[0]
        self._take("r:" + r["id"])
        noun = "Debugging round" if kind == "debug" else "Code review"
        return {"type": kind, "ref": r["id"], "title": f"{noun}: {r['title']}", "minutes": r.get("time_minutes", 20),
                "href": f"/rounds/{kind}/{r['id']}"}

    def debug(self, progress: float):
        return self._round("debug")

    def review(self, progress: float):
        return self._round("review")

    def project_task(self, progress: float):
        if self.project is None:
            options = [p for p in q.projects(self.db) if p.get("niche") == self.niche] or q.projects(self.db)
            options.sort(key=lambda p: (p.get("level") != "Intermediate", p.get("hours", 8)))
            self.project = options[0] if options else False
        if not self.project:
            return None
        self.project_part += 1
        return {"type": "project", "ref": self.project["id"],
                "title": f"Take-home: {self.project['title']} (session {self.project_part})", "minutes": 60,
                "href": f"/projects/{self.project['id']}"}

    def flashcards(self):
        return {"type": "flashcards", "ref": "due", "title": "Review due flashcards", "minutes": 10,
                "href": "/flashcards"}


def build_days(db: Session, user: User, target_id: str, language: str, start: date, weeks: int,
               hours_per_week: int, from_day: date | None = None, analysis: dict | None = None,
               keep: dict[str, list] | None = None) -> list[dict]:
    """Return plan weeks. Days before `from_day` are taken from `keep` (an existing plan's days by date)."""
    target = TARGETS[target_id]
    analysis = analysis or analyse(db, user)
    picker = _Picker(db, user, target, language, analysis)
    keep = keep or {}
    for tasks in keep.values():
        for t in tasks:
            picker.used.add(PREFIX.get(t["type"], "x:") + t["ref"])
    daily = hours_per_week * 60 / 6  # six study days, the seventh is a light review day
    out = []
    for w in range(weeks):
        progress = w / max(1, weeks - 1)
        weights = dict(target["weights"])
        # Shift from learning to simulation as the plan goes on, and boost weak areas
        if "lesson" in weights:
            weights["lesson"] *= 1.6 - progress * 1.2
        for k in ("interview", "test", "system", "english"):
            if k in weights:
                weights[k] *= 0.6 + progress
        for k in weights:
            weights[k] *= 1.6 - analysis["areas"].get(k, 50) / 100 if k in analysis["areas"] else 1
        total = sum(weights.values())
        weights = {k: v / total for k, v in weights.items()}
        used_minutes = {k: 0.0 for k in weights}
        week_days = []
        for d in range(7):
            day = start + timedelta(days=w * 7 + d)
            key = day.isoformat()
            if from_day and day < from_day:
                week_days.append({"date": key, "tasks": keep.get(key, [])})
                continue
            tasks = [picker.flashcards()]
            if d == 6:
                tasks.append(picker.questions(progress))
                week_days.append({"date": key, "rest": True, "tasks": tasks})
                continue
            budget, spent, interviews = daily, 10, 0
            tried = 0
            while spent < budget - 10 and tried < 25:
                tried += 1
                # Pick the category furthest behind its share of the week
                week_spent = sum(used_minutes.values()) + 1
                cat = max(weights, key=lambda k: weights[k] - used_minutes[k] / week_spent)
                if cat in ("interview", "english", "system") and interviews:
                    used_minutes[cat] += 10
                    continue
                if cat == "test" and (d != 5 or budget < 45):
                    used_minutes[cat] += 10
                    continue
                maker = getattr(picker, "project_task" if cat == "project" else cat)
                task = maker(progress)
                if task is None:
                    weights[cat] = 0
                    continue
                if spent + task["minutes"] > budget + 20 and spent > 10:
                    used_minutes[cat] += 5
                    picker.used.discard(PREFIX.get(task["type"], "x:") + task["ref"])
                    break
                interviews += cat in ("interview", "english", "system")
                tasks.append(task)
                spent += task["minutes"]
                used_minutes[cat] += task["minutes"]
            week_days.append({"date": key, "tasks": tasks})
        for di, day in enumerate(week_days):
            for ti, t in enumerate(day["tasks"]):
                t.setdefault("id", f"w{w}d{di}t{ti}-{t['type']}-{t['ref']}"[:120])
                t.setdefault("done", False)
        out.append({"week": w + 1, "focus": _focus(progress, target), "days": week_days})
    return out


def _focus(progress: float, target: dict) -> str:
    if progress < 0.25:
        return "Foundations: language fluency and core patterns"
    if progress < 0.55:
        return "Pattern depth: medium problems, weak topics and debugging"
    if progress < 0.85:
        return f"Simulation: {target['pipeline'][1 if len(target['pipeline']) > 1 else 0]} and mock interviews"
    return "Final sprint: full mock pipeline, timing and polish"


# ---------------------------------------------------------------- progress + notes

def sync_done(db: Session, user: User, plan: StudyPlan) -> bool:
    """Mark tasks done automatically from real activity. Returns True if anything changed."""
    solved = solved_slugs(db, user.id)
    lessons = set(db.scalars(select(LessonProgress.lesson_id).where(LessonProgress.user_id == user.id)))
    rounds = {r.round_id for r in db.scalars(select(RoundAttempt).where(RoundAttempt.user_id == user.id,
                                                                        RoundAttempt.submitted_at.is_not(None)))}
    tests = {t.test_id for t in db.scalars(select(TestAttempt).where(TestAttempt.user_id == user.id,
                                                                     TestAttempt.finished_at.is_not(None)))}
    done_sets = {"problem": solved, "lesson": lessons, "debug": rounds, "review": rounds, "test": tests}
    changed = False
    data = plan.plan
    for week in data.get("weeks", []):
        for day in week["days"]:
            for t in day["tasks"]:
                if not t.get("done") and t["ref"] in done_sets.get(t["type"], ()):
                    t["done"] = True
                    t["auto"] = True
                    changed = True
    if changed:
        flag_modified(plan, "plan")
    return changed


def plan_stats(plan: StudyPlan, today: date) -> dict:
    tasks = [(d["date"], t) for w in plan.plan.get("weeks", []) for d in w["days"] for t in d["tasks"]]
    past = [t for day, t in tasks if day <= today.isoformat()]
    return {"total": len(tasks), "done": sum(t.get("done", False) for _, t in tasks),
            "due_so_far": len(past), "done_so_far": sum(t.get("done", False) for t in past),
            "on_track": sum(t.get("done", False) for t in past) >= 0.7 * len(past) if past else True}


def coach_note(user: User, plan: StudyPlan, analysis: dict, week: int, adherence: dict) -> dict:
    target = TARGETS.get(plan.target, TARGETS["remote"])
    messages = [
        {"role": "system", "content": "You are a blunt but encouraging career coach who has placed hundreds of "
                                      "engineers through Toptal, Turing, Lemon.io, A.Team, Braintrust and remote "
                                      "FAANG-style pipelines. Respond only with JSON."},
        {"role": "user", "content": f"Candidate: {user.name}, aiming for {target['label']} as a {user.target_role}.\n"
                                    f"Pipeline: {', '.join(target['pipeline'])}.\nPlan: {plan.weeks} weeks, "
                                    f"{plan.hours_per_week} h/week, now in week {week}.\n"
                                    f"Skill scores 0-100 (0 = no data yet): {analysis['areas']}\n"
                                    f"Weak DSA patterns: {analysis['weak_patterns']}\n"
                                    f"Weak question topics: {analysis['weak_topics']}\n"
                                    f"Adherence so far: {adherence['done_so_far']}/{adherence['due_so_far']} tasks.\n\n"
                                    "Return JSON: headline (max 12 words), summary (2-3 sentences, specific), "
                                    "priorities (array of 3 short actionable items for this week), "
                                    "risk (one sentence on what would fail them in the real pipeline today)."},
    ]
    weakest = sorted(analysis["areas"], key=analysis["areas"].get)[:3]
    names = {"dsa": "DSA", "questions": "interview questions", "interview": "technical interviews",
             "english": "spoken English", "system": "system design", "test": "timed tests", "debug": "debugging",
             "review": "code review"}

    def fallback():
        return {"headline": f"Week {week}: close the gaps that {target['label']} tests first",
                "summary": f"Your weakest areas right now are {', '.join(names[w] for w in weakest)}. The plan "
                           f"front-loads them, then moves into full mock pipelines.",
                "priorities": [f"Daily work on {names[w]}" for w in weakest],
                "risk": f"{target['label']} rejects most candidates at the {target['pipeline'][1 if len(target['pipeline']) > 1 else 0]} stage; "
                        "practise under a timer."}

    note, _ = ai.chat_json(messages, fallback, fast=True)
    return {"week": week, **{k: note.get(k) for k in ("headline", "summary", "priorities", "risk")}}
