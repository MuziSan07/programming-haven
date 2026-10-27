from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import Flashcard, InterviewSession, StudyPlan, Submission, TestAttempt, User
from ..routers.auth import user_out
from ..routers.interviews import KINDS
from ..routers.learn import completed_ids
from ..services import coach, leagues
from ..services.gamification import evaluate
from ..services.scoring import readiness, solved_slugs, time_summary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _next_lesson(db: Session, done: set[str]) -> dict | None:
    for t in q.tracks(db):
        units = {u["id"]: u["title"] for u in t.get("units", [])}
        for lesson in q.track_lessons(db, t["id"]):
            if lesson["id"] not in done:
                return {"id": lesson["id"], "title": lesson["title"], "path": t["title"],
                        "unit": units.get(lesson["unit_id"], "")}
    return None


@router.get("")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    done = completed_ids(db, user.id)
    solved = solved_slugs(db, user.id)
    next_problem = next(({"slug": p["slug"], "title": p["title"], "difficulty": p["difficulty"],
                          "pattern": p["pattern"]} for p in q.problems(db)
                         if p["slug"] not in solved and not p["slug"].startswith("oa-")), None)

    activity = []
    for s in db.scalars(select(Submission).where(Submission.user_id == user.id)
                        .order_by(Submission.id.desc()).limit(6)):
        activity.append({"type": "submission", "title": (q.problem(db, s.problem_slug) or {}).get("title", s.problem_slug),
                         "detail": s.status, "good": s.status == "Accepted", "at": s.created_at.isoformat()})
    for a in db.scalars(select(TestAttempt).where(TestAttempt.user_id == user.id, TestAttempt.finished_at.is_not(None))
                        .order_by(TestAttempt.id.desc()).limit(4)):
        activity.append({"type": "test", "title": (q.test(db, a.test_id) or {}).get("title", a.test_id),
                         "detail": f"{a.score:.0f}%",
                         "good": a.result.get("passed", False), "at": a.finished_at.isoformat(),
                         "href": f"/tests/result/{a.id}"})
    for i in db.scalars(select(InterviewSession).where(InterviewSession.user_id == user.id,
                                                       InterviewSession.feedback.is_not(None))
                        .order_by(InterviewSession.id.desc()).limit(4)):
        activity.append({"type": "interview", "title": KINDS[i.kind]["title"],
                         "detail": f"{i.feedback.get('overall_score', 0)}/100", "good":
                             i.feedback.get("overall_score", 0) >= 70, "at": i.created_at.isoformat(),
                         "href": f"/interview/{i.id}"})
    activity.sort(key=lambda x: x["at"], reverse=True)

    new_badges = evaluate(db, user)
    plan = db.scalar(select(StudyPlan).where(StudyPlan.user_id == user.id, StudyPlan.active.is_(True))
                     .order_by(StudyPlan.id.desc()))
    today_plan = None
    if plan:
        if coach.sync_done(db, user, plan):
            db.commit()
        day = next((d for w in plan.plan.get("weeks", []) for d in w["days"] if d["date"] == date.today().isoformat()),
                   None)
        today_plan = {"target_label": plan.target_label, "tasks": day["tasks"] if day else [],
                      "stats": coach.plan_stats(plan, date.today())}
    league = leagues.standings(db, user)
    db.commit()
    me = next((r for r in league["standings"] if r["me"]), None)
    due_cards = db.scalar(select(func.count()).select_from(Flashcard).where(
        Flashcard.user_id == user.id, Flashcard.due_at <= datetime.now(timezone.utc)))

    return {
        "user": user_out(user),
        "new_badges": new_badges,
        "today_plan": today_plan,
        "league": {"tier_name": league["tier_name"], "tier_color": league["tier_color"],
                   "rank": me["rank"] if me else None, "week_xp": me["xp"] if me else 0,
                   "size": len(league["standings"]), "zone": me["zone"] if me else "safe"},
        "flashcards_due": int(due_cards or 0),
        "readiness": readiness(db, user),
        "next_lesson": _next_lesson(db, done),
        "time": time_summary(db, user.id),
        "next_problem": next_problem,
        "activity": activity[:8],
    }
