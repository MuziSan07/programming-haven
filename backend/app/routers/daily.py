"""Daily challenge: today's shared problem, my status and streak, and the global leaderboard."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..services import daily

router = APIRouter(prefix="/api/daily", tags=["daily"])


@router.get("")
def today(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return daily.overview(db, user)


@router.get("/history")
def history(days: int = Query(14, ge=1, le=60), user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    return {"days": daily.history(db, user, days)}
