"""Skill tree map across DSA patterns, language tracks and interview topics."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..services.skilltree import build_tree

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("/tree")
def tree(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_tree(db, user)
