"""XP, streaks and the Readiness Score."""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, object_session

from ..content import queries as q
from ..models import ActivitySession, InterviewSession, LessonProgress, Submission, TestAttempt, User, XpEvent

XP_LESSON = 20
XP_PROBLEM = {"Easy": 15, "Medium": 30, "Hard": 50, "Expert": 80}
XP_TEST = 50
XP_INTERVIEW = 40
XP_PROJECT = 60
XP_QUESTION = 3

# Readiness targets: how much practice counts as "fully ready" for each pillar
LESSON_TARGET = 40
PROBLEM_TARGET = 50


def touch_activity(user: User) -> None:
    today = date.today()
    if user.last_active == today:
        return
    user.streak = user.streak + 1 if user.last_active == today - timedelta(days=1) else 1
    user.last_active = today


def award(user: User, xp: int) -> None:
    user.xp += xp
    touch_activity(user)
    # Log the event so leagues and group leaderboards can sum XP per week
    session = object_session(user)
    if xp and session is not None:
        session.add(XpEvent(user_id=user.id, amount=xp))


def level_for(xp: int) -> dict:
    level, need, remaining = 1, 100, xp
    while remaining >= need:
        remaining -= need
        level += 1
        need = int(need * 1.25)
    return {"level": level, "into_level": remaining, "level_size": need}


def solved_slugs(db: Session, user_id: int) -> set[str]:
    rows = db.scalars(
        select(Submission.problem_slug).where(Submission.user_id == user_id, Submission.status == "Accepted")
    )
    return set(rows)


def time_summary(db: Session, user_id: int) -> dict:
    today = date.today()
    rows = db.scalars(select(ActivitySession).where(ActivitySession.user_id == user_id,
                                                    ActivitySession.day >= today - timedelta(days=6))).all()
    by_day = {(today - timedelta(days=i)).isoformat(): 0 for i in range(6, -1, -1)}
    by_area: dict[str, int] = {}
    for r in rows:
        by_day[r.day.isoformat()] = by_day.get(r.day.isoformat(), 0) + r.seconds
        by_area[r.area] = by_area.get(r.area, 0) + r.seconds
    total = db.scalar(select(func.coalesce(func.sum(ActivitySession.seconds), 0))
                      .where(ActivitySession.user_id == user_id))
    return {"today_seconds": by_day[today.isoformat()], "week_seconds": sum(by_day.values()),
            "total_seconds": int(total or 0), "by_day": by_day, "by_area": by_area}


def readiness(db: Session, user: User) -> dict:
    lessons_done = db.scalar(select(func.count()).select_from(LessonProgress).where(LessonProgress.user_id == user.id))
    solved = len(solved_slugs(db, user.id))
    lessons_total = len(q.all_lesson_ids(db))
    problems_total = len(q.problems(db))

    attempts = db.scalars(
        select(TestAttempt).where(TestAttempt.user_id == user.id, TestAttempt.finished_at.is_not(None))
    ).all()
    best_by_test: dict[str, float] = {}
    for a in attempts:
        best_by_test[a.test_id] = max(best_by_test.get(a.test_id, 0), a.score or 0)
    # Average of the best scores, discounted until at least 3 different tests are taken
    test_avg = (sum(best_by_test.values()) / len(best_by_test)) * min(1, len(best_by_test) / 3) if best_by_test else 0

    interviews = db.scalars(
        select(InterviewSession).where(InterviewSession.user_id == user.id, InterviewSession.feedback.is_not(None))
    ).all()
    tech = [i.feedback.get("overall_score", 0) for i in interviews if i.kind != "english"]
    english = [i.feedback.get("overall_score", 0) for i in interviews if i.kind == "english"]
    interview_avg = sum(tech) / len(tech) if tech else 0
    english_avg = sum(english) / len(english) if english else 0

    parts = [
        {"key": "language", "label": "Language Mastery", "weight": 20,
         "value": min(1, lessons_done / max(1, min(LESSON_TARGET, lessons_total)))},
        {"key": "dsa", "label": "DSA", "weight": 30,
         "value": min(1, solved / max(1, min(PROBLEM_TARGET, problems_total)))},
        {"key": "tests", "label": "Assessments", "weight": 20, "value": test_avg / 100},
        {"key": "interviews", "label": "Interviews", "weight": 20, "value": interview_avg / 100},
        {"key": "english", "label": "English", "weight": 10, "value": english_avg / 100},
    ]
    score = round(sum(p["weight"] * p["value"] for p in parts))
    for p in parts:
        p["value"] = round(p["value"] * 100)
    return {
        "score": score,
        "verdict": _verdict(score),
        "breakdown": parts,
        "stats": {
            "lessons_completed": lessons_done,
            "lessons_total": lessons_total,
            "problems_solved": solved,
            "problems_total": problems_total,
            "tests_taken": len(attempts),
            "interviews_completed": len(interviews),
        },
    }


def _verdict(score: int) -> str:
    if score >= 80:
        return "Ready to apply"
    if score >= 60:
        return "Almost there"
    if score >= 30:
        return "Building momentum"
    return "Just getting started"


def xp_since(db: Session, user_ids: list[int], since) -> dict[int, int]:
    """Total XP per user earned since a datetime."""
    if not user_ids:
        return {}
    rows = db.execute(select(XpEvent.user_id, func.sum(XpEvent.amount))
                      .where(XpEvent.user_id.in_(user_ids), XpEvent.created_at >= since)
                      .group_by(XpEvent.user_id)).all()
    totals = {uid: 0 for uid in user_ids}
    totals.update({uid: int(total or 0) for uid, total in rows})
    return totals
