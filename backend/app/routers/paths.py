from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content.paths import COMPANY_PATHS, COMPANY_PATHS_BY_SLUG, DISCLAIMER
from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import InterviewSession, LessonProgress, TestAttempt, User
from ..services.scoring import solved_slugs

router = APIRouter(prefix="/api/paths", tags=["paths"])

# How much practice marks a stage as "ready"
LESSONS_FOR_READY = 5
PROBLEMS_FOR_READY = 5
INTERVIEW_SCORE_FOR_READY = 70


def _progress(db: Session, user: User) -> dict:
    lessons = db.scalar(select(func.count()).select_from(LessonProgress).where(LessonProgress.user_id == user.id))
    solved = len(solved_slugs(db, user.id))
    interviews = db.scalars(select(InterviewSession).where(InterviewSession.user_id == user.id,
                                                           InterviewSession.feedback.is_not(None))).all()
    best_interview: dict[str, float] = {}
    for i in interviews:
        best_interview[i.kind] = max(best_interview.get(i.kind, 0), i.feedback.get("overall_score", 0))
    attempts = db.scalars(select(TestAttempt).where(TestAttempt.user_id == user.id,
                                                    TestAttempt.finished_at.is_not(None))).all()
    best_test: dict[str, float] = {}
    for a in attempts:
        best_test[a.test_id] = max(best_test.get(a.test_id, 0), a.score or 0)
    return {"lessons": lessons, "solved": solved, "interview": best_interview, "test": best_test}


def _stage_status(db: Session, module: str, p: dict) -> dict:
    kind, _, target = module.partition(":")
    if kind == "learn":
        value = min(100, round(100 * p["lessons"] / LESSONS_FOR_READY))
        return {"progress": value, "label": f"{p['lessons']}/{LESSONS_FOR_READY} lessons", "href": "/learn"}
    if kind == "dsa":
        value = min(100, round(100 * p["solved"] / PROBLEMS_FOR_READY))
        return {"progress": value, "label": f"{p['solved']}/{PROBLEMS_FOR_READY} problems", "href": "/dsa"}
    if kind == "interview":
        best = p["interview"].get(target)
        value = min(100, round(100 * (best or 0) / INTERVIEW_SCORE_FOR_READY))
        return {"progress": value, "label": f"Best score {round(best)}" if best is not None else "Not attempted",
                "href": f"/interview?kind={target}"}
    if kind == "test":
        best = p["test"].get(target)
        pass_mark = (q.test(db, target) or {}).get("pass_mark", 70)
        value = min(100, round(100 * (best or 0) / pass_mark))
        return {"progress": value, "label": f"Best score {round(best)}%" if best is not None else "Not attempted",
                "href": f"/tests/{target}"}
    return {"progress": 0, "label": "", "href": "/dashboard"}


def _path_out(db: Session, path: dict, p: dict) -> dict:
    stages = [{**s, **_stage_status(db, s["module"], p)} for s in path["stages"]]
    readiness = round(sum(s["progress"] for s in stages) / len(stages))
    return {**{k: path[k] for k in ("slug", "name", "tagline", "accent", "focus")}, "stages": stages,
            "readiness": readiness, "disclaimer": DISCLAIMER}


@router.get("/companies")
def list_companies(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _progress(db, user)
    return [_path_out(db, path, p) for path in COMPANY_PATHS]


@router.get("/companies/{slug}")
def get_company(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    path = COMPANY_PATHS_BY_SLUG.get(slug)
    if not path:
        raise HTTPException(404, "Path not found")
    return _path_out(db, path, _progress(db, user))
