from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import ActivitySession, User
from ..services.scoring import time_summary, touch_activity

router = APIRouter(prefix="/api", tags=["activity"])


class HeartbeatIn(BaseModel):
    area: str = Field(pattern="^(learn|dsa|test|interview|project|questions|mirror)$")
    ref: str = Field(default="", max_length=120)
    seconds: int = Field(ge=1, le=60)  # visible, focused seconds since the last heartbeat


@router.post("/activity/heartbeat")
def heartbeat(body: HeartbeatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    row = db.scalar(select(ActivitySession).where(ActivitySession.user_id == user.id, ActivitySession.day == today,
                                                  ActivitySession.area == body.area, ActivitySession.ref == body.ref))
    if row is None:
        row = ActivitySession(user_id=user.id, day=today, area=body.area, ref=body.ref, seconds=0)
        db.add(row)
    row.seconds += body.seconds
    touch_activity(user)
    db.commit()
    return {"seconds": row.seconds}


@router.get("/activity/ref")
def ref_time(area: str, ref: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Total focused seconds spent on one item (e.g. a DSA problem) across all days."""
    rows = db.scalars(select(ActivitySession).where(ActivitySession.user_id == user.id, ActivitySession.area == area,
                                                    ActivitySession.ref == ref)).all()
    return {"seconds": sum(r.seconds for r in rows)}


@router.get("/activity/summary")
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return time_summary(db, user.id)


@router.get("/personas")
def personas(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{k: p.get(k) for k in ("id", "name", "gender", "title", "personality", "voice", "browser_voice",
                                   "appearance")} for p in q.personas(db)]
