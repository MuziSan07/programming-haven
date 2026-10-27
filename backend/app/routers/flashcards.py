"""Spaced-repetition flashcards built from the interview question bank (SM-2 scheduling)."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import Flashcard, FlashcardReview, User
from ..routers.auth import user_out
from ..services.gamification import evaluate, review_streak
from ..services.scoring import award

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])

XP_PER_REVIEW = 1
XP_DAILY_CAP = 30
GRADES = {0: "Again", 1: "Hard", 2: "Good", 3: "Easy"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def schedule(card: Flashcard, grade: int) -> None:
    """SM-2 with four buttons. Again resets the card, Hard/Good/Easy grow the interval by the ease factor."""
    if grade == 0:
        card.lapses += 1
        card.reps = 0
        card.interval_days = 0
        card.ease = max(1.3, card.ease - 0.2)
        card.due_at = _now() + timedelta(minutes=10)
    else:
        if card.reps == 0:
            interval = {1: 1, 2: 1, 3: 3}[grade]
        elif card.reps == 1:
            interval = {1: 3, 2: 4, 3: 7}[grade]
        else:
            factor = {1: 1.2, 2: card.ease, 3: card.ease * 1.3}[grade]
            interval = max(card.interval_days + 1, round(card.interval_days * factor))
        card.ease = max(1.3, card.ease + {1: -0.15, 2: 0.0, 3: 0.15}[grade])
        card.reps += 1
        card.interval_days = min(interval, 365)
        card.due_at = _now() + timedelta(days=card.interval_days)
    card.last_reviewed = _now()


def add_card(db: Session, user_id: int, question_id: str, due_now: bool = True) -> bool:
    """Add a question as a flashcard if the user doesn't have it yet. Returns True when added."""
    if db.scalar(select(Flashcard.id).where(Flashcard.user_id == user_id, Flashcard.question_id == question_id)):
        return False
    db.add(Flashcard(user_id=user_id, question_id=question_id, due_at=_now() if due_now else _now() + timedelta(days=1)))
    return True


def _card_out(card: Flashcard, item: dict) -> dict:
    back = item.get("model_answer") or ""
    if item.get("type") == "mcq":
        back = item["options"][item["answer"]]
    return {"id": card.id, "question_id": card.question_id, "topic": item["topic"], "level": item["level"],
            "front": item["question"], "code": item.get("code"), "options": item.get("options"),
            "back": back, "explanation": item.get("explanation", ""), "reps": card.reps, "lapses": card.lapses,
            "interval_days": card.interval_days, "ease": round(card.ease, 2),
            "due_at": _aware(card.due_at).isoformat(), "preview": {g: _preview(card, g) for g in GRADES}}


def _preview(card: Flashcard, grade: int) -> str:
    """Label like '10m' or '4d' showing when the card returns for each button."""
    clone = Flashcard(ease=card.ease, interval_days=card.interval_days, reps=card.reps, lapses=card.lapses)
    schedule(clone, grade)
    return "10m" if grade == 0 else f"{clone.interval_days}d"


def _reviews_today(db: Session, user_id: int) -> int:
    start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    return int(db.scalar(select(func.count()).select_from(FlashcardReview).where(
        FlashcardReview.user_id == user_id, FlashcardReview.created_at >= start)) or 0)


@router.get("/stats")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cards = db.scalars(select(Flashcard).where(Flashcard.user_id == user.id)).all()
    items = {it["id"]: it for it in q.questions(db)}
    now = _now()
    by_topic: dict[str, dict] = {}
    for c in cards:
        item = items.get(c.question_id)
        if not item:
            continue
        t = by_topic.setdefault(item["topic"], {"topic": item["topic"], "total": 0, "due": 0, "mature": 0})
        t["total"] += 1
        t["due"] += _aware(c.due_at) <= now
        t["mature"] += c.interval_days >= 21
    week = [(now + timedelta(days=i)).date() for i in range(7)]
    forecast = [{"date": d.isoformat(), "count": sum(1 for c in cards if _aware(c.due_at).date() == d
                                                       or (i == 0 and _aware(c.due_at) <= now))}
                for i, d in enumerate(week)]
    return {
        "total": len(cards),
        "due": sum(1 for c in cards if _aware(c.due_at) <= now),
        "new": sum(1 for c in cards if c.reps == 0 and c.lapses == 0),
        "learning": sum(1 for c in cards if 0 < c.interval_days < 21 or (c.reps == 0 and c.lapses > 0)),
        "mature": sum(1 for c in cards if c.interval_days >= 21),
        "reviewed_today": _reviews_today(db, user.id),
        "review_streak": review_streak(db, user.id),
        "topics": sorted(by_topic.values(), key=lambda t: -t["due"]),
        "available_topics": sorted({it["topic"] for it in items.values()}),
        "forecast": forecast,
    }


@router.get("/due")
def due(topic: str | None = None, limit: int = 20, user: User = Depends(get_current_user),
        db: Session = Depends(get_db)):
    items = {it["id"]: it for it in q.questions(db)}
    cards = db.scalars(select(Flashcard).where(Flashcard.user_id == user.id, Flashcard.due_at <= _now())
                       .order_by(Flashcard.due_at)).all()
    out = []
    for c in cards:
        item = items.get(c.question_id)
        if item and (not topic or item["topic"] == topic):
            out.append(_card_out(c, item))
        if len(out) >= min(limit, 100):
            break
    return {"cards": out}


class ReviewIn(BaseModel):
    grade: int = Field(ge=0, le=3)


@router.post("/{card_id}/review")
def review(card_id: int, body: ReviewIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    card = db.get(Flashcard, card_id)
    if not card or card.user_id != user.id:
        raise HTTPException(404, "Card not found")
    schedule(card, body.grade)
    xp = XP_PER_REVIEW if _reviews_today(db, user.id) < XP_DAILY_CAP else 0
    db.add(FlashcardReview(user_id=user.id, flashcard_id=card.id, grade=body.grade))
    award(user, xp)
    db.commit()
    new_badges = evaluate(db, user)
    return {"id": card.id, "interval_days": card.interval_days, "due_at": _aware(card.due_at).isoformat(),
            "xp_gained": xp, "badges": new_badges, "user": user_out(user)}


class AddIn(BaseModel):
    question_ids: list[str] = Field(min_length=1, max_length=200)


@router.post("")
def add(body: AddIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    known = {it["id"] for it in q.questions(db)}
    added = sum(add_card(db, user.id, qid) for qid in body.question_ids if qid in known)
    db.commit()
    return {"added": added}


class TopicIn(BaseModel):
    topic: str
    level: str | None = None
    count: int = Field(default=20, ge=1, le=100)


@router.post("/topic")
def add_topic(body: TopicIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    have = set(db.scalars(select(Flashcard.question_id).where(Flashcard.user_id == user.id)))
    pool = [it for it in q.questions(db) if it["topic"] == body.topic and (not body.level or it["level"] == body.level)
            and it["id"] not in have]
    if not pool:
        raise HTTPException(400, "No new questions left for that topic")
    pool.sort(key=lambda it: q.LEVEL_ORDER.index(it["level"]) if it["level"] in q.LEVEL_ORDER else 9)
    for it in pool[:body.count]:
        add_card(db, user.id, it["id"])
    db.commit()
    return {"added": min(len(pool), body.count)}


@router.delete("/{card_id}")
def delete(card_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    card = db.get(Flashcard, card_id)
    if not card or card.user_id != user.id:
        raise HTTPException(404, "Card not found")
    db.delete(card)
    db.commit()
    return {"ok": True}
