from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import User, VettingRun
from ..routers import interviews
from ..routers.auth import user_out
from ..services import vetting as v
from ..services.gamification import evaluate

router = APIRouter(prefix="/api/vetting", tags=["vetting"])

LEVELS = ("Junior", "Mid-level", "Senior")


def _stage_out(db: Session, run: VettingRun, i: int) -> dict:
    d, st = v.stage_defs(run.platform)[i], run.stages[i]
    out = {"index": i, "key": d["key"], "type": d["type"], "title": d["title"], "summary": d["summary"],
           "pass": v.pass_bar(db, d), "status": st["status"], "score": st["score"], "note": st["note"],
           "started_at": st["started_at"], "deadline": st["deadline"], "finished_at": st.get("finished_at"),
           "href": None, "detail": None}
    if d["type"] == "interview":
        out["detail"] = {"kind": d["kind"], "minutes": interviews.KINDS[d["kind"]]["minutes"],
                         "questions": interviews.KINDS[d["kind"]]["questions"]}
        if st["ref"]:
            out["href"] = f"/interview/{st['ref']}?vetting={run.id}"
    elif d["type"] == "test":
        test = q.test(db, d["test"]) or {}
        out["detail"] = {"test_id": d["test"], "test_title": test.get("title"),
                         "minutes": test.get("duration_minutes"), "mcq": len(test.get("mcq", [])),
                         "coding": len(test.get("coding", [])), "difficulty": test.get("difficulty")}
        if st["status"] == "active":
            out["href"] = f"/tests/{d['test']}?vetting={run.id}"
        elif st["ref"]:
            out["href"] = f"/tests/result/{st['ref']}?vetting={run.id}"
    else:
        project = q.project(db, st["ref"]) if st["ref"] else v.pick_project(db, run.role)
        if project:
            out["detail"] = {"project_id": project["id"], "project_title": project["title"],
                             "hours": project["hours"], "level": project["level"], "days": v.PROJECT_DAYS}
        if st["ref"]:
            out["href"] = (f"/projects/{st['ref']}/review/{st['submission']}?vetting={run.id}"
                           if st.get("submission") else f"/projects/{st['ref']}?vetting={run.id}")
    return out


def _run_out(db: Session, run: VettingRun, full: bool = True) -> dict:
    p = v.PLATFORMS[run.platform]
    out = {"id": run.id, "platform": run.platform, "platform_label": p["label"], "role": run.role,
           "level": run.level, "language": run.language, "status": run.status, "current": v.current_index(run),
           "stages_total": len(run.stages),
           "stages_passed": sum(1 for s in run.stages if s["status"] == "passed"),
           "created_at": run.created_at.isoformat(),
           "finished_at": run.finished_at.isoformat() if run.finished_at else None,
           "verdict": (run.report or {}).get("verdict"), "overall_score": (run.report or {}).get("overall_score")}
    if full:
        out["stages"] = [_stage_out(db, run, i) for i in range(len(run.stages))]
        out["report"] = run.report
    return out


def _own_run(db: Session, run_id: int, user: User) -> VettingRun:
    run = db.get(VettingRun, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(404, "Vetting run not found")
    return run


def _synced(db: Session, run: VettingRun, user: User) -> list[dict]:
    """Bring the run up to date; returns any badges earned if it just finished."""
    was_active = run.status == "active"
    if v.sync(db, run, user):
        db.commit()
    if was_active and run.status != "active":
        return evaluate(db, user)
    return []


@router.get("/platforms")
def platforms(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    runs = db.scalars(select(VettingRun).where(VettingRun.user_id == user.id).order_by(VettingRun.id.desc())).all()
    out = []
    for key, p in v.PLATFORMS.items():
        mine = [r for r in runs if r.platform == key]
        active = next((r for r in mine if r.status == "active"), None)
        if active:
            _synced(db, active, user)
        out.append({"id": key, "label": p["label"], "claim": p["claim"], "about": p["about"],
                    "stages": [{"key": d["key"], "type": d["type"], "title": d["title"], "summary": d["summary"],
                                "pass": v.pass_bar(db, d)} for d in p["stages"]],
                    "active_run": _run_out(db, active, full=False) if active and active.status == "active" else None,
                    "best": max((r.report or {}).get("overall_score") or 0 for r in mine) if mine else None,
                    "passed": any(r.status == "passed" for r in mine), "stats": v.stats(db, key)})
    return {"platforms": out, "levels": list(LEVELS),
            "runs": [_run_out(db, r, full=False) for r in runs[:20]]}


class StartIn(BaseModel):
    platform: str
    role: str | None = Field(default=None, max_length=80)
    level: str = Field(default="Mid-level", max_length=30)
    language: str = Field(default="python", pattern="^(python|javascript)$")


@router.post("/runs")
def start_run(body: StartIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.platform not in v.PLATFORMS:
        raise HTTPException(400, "Unknown platform")
    if body.level not in LEVELS:
        raise HTTPException(400, "Unknown level")
    existing = db.scalar(select(VettingRun).where(VettingRun.user_id == user.id, VettingRun.platform == body.platform,
                                                  VettingRun.status == "active"))
    if existing:
        raise HTTPException(409, f"You already have a {v.PLATFORMS[body.platform]['label']} run in progress "
                                 f"(run {existing.id}). Finish or withdraw from it first.")
    run = VettingRun(user_id=user.id, platform=body.platform, role=body.role or user.target_role or "Full Stack Developer",
                     level=body.level, language=body.language, status="active", stages=v.new_stages(body.platform))
    db.add(run)
    db.commit()
    return _run_out(db, run)


@router.get("/runs/{run_id}")
def get_run(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user)
    new_badges = _synced(db, run, user)
    return {**_run_out(db, run), "badges": new_badges, "user": user_out(user)}


@router.post("/runs/{run_id}/stages/{index}/begin")
def begin_stage(run_id: int, index: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user)
    _synced(db, run, user)
    if run.status != "active":
        raise HTTPException(400, "This run is already finished")
    if index != v.current_index(run) or run.stages[index]["status"] != "ready":
        stage = run.stages[index] if 0 <= index < len(run.stages) else None
        if stage and stage["status"] == "active":
            return {**_run_out(db, run), "href": _stage_out(db, run, index)["href"]}
        raise HTTPException(400, "This stage isn't open yet")
    d, st = v.stage_defs(run.platform)[index], run.stages[index]
    started = v.now()
    if d["type"] == "interview":
        session = interviews.start(interviews.StartIn(kind=d["kind"], role=run.role, level=run.level,
                                                      language=run.language), user, db)
        st["ref"] = session["id"]
    elif d["type"] == "project":
        project = v.pick_project(db, run.role)
        if not project:
            raise HTTPException(503, "No take-home projects are available yet")
        st["ref"] = project["id"]
        st["deadline"] = (started + timedelta(days=v.PROJECT_DAYS)).isoformat()
    st.update(status="active", started_at=started.isoformat())
    flag_modified(run, "stages")
    db.commit()
    return {**_run_out(db, run), "href": _stage_out(db, run, index)["href"]}


@router.post("/runs/{run_id}/withdraw")
def withdraw(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user)
    if run.status != "active":
        raise HTTPException(400, "This run is already finished")
    run.status = "withdrawn"
    run.finished_at = v.now()
    for st in run.stages:
        if st["status"] in ("ready", "locked", "active"):
            st["status"] = "skipped"
    flag_modified(run, "stages")
    db.commit()
    return _run_out(db, run)
