from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import LessonProgress, User
from ..routers.auth import user_out
from ..services import runner
from ..services.scoring import XP_LESSON, award

router = APIRouter(prefix="/api/learn", tags=["learn"])

LEVEL_XP_BONUS = {"Basic": 0, "Intermediate": 5, "Advanced": 10, "Expert": 15}


def completed_ids(db: Session, user_id: int) -> set[str]:
    return set(db.scalars(select(LessonProgress.lesson_id).where(LessonProgress.user_id == user_id)))


def _public_step(step: dict) -> dict:
    # Code solutions stay server-side until the learner asks to reveal them
    return {k: v for k, v in step.items() if k != "solution"}


@router.get("/paths")
def list_paths(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    done = completed_ids(db, user.id)
    out = []
    for t in q.tracks(db):
        lessons = q.track_lessons(db, t["id"])
        levels = sorted({u["level"] for u in t.get("units", [])}, key=q.LEVEL_ORDER.index)
        out.append({
            "id": t["id"], "title": t["title"], "icon": t["icon"], "color": t["color"],
            "description": t["description"], "available": t.get("available", True) and bool(lessons),
            "lessons_total": len(lessons), "lessons_completed": sum(l["id"] in done for l in lessons),
            "units": len(t.get("units", [])), "levels": levels,
        })
    return out


@router.get("/paths/{path_id}")
def get_path(path_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = q.track(db, path_id)
    lessons = q.track_lessons(db, path_id)
    if not t or not lessons:
        raise HTTPException(404, "Path not found")
    done = completed_ids(db, user.id)
    by_unit: dict[str, list] = {}
    for lesson in lessons:
        by_unit.setdefault(lesson["unit_id"], []).append(lesson)
    units, unlocked = [], True
    for unit in t.get("units", []):
        items = []
        for lesson in by_unit.get(unit["id"], []):
            completed = lesson["id"] in done
            items.append({"id": lesson["id"], "title": lesson["title"], "minutes": lesson["minutes"],
                          "steps": len(lesson["steps"]), "completed": completed, "locked": not unlocked})
            # Duolingo-style: the next lesson unlocks once this one is done
            unlocked = completed
        if items:
            units.append({**{k: unit[k] for k in ("id", "title", "level")}, "description": unit.get("description", ""),
                          "lessons": items})
    return {"id": t["id"], "title": t["title"], "icon": t["icon"], "color": t["color"],
            "description": t["description"], "units": units}


@router.get("/lessons/{lesson_id}")
def get_lesson(lesson_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lesson = q.lesson(db, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    t = q.track(db, lesson["track_id"]) or {}
    unit = next((u for u in t.get("units", []) if u["id"] == lesson["unit_id"]), {})
    return {**lesson, "steps": [_public_step(s) for s in lesson["steps"]], "path_id": lesson["track_id"],
            "unit_title": unit.get("title", ""), "level": unit.get("level", "Basic"),
            "track_title": t.get("title", "")}


class CompleteIn(BaseModel):
    score: int = Field(ge=0, le=100)


@router.post("/lessons/{lesson_id}/complete")
def complete_lesson(lesson_id: str, body: CompleteIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    lesson = q.lesson(db, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    t = q.track(db, lesson["track_id"]) or {}
    level = next((u["level"] for u in t.get("units", []) if u["id"] == lesson["unit_id"]), "Basic")
    existing = db.scalar(select(LessonProgress).where(LessonProgress.user_id == user.id,
                                                      LessonProgress.lesson_id == lesson_id))
    # Full XP the first time, a small practice bonus on repeats
    xp = XP_LESSON + LEVEL_XP_BONUS.get(level, 0) + body.score // 10 if not existing else 5
    if existing:
        existing.score = max(existing.score, body.score)
    else:
        db.add(LessonProgress(user_id=user.id, lesson_id=lesson_id, score=body.score))
    award(user, xp)
    db.commit()
    return {"xp_gained": xp, "user": user_out(user)}


class ExerciseIn(BaseModel):
    lesson_id: str
    step: int
    code: str = Field(max_length=20_000)
    reveal: bool = False


def _code_step(db: Session, lesson_id: str, index: int) -> dict:
    lesson = q.lesson(db, lesson_id)
    if not lesson or not 0 <= index < len(lesson["steps"]) or lesson["steps"][index]["type"] != "code":
        raise HTTPException(404, "Exercise not found")
    return lesson["steps"][index]


@router.post("/exercise")
def check_exercise(body: ExerciseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    step = _code_step(db, body.lesson_id, body.step)
    result = runner.execute(step.get("language", "python"), body.code)
    output = result.stdout.strip()
    return {
        "correct": not result.timed_out and output == str(step["expected_output"]).strip(),
        "stdout": output,
        "stderr": result.stderr.strip()[-2000:],
        "expected": step["expected_output"],
        "timed_out": result.timed_out,
    }


@router.post("/exercise/solution")
def reveal_solution(body: ExerciseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    step = _code_step(db, body.lesson_id, body.step)
    return {"solution": step.get("solution", "")}
