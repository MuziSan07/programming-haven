"""Mind Training: drill sessions, daily check-ins, habits, focus time, breathing and mindset lessons.

Mind work earns XP and keeps the streak alive, but XP is capped per day so brain games can't replace real
interview practice on the leaderboards.
"""

import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..models import MindDay, MindHabit, MindSession, User
from . import gamification
from . import mind_drills as drills
from .scoring import award

XP_DAILY_CAP = 60
XP_LESSON = 15
XP_BREATHING = 5
XP_CHECKIN = 3
XP_BEST_BONUS = 5
SESSION_TTL = timedelta(hours=2)
MAX_HABITS = 12
FOCUS_DAILY_CAP = 600  # minutes
LESSON_PREFIX = "lesson:"

BREATHING = [
    {"id": "box", "title": "Box breathing", "steps": [["Inhale", 4], ["Hold", 4], ["Exhale", 4], ["Hold", 4]],
     "use": "A steady rhythm for the minutes before a call. Easy to do without anyone noticing."},
    {"id": "extended-exhale", "title": "Long exhale (4-6)", "steps": [["Inhale", 4], ["Exhale", 6]],
     "use": "An exhale longer than the inhale. Good when your heart is racing before a round."},
    {"id": "sigh", "title": "Double inhale, long sigh", "steps": [["Inhale", 2], ["Top-up inhale", 1], ["Long exhale", 6]],
     "use": "Two inhales through the nose, then a slow exhale through the mouth. A quick reset after a hard question."},
    {"id": "coherent", "title": "Even breathing (5-5)", "steps": [["Inhale", 5], ["Exhale", 5]],
     "use": "Slow, even breathing at about six breaths a minute. Good for a longer wind-down after study."},
]
BREATHING_IDS = {b["id"] for b in BREATHING}
HABIT_SUGGESTIONS = ["Solve one problem before checking social media", "90 minutes of deep work",
                     "Read 10 pages of a technical book", "Sleep before midnight", "30 minutes of exercise",
                     "Speak English out loud for 10 minutes", "No phone in the first hour of the day"]


def today() -> date:
    return date.today()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- day log + XP

def mind_day(db: Session, user: User, day: date | None = None) -> MindDay:
    day = day or today()
    row = db.scalar(select(MindDay).where(MindDay.user_id == user.id, MindDay.day == day))
    if row is None:
        row = MindDay(user_id=user.id, day=day, habits_done=[], note="", xp=0, focus_minutes=0, focus_sessions=0,
                      breathing_sessions=0)
        db.add(row)
        db.flush()
    return row


def grant(user: User, md: MindDay, xp: int) -> int:
    """Award mind XP within the daily cap. Any mind activity counts toward the streak, even at the cap."""
    give = max(0, min(xp, XP_DAILY_CAP - (md.xp or 0)))
    md.xp = (md.xp or 0) + give
    award(user, give)
    return give


def day_out(md: MindDay | None) -> dict:
    if md is None:
        return {"date": today().isoformat(), "mood": None, "energy": None, "nerves": None, "sleep_hours": None,
                "note": "", "habits_done": [], "focus_minutes": 0, "focus_sessions": 0, "breathing_sessions": 0,
                "xp": 0, "checked_in": False}
    return {"date": md.day.isoformat(), "mood": md.mood, "energy": md.energy, "nerves": md.nerves,
            "sleep_hours": md.sleep_hours, "note": md.note or "", "habits_done": md.habits_done or [],
            "focus_minutes": md.focus_minutes or 0, "focus_sessions": md.focus_sessions or 0,
            "breathing_sessions": md.breathing_sessions or 0, "xp": md.xp or 0, "checked_in": md.mood is not None}


def check_in(db: Session, user: User, data: dict) -> dict:
    md = mind_day(db, user)
    first = md.mood is None
    for key in ("mood", "energy", "nerves", "sleep_hours", "note"):
        if key in data and data[key] is not None:
            setattr(md, key, data[key])
    xp = grant(user, md, XP_CHECKIN) if first and md.mood is not None else 0
    db.commit()
    return {"today": day_out(md), "xp": xp}


def log_breathing(db: Session, user: User, pattern: str, seconds: int) -> dict:
    if pattern not in BREATHING_IDS:
        raise HTTPException(404, "Unknown breathing pattern")
    if seconds < 60:
        raise HTTPException(400, "Breathe for at least a minute to log a session")
    md = mind_day(db, user)
    md.breathing_sessions = (md.breathing_sessions or 0) + 1
    xp = grant(user, md, XP_BREATHING) if md.breathing_sessions == 1 else grant(user, md, 0)
    db.commit()
    new_badges = gamification.evaluate(db, user)
    return {"today": day_out(md), "xp": xp, "new_badges": new_badges}


