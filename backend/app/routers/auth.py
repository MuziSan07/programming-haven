from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..security import create_token, hash_password, verify_password
from ..services.scoring import level_for, touch_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    target_role: str = "Full Stack Developer"
    gender: str = Field(default="unspecified", pattern="^(male|female|other|unspecified)$")


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    target_role: str | None = None
    gender: str | None = Field(default=None, pattern="^(male|female|other|unspecified)$")
    persona_id: str | None = None


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "target_role": user.target_role,
        "gender": user.gender,
        "persona_id": user.persona_id,
        "is_admin": user.is_admin,
        "xp": user.xp,
        "streak": user.streak,
        **level_for(user.xp),
    }


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password),
                target_role=body.target_role, gender=body.gender,
                persona_id=q.default_persona_id(db, body.gender),
                is_admin=email in get_settings().admin_email_set)
    touch_activity(user)
    db.add(user)
    db.commit()
    return {"token": create_token(user.id), "user": user_out(user)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    touch_activity(user)
    db.commit()
    return {"token": create_token(user.id), "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.name is not None:
        user.name = body.name.strip()
    if body.target_role is not None:
        user.target_role = body.target_role
    if body.gender is not None:
        user.gender = body.gender
    if body.persona_id is not None:
        if not any(p["id"] == body.persona_id for p in q.personas(db)):
            raise HTTPException(400, "Unknown interviewer")
        user.persona_id = body.persona_id
    db.commit()
    return user_out(user)
