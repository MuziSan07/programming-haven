from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import InterviewSession, Submission, TestAttempt, User
from ..routers.auth import user_out
from ..routers.interviews import KINDS
from ..routers.learn import completed_ids
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

    return {
        "user": user_out(user),
        "readiness": readiness(db, user),
        "next_lesson": _next_lesson(db, done),
        "time": time_summary(db, user.id),
        "next_problem": next_problem,
        "activity": activity[:8],
    }
