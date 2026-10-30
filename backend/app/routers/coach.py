"""AI career coach: personal study plan for a target network, with weekly adjustment."""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import StudyPlan, User
from ..services import coach

router = APIRouter(prefix="/api/coach", tags=["coach"])


def _active(db: Session, user: User) -> StudyPlan | None:
    return db.scalar(select(StudyPlan).where(StudyPlan.user_id == user.id, StudyPlan.active.is_(True))
                     .order_by(StudyPlan.id.desc()))


def _week_of(plan: StudyPlan, today: date) -> int:
    return max(1, min(plan.weeks, (today - plan.start_date).days // 7 + 1))


def _out(plan: StudyPlan, today: date) -> dict:
    week = _week_of(plan, today)
    days = [d for w in plan.plan.get("weeks", []) for d in w["days"]]
    today_day = next((d for d in days if d["date"] == today.isoformat()), None)
    return {"id": plan.id, "target": plan.target, "target_label": plan.target_label,
            "pipeline": coach.TARGETS.get(plan.target, {}).get("pipeline", []), "weeks": plan.weeks,
            "hours_per_week": plan.hours_per_week, "language": plan.language,
            "experience": plan.experience or "mid", "experience_label": coach.experience(plan.experience)["label"],
            "start_date": plan.start_date.isoformat(),
            "end_date": (plan.start_date + timedelta(days=7 * plan.weeks - 1)).isoformat(),
            "current_week": week, "finished": today > plan.start_date + timedelta(days=7 * plan.weeks - 1),
            "today": today_day, "plan": plan.plan, "coach": plan.coach, "stats": coach.plan_stats(plan, today)}


@router.get("/targets")
def targets():
    return [{"id": k, "label": v["label"], "pipeline": v["pipeline"]} for k, v in coach.TARGETS.items()]


@router.get("/levels")
def levels():
    return [{"id": k, "label": v["label"], "weeks": v["weeks"]} for k, v in coach.EXPERIENCE.items()]


@router.get("/analysis")
def analysis(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return coach.analyse(db, user)


@router.get("/plan")
def get_plan(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _active(db, user)
    if not plan:
        return {"plan": None, "targets": targets()}
    today = date.today()
    changed = coach.sync_done(db, user, plan)
    # Weekly adjustment: the first visit in a new week rebuilds the rest of the plan from fresh analysis
    week = _week_of(plan, today)
    if plan.coach.get("adjusted_week", 1) < week and today <= plan.start_date + timedelta(days=7 * plan.weeks - 1):
        _replan(db, user, plan, today)
        changed = True
    if changed:
        db.commit()
    return {"plan": _out(plan, today), "targets": targets()}


class PlanIn(BaseModel):
    target: str
    weeks: int = Field(default=6, ge=2, le=52)
    hours_per_week: int = Field(default=10, ge=3, le=50)
    language: str = "python"
    target_role: str | None = Field(default=None, max_length=60)
    experience: Literal["beginner", "junior", "mid", "senior"] = "mid"


@router.post("/plan")
def create_plan(body: PlanIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.target not in coach.TARGETS:
        raise HTTPException(400, "Unknown target")
    if not q.track(db, body.language):
        raise HTTPException(400, "Unknown language")
    if body.target_role:
        user.target_role = body.target_role.strip()
    for old in db.scalars(select(StudyPlan).where(StudyPlan.user_id == user.id, StudyPlan.active.is_(True))):
        old.active = False
    today = date.today()
    analysis_data = coach.analyse(db, user)
    weeks = coach.build_days(db, user, body.target, body.language, today, body.weeks, body.hours_per_week,
                             analysis=analysis_data, level=body.experience)
    plan = StudyPlan(user_id=user.id, target=body.target, target_label=coach.TARGETS[body.target]["label"],
                     weeks=body.weeks, hours_per_week=body.hours_per_week, language=body.language, start_date=today,
                     experience=body.experience, plan={"weeks": weeks})
    note = coach.coach_note(user, plan, analysis_data, 1, coach.plan_stats(plan, today))
    plan.coach = {"adjusted_week": 1, "notes": [note], "analysis": analysis_data}
    db.add(plan)
    db.commit()
    return {"plan": _out(plan, today)}


def _replan(db: Session, user: User, plan: StudyPlan, today: date) -> None:
    """Rebuild everything from today on from fresh analysis, keeping past days and work already done today."""
    keep = {d["date"]: d["tasks"] for w in plan.plan.get("weeks", []) for d in w["days"]}
    done_today = [t for t in keep.get(today.isoformat(), []) if t.get("done")]
    analysis_data = coach.analyse(db, user)
    weeks = coach.build_days(db, user, plan.target, plan.language, plan.start_date, plan.weeks, plan.hours_per_week,
                             from_day=today, analysis=analysis_data, keep=keep, level=plan.experience or "mid")
    done_refs = {t["ref"] for t in done_today}
    for w in weeks:
        for d in w["days"]:
            if d["date"] == today.isoformat():
                d["tasks"] = done_today + [t for t in d["tasks"] if t["ref"] not in done_refs]
    plan.plan = {"weeks": weeks}
    week = _week_of(plan, today)
    note = coach.coach_note(user, plan, analysis_data, week, coach.plan_stats(plan, today))
    notes = [n for n in plan.coach.get("notes", []) if n.get("week") != week] + [note]
    plan.coach = {"adjusted_week": week, "notes": notes, "analysis": analysis_data}


@router.post("/plan/replan")
def replan(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _active(db, user)
    if not plan:
        raise HTTPException(404, "No active plan")
    coach.sync_done(db, user, plan)
    _replan(db, user, plan, date.today())
    db.commit()
    return {"plan": _out(plan, date.today())}


class ToggleIn(BaseModel):
    task_id: str
    done: bool


@router.post("/plan/tasks")
def toggle(body: ToggleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _active(db, user)
    if not plan:
        raise HTTPException(404, "No active plan")
    data = plan.plan
    for w in data.get("weeks", []):
        for d in w["days"]:
            for t in d["tasks"]:
                if t["id"] == body.task_id:
                    t["done"] = body.done
                    flag_modified(plan, "plan")
                    db.commit()
                    return {"plan": _out(plan, date.today())}
    raise HTTPException(404, "Task not found")


@router.delete("/plan")
def stop_plan(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _active(db, user)
    if plan:
        plan.active = False
        db.commit()
    return {"ok": True}