def log_focus(db: Session, user: User, minutes: int, label: str = "") -> dict:
    md = mind_day(db, user)
    room = max(0, FOCUS_DAILY_CAP - (md.focus_minutes or 0))
    counted = min(minutes, room)
    md.focus_minutes = (md.focus_minutes or 0) + counted
    md.focus_sessions = (md.focus_sessions or 0) + 1
    xp = grant(user, md, counted // 5)
    db.commit()
    new_badges = gamification.evaluate(db, user)
    return {"today": day_out(md), "xp": xp, "counted_minutes": counted, "new_badges": new_badges}


# ---------------------------------------------------------------- drills

def _drill_rows(db: Session, user: User) -> list[MindSession]:
    return list(db.scalars(select(MindSession).where(MindSession.user_id == user.id, MindSession.status == "done",
                                                     MindSession.drill.not_like(f"{LESSON_PREFIX}%"))
                           .order_by(MindSession.id)))


def drill_states(db: Session, user: User) -> dict[str, dict]:
    states = {d["id"]: {"level": 1, "best": None, "last": None, "runs": 0, "last_at": None} for d in drills.DRILLS}
    for row in _drill_rows(db, user):
        st = states.get(row.drill)
        if st is None:
            continue
        st["runs"] += 1
        st["best"] = max(st["best"] or 0, row.score)
        st["last"] = row.score
        st["last_at"] = (row.finished_at or row.created_at).isoformat()
        st["level"] = drills.next_level(row.level, row.score)
    return states


def drills_out(db: Session, user: User) -> list[dict]:
    states = drill_states(db, user)
    return [{**d, **states[d["id"]], "max_level": drills.MAX_LEVEL} for d in drills.DRILLS]


def start_drill(db: Session, user: User, drill: str) -> dict:
    if drill not in drills.DRILL_BY_ID:
        raise HTTPException(404, "Unknown drill")
    level = drill_states(db, user)[drill]["level"]
    recent: set[str] = set()
    for row in db.scalars(select(MindSession).where(MindSession.user_id == user.id, MindSession.drill == drill)
                          .order_by(MindSession.id.desc()).limit(4)):
        recent.update((row.items or {}).get("ids", []) if isinstance(row.items, dict) else [])
    generated = drills.generate(drill, secrets.token_hex(8), level, recent)
    session = MindSession(user_id=user.id, drill=drill, level=level, items=generated, day=today(),
                          total=len(generated["answers"]))
    db.add(session)
    db.commit()
    return {"id": session.id, "drill": drill, "level": level, "data": generated["public"],
            "time_limit": drills.TIME_LIMITS.get(drill)}


def finish_drill(db: Session, user: User, session_id: int, answer) -> dict:
    session = db.get(MindSession, session_id)
    if session is None or session.user_id != user.id or session.drill.startswith(LESSON_PREFIX):
        raise HTTPException(404, "Session not found")
    if session.status != "active":
        raise HTTPException(409, "This session is already finished")
    now = datetime.now(timezone.utc)
    elapsed = now - _aware(session.created_at)
    if elapsed > SESSION_TTL:
        raise HTTPException(410, "This session expired. Start a new one.")
    previous_best = drill_states(db, user)[session.drill]["best"]
    result = drills.grade(session.drill, session.items, answer, int(elapsed.total_seconds() * 1000))
    session.status = "done"
    session.score, session.correct, session.total = result["score"], result["correct"], result["total"]
    session.duration_ms = int(result.get("time_ms") or elapsed.total_seconds() * 1000)
    session.details = {"headline": result["headline"], "review": result["review"],
                       **({"mistakes": result["mistakes"]} if "mistakes" in result else {})}
    session.finished_at = now
    personal_best = previous_best is not None and result["score"] > previous_best
    md = mind_day(db, user)
    # An empty or zero-score run still counts for the streak, but earns nothing
    earned = 2 + result["score"] // 10 + (XP_BEST_BONUS if personal_best else 0) if result["score"] else 0
    session.xp = grant(user, md, earned)
    db.commit()
    new_badges = gamification.evaluate(db, user)
    return {"id": session.id, "drill": session.drill, "level": session.level, "score": session.score,
            "correct": session.correct, "total": session.total, "duration_ms": session.duration_ms,
            "headline": result["headline"], "review": result["review"], "xp": session.xp,
            "personal_best": personal_best, "previous_best": previous_best,
            "next_level": drills.next_level(session.level, session.score), "xp_capped": md.xp >= XP_DAILY_CAP,
            "new_badges": new_badges}


def drill_history(db: Session, user: User, drill: str, limit: int = 30) -> list[dict]:
    rows = db.scalars(select(MindSession).where(MindSession.user_id == user.id, MindSession.drill == drill,
                                                MindSession.status == "done")
                      .order_by(MindSession.id.desc()).limit(limit)).all()
    return [{"id": r.id, "score": r.score, "level": r.level, "correct": r.correct, "total": r.total,
             "duration_ms": r.duration_ms, "date": r.day.isoformat(),
             "headline": (r.details or {}).get("headline", "")} for r in reversed(rows)]


# ---------------------------------------------------------------- mindset lessons

def _lesson_passes(db: Session, user: User) -> dict[str, int]:
    rows = db.execute(select(MindSession.drill, func.max(MindSession.score))
                      .where(MindSession.user_id == user.id, MindSession.drill.like(f"{LESSON_PREFIX}%"))
                      .group_by(MindSession.drill)).all()
    return {d[len(LESSON_PREFIX):]: s for d, s in rows}


def lessons_out(db: Session, user: User) -> list[dict]:
    best = _lesson_passes(db, user)
    return [{"id": l["id"], "title": l["title"], "minutes": l["minutes"], "summary": l["summary"],
             "best": best.get(l["id"]), "passed": best.get(l["id"], 0) >= 100}
            for l in drills.content("mindset")]


def _lesson(lesson_id: str) -> dict:
    lesson = next((l for l in drills.content("mindset") if l["id"] == lesson_id), None)
    if lesson is None:
        raise HTTPException(404, "Lesson not found")
    return lesson


def lesson_out(db: Session, user: User, lesson_id: str) -> dict:
    lesson = _lesson(lesson_id)
    best = _lesson_passes(db, user).get(lesson_id)
    ids = [l["id"] for l in drills.content("mindset")]
    i = ids.index(lesson_id)
    return {"id": lesson["id"], "title": lesson["title"], "minutes": lesson["minutes"], "summary": lesson["summary"],
            "body": lesson["body"], "best": best, "passed": (best or 0) >= 100,
            "checks": [{"prompt": c["prompt"], "options": c["options"]} for c in lesson["checks"]],
            "next": ids[i + 1] if i + 1 < len(ids) else None}


def submit_lesson(db: Session, user: User, lesson_id: str, answers: list) -> dict:
    lesson = _lesson(lesson_id)
    checks = lesson["checks"]
    already = _lesson_passes(db, user).get(lesson_id, 0) >= 100
    review, correct = [], 0
    for i, c in enumerate(checks):
        given = answers[i] if i < len(answers) else None
        ok = given == c["answer"]
        correct += ok
        review.append({"prompt": c["prompt"], "expected": c["options"][c["answer"]],
                       "given": c["options"][given] if isinstance(given, int) and 0 <= given < len(c["options"]) else None,
                       "correct": ok, "why": c["why"]})
    score = round(correct / len(checks) * 100)
    md = mind_day(db, user)
    passed = score >= 100
    xp = grant(user, md, XP_LESSON if passed and not already else 0)
    db.add(MindSession(user_id=user.id, drill=f"{LESSON_PREFIX}{lesson_id}", status="done", level=1, items={},
                       score=score, correct=correct, total=len(checks), day=today(), xp=xp,
                       finished_at=datetime.now(timezone.utc), details={"headline": f"{correct} of {len(checks)}"}))
    db.commit()
    new_badges = gamification.evaluate(db, user)
    return {"score": score, "correct": correct, "total": len(checks), "passed": passed, "xp": xp,
            "review": review, "new_badges": new_badges}


# ---------------------------------------------------------------- habits

def _habit_days(db: Session, user: User, days: int = 120) -> dict[date, set[int]]:
    rows = db.scalars(select(MindDay).where(MindDay.user_id == user.id,
                                            MindDay.day >= today() - timedelta(days=days)))
    return {r.day: set(r.habits_done or []) for r in rows}


def _streak(days_done: set[date]) -> int:
    day = today()
    if day not in days_done:
        day -= timedelta(days=1)
    n = 0
    while day in days_done:
        n += 1
        day -= timedelta(days=1)
    return n


def habits_out(db: Session, user: User) -> list[dict]:
    log = _habit_days(db, user)
    out = []
    for h in db.scalars(select(MindHabit).where(MindHabit.user_id == user.id, MindHabit.archived.is_(False))
                        .order_by(MindHabit.id)):
        done_days = {d for d, ids in log.items() if h.id in ids}
        last7 = [(today() - timedelta(days=i)) for i in range(6, -1, -1)]
        out.append({"id": h.id, "title": h.title, "done_today": today() in done_days, "streak": _streak(done_days),
                    "week": [{"date": d.isoformat(), "done": d in done_days} for d in last7],
                    "total": len(done_days)})
    return out


def add_habit(db: Session, user: User, title: str) -> dict:
    title = " ".join(title.split())
    if not title:
        raise HTTPException(400, "Give the habit a name")
    active = db.scalar(select(func.count()).select_from(MindHabit)
                       .where(MindHabit.user_id == user.id, MindHabit.archived.is_(False)))
    if active >= MAX_HABITS:
        raise HTTPException(400, f"Keep it to {MAX_HABITS} habits or fewer. Archive one first.")
    db.add(MindHabit(user_id=user.id, title=title[:80]))
    db.commit()
    return {"habits": habits_out(db, user)}


def _own_habit(db: Session, user: User, habit_id: int) -> MindHabit:
    habit = db.get(MindHabit, habit_id)
    if habit is None or habit.user_id != user.id or habit.archived:
        raise HTTPException(404, "Habit not found")
    return habit


def archive_habit(db: Session, user: User, habit_id: int) -> dict:
    _own_habit(db, user, habit_id).archived = True
    db.commit()
    return {"habits": habits_out(db, user)}


def toggle_habit(db: Session, user: User, habit_id: int) -> dict:
    _own_habit(db, user, habit_id)
    md = mind_day(db, user)
    done = list(md.habits_done or [])
    if habit_id in done:
        done.remove(habit_id)
        xp = 0
    else:
        done.append(habit_id)
        xp = grant(user, md, 2)
    md.habits_done = done
    flag_modified(md, "habits_done")
    db.commit()
    return {"habits": habits_out(db, user), "today": day_out(md), "xp": xp}


# ---------------------------------------------------------------- overview + stats

def active_days(db: Session, user_id: int, since: date | None = None) -> set[date]:
    """Days with any mind activity: a finished drill or lesson, a check-in, breathing or focus time."""
    q1 = select(MindSession.day).where(MindSession.user_id == user_id, MindSession.status == "done")
    q2 = select(MindDay.day).where(MindDay.user_id == user_id, (MindDay.mood.is_not(None))
                                   | (MindDay.breathing_sessions > 0) | (MindDay.focus_minutes > 0))
    if since:
        q1, q2 = q1.where(MindSession.day >= since), q2.where(MindDay.day >= since)
    return set(db.scalars(q1)) | set(db.scalars(q2))


def overview(db: Session, user: User) -> dict:
    md = db.scalar(select(MindDay).where(MindDay.user_id == user.id, MindDay.day == today()))
    start = today() - timedelta(days=13)
    days = {r.day: r for r in db.scalars(select(MindDay).where(MindDay.user_id == user.id, MindDay.day >= start))}
    runs = {}
    for d, n in db.execute(select(MindSession.day, func.count()).where(
            MindSession.user_id == user.id, MindSession.status == "done", MindSession.day >= start)
            .group_by(MindSession.day)):
        runs[d] = n
    trend = []
    for i in range(13, -1, -1):
        d = today() - timedelta(days=i)
        r = days.get(d)
        trend.append({"date": d.isoformat(), "runs": runs.get(d, 0), "mood": r.mood if r else None,
                      "nerves": r.nerves if r else None, "sleep_hours": r.sleep_hours if r else None,
                      "focus_minutes": r.focus_minutes if r else 0, "xp": r.xp if r else 0})
    totals = db.execute(select(func.coalesce(func.sum(MindDay.focus_minutes), 0),
                               func.coalesce(func.sum(MindDay.breathing_sessions), 0))
                        .where(MindDay.user_id == user.id)).one()
    return {
        "today": day_out(md),
        "xp_cap": XP_DAILY_CAP,
        "streak": _streak(active_days(db, user.id, today() - timedelta(days=400))),
        "drills": drills_out(db, user),
        "lessons": lessons_out(db, user),
        "habits": habits_out(db, user),
        "habit_suggestions": HABIT_SUGGESTIONS,
        "breathing": BREATHING,
        "trend": trend,
        "totals": {"drills": len(_drill_rows(db, user)), "focus_minutes": int(totals[0]),
                   "breathing_sessions": int(totals[1])},
    }


def badge_metrics(db: Session, user_id: int) -> dict[str, int]:
    rows = db.execute(select(MindSession.drill, MindSession.score).where(
        MindSession.user_id == user_id, MindSession.status == "done")).all()
    drill_rows = [(d, s) for d, s in rows if not d.startswith(LESSON_PREFIX)]
    lessons = {d for d, s in rows if d.startswith(LESSON_PREFIX) and s >= 100}
    totals = db.execute(select(func.coalesce(func.sum(MindDay.focus_minutes), 0),
                               func.coalesce(func.sum(MindDay.breathing_sessions), 0))
                        .where(MindDay.user_id == user_id)).one()
    return {"mind_drills": len(drill_rows), "mind_elite": len({d for d, s in drill_rows if s >= 90}),
            "breathing": int(totals[1]), "focus_hours": int(totals[0]) // 60, "mindset_lessons": len(lessons)}
