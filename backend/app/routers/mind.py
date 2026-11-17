"""Mind Training: brain drills, calm tools, mindset lessons and habits."""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..services import mind

router = APIRouter(prefix="/api/mind", tags=["mind"])


class FinishIn(BaseModel):
    answer: Any = None


class CheckInIn(BaseModel):
    mood: int | None = Field(default=None, ge=1, le=5)
    energy: int | None = Field(default=None, ge=1, le=5)
    nerves: int | None = Field(default=None, ge=1, le=5)
    sleep_hours: float | None = Field(default=None, ge=0, le=16)
    note: str | None = Field(default=None, max_length=2000)


class BreathingIn(BaseModel):
    pattern: str
    seconds: int = Field(ge=0, le=3600)


class FocusIn(BaseModel):
    minutes: int = Field(ge=5, le=180)
    label: str = Field(default="", max_length=80)


class HabitIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class LessonIn(BaseModel):
    answers: list[int | None] = Field(default_factory=list, max_length=20)


@router.get("")
def overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.overview(db, user)


@router.post("/drills/{drill}/start")
def start(drill: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.start_drill(db, user, drill)


@router.post("/sessions/{session_id}/finish")
def finish(session_id: int, body: FinishIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.finish_drill(db, user, session_id, body.answer)


@router.get("/drills/{drill}/history")
def history(drill: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"runs": mind.drill_history(db, user, drill)}


@router.put("/today")
def check_in(body: CheckInIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.check_in(db, user, body.model_dump(exclude_unset=True))


@router.post("/breathing")
def breathing(body: BreathingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.log_breathing(db, user, body.pattern, body.seconds)


@router.post("/focus")
def focus(body: FocusIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.log_focus(db, user, body.minutes, body.label)


@router.post("/habits")
def add_habit(body: HabitIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.add_habit(db, user, body.title)


@router.post("/habits/{habit_id}/toggle")
def toggle_habit(habit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.toggle_habit(db, user, habit_id)


@router.delete("/habits/{habit_id}")
def archive_habit(habit_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.archive_habit(db, user, habit_id)


@router.get("/lessons/{lesson_id}")
def lesson(lesson_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return mind.lesson_out(db, user, lesson_id)


@router.post("/lessons/{lesson_id}/submit")
def submit_lesson(lesson_id: str, body: LessonIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    return mind.submit_lesson(db, user, lesson_id, body.answers)
