"""1v1 coding duels: quick match, private invites, a clearly labelled practice bot, Elo ratings."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..content.proctoring import public_problem
from ..database import get_db
from ..deps import get_current_user
from ..models import Duel, DuelStats, Submission, User
from ..routers.auth import user_out
from ..services import duels as ds
from ..services import polyglot, runner
from ..services.gamification import evaluate

router = APIRouter(prefix="/api/duels", tags=["duels"])

DIFFICULTY_PATTERN = "^(Easy|Medium|Hard)$"


# ---------------------------------------------------------------------------------------------------- output
def _problem_out(problem: dict) -> dict:
    data = public_problem(problem)
    langs = list(runner.HARNESS_LANGUAGES) + polyglot.supported_languages(problem)
    data["languages"] = [{"id": k, "label": runner.LANGUAGES[k]["label"]} for k in langs if runner.language_available(k)]
    data["starter"] = {**problem["starter"], **polyglot.starters(problem)}
    for k in ("companies", "hints", "editorial"):
        data.pop(k, None)
    return data


def _player(db: Session, duel: Duel, uid: int | None, me: User) -> dict | None:
    if duel.bot and uid == ds.BOT_ID:
        return {"id": None, "name": duel.bot["name"], "rating": duel.bot["rating"], "is_bot": True, "me": False}
    if not uid:
        return None
    user = duel.creator if uid == duel.creator_id else duel.opponent
    s = db.get(DuelStats, uid)
    return {"id": uid, "name": user.name if user else "Player", "rating": s.rating if s else ds.DEFAULT_RATING,
            "is_bot": False, "me": uid == me.id}


def _state(db: Session, duel: Duel, me: User, include_problem: bool = True) -> dict:
    now = ds._now()
    elapsed = ds.elapsed_seconds(duel, now)
    total = ds.total_tests(db, duel)
    other_id = ds.BOT_ID if duel.bot else (duel.opponent_id if duel.creator_id == me.id else duel.creator_id)
    started = ds._aware(duel.started_at)
    phase = duel.status
    if duel.status == "active" and elapsed is not None and elapsed < 0:
        phase = "countdown"

    you = ds._side(duel, str(me.id), total)
    if duel.bot:
        them = ds.bot_progress(duel, total, elapsed)
    elif other_id:
        them = ds._side(duel, str(other_id), total)
    else:
        them = None

    problem = q.problem(db, duel.problem_slug) if duel.problem_slug else None
    data = {
        "id": duel.id,
        "status": duel.status,
        "phase": phase,  # waiting | countdown | active | finished | cancelled
        "difficulty": duel.difficulty,
        "is_private": duel.is_private,
        "is_creator": duel.creator_id == me.id,
        # Only the creator needs the code (to share it); it is useless to anyone already in the duel
        "code": duel.code if duel.creator_id == me.id and duel.status == "waiting" else None,
        "created_at": ds._aware(duel.created_at).isoformat(),
        "waiting_seconds": max(0, int((now - ds._aware(duel.created_at)).total_seconds())),
        "bot_available_after": ds.BOT_AFTER_SECONDS,
        "started_at": started.isoformat() if started else None,
        "starts_in": max(0.0, -elapsed) if elapsed is not None and elapsed < 0 else 0,
        "elapsed": max(0.0, elapsed) if elapsed is not None else 0,
        "time_limit_minutes": duel.time_limit_minutes,
        "finished_at": ds._aware(duel.finished_at).isoformat() if duel.finished_at else None,
        "problem": ({"slug": duel.problem_slug, "title": problem["title"], "difficulty": problem["difficulty"]}
                    if problem and duel.status in ("active", "finished") and phase != "countdown" else None),
        "me": {**_player(db, duel, me.id, me), "progress": you},
        "opponent": ({**_player(db, duel, other_id, me), "progress": them} if other_id else None),
        "result": None,
    }
    if duel.status == "finished":
        mine = (duel.progress or {}).get(str(me.id)) or {}
        data["result"] = {
            "outcome": ds.result_for(duel, me.id),
            "rating_change": (duel.rating_change or {}).get(str(me.id), 0),
            "xp": mine.get("xp", 0),
            "forfeit": bool(mine.get("forfeit")),
            "opponent_forfeit": bool(other_id and other_id != ds.BOT_ID
                                     and ((duel.progress or {}).get(str(other_id)) or {}).get("forfeit")),
            "practice": bool(duel.bot),
        }
    if include_problem and problem and phase == "active":
        data["workspace"] = _problem_out(problem)
    return data


def _summary(db: Session, duel: Duel, me: User) -> dict:
    problem = q.problem(db, duel.problem_slug) if duel.problem_slug else None
    return {"id": duel.id, "status": duel.status, "difficulty": duel.difficulty,
            "problem": {"slug": duel.problem_slug, "title": problem["title"]} if problem else None,
            "opponent": ds.opponent_label(duel, me.id) if (duel.bot or duel.opponent_id) else None,
            "outcome": ds.result_for(duel, me.id),
            "rating_change": (duel.rating_change or {}).get(str(me.id), 0),
            "finished_at": ds._aware(duel.finished_at).isoformat() if duel.finished_at else None}


def _stats_out(db: Session, user_id: int) -> dict:
    s = db.get(DuelStats, user_id)
    rating = s.rating if s else ds.DEFAULT_RATING
    games = (s.wins + s.losses + s.draws) if s else 0
    rank = None
    if games:
        rank = 1 + (db.scalar(select(func.count()).select_from(DuelStats).where(
            DuelStats.rating > rating, (DuelStats.wins + DuelStats.losses + DuelStats.draws) > 0)) or 0)
    return {"rating": rating, "wins": s.wins if s else 0, "losses": s.losses if s else 0,
            "draws": s.draws if s else 0, "games": games, "rank": rank}


# ---------------------------------------------------------------------------------------------------- access
def _get(db: Session, duel_id: int, user: User) -> Duel:
    duel = db.get(Duel, duel_id)
    if not duel:
        raise HTTPException(404, "Duel not found")
    if user.id not in ds.participants(duel):
        raise HTTPException(403, "Only the players in this duel can open it")
    return duel


def _ensure_free(db: Session, user: User) -> None:
    current = ds.active_for(db, user.id)
    if current and ds.refresh(db, current):
        db.commit()
        current = ds.active_for(db, user.id)
    if current and current.status == "active":
        raise HTTPException(409, "Finish your current duel first")
    if current:  # an old search of mine: replace it
        current.status = "cancelled"
        current.finished_at = ds._now()


# ---------------------------------------------------------------------------------------------------- lobby
@router.get("/me")
def my_duels(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current = ds.active_for(db, user.id)
    if current and ds.refresh(db, current):
        db.commit()
        current = ds.active_for(db, user.id)
    recent = db.scalars(select(Duel).where(
        Duel.status == "finished", (Duel.creator_id == user.id) | (Duel.opponent_id == user.id),
    ).order_by(Duel.finished_at.desc()).limit(10)).all()
    return {"stats": _stats_out(db, user.id),
            "active": _summary(db, current, user) if current else None,
            "recent": [_summary(db, d, user) for d in recent]}


@router.get("/leaderboard")
def leaderboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    played = DuelStats.wins + DuelStats.losses + DuelStats.draws
    rows = db.execute(select(DuelStats, User.name).join(User, User.id == DuelStats.user_id)
                      .where(played > 0).order_by(DuelStats.rating.desc(), DuelStats.wins.desc()).limit(50)).all()
    return {"leaderboard": [{"rank": i + 1, "user": {"id": s.user_id, "name": name}, "rating": s.rating,
                             "wins": s.wins, "losses": s.losses, "draws": s.draws, "me": s.user_id == user.id}
                            for i, (s, name) in enumerate(rows)],
            "me": _stats_out(db, user.id)}


class QuickIn(BaseModel):
    difficulty: str = Field(pattern=DIFFICULTY_PATTERN)


@router.post("/quick")
def quick_match(body: QuickIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_free(db, user)
    duel = ds.find_open(db, user.id, body.difficulty)
    if duel:
        ds.start(db, duel, opponent=user)
    else:
        duel = Duel(code=ds.new_code(db), problem_slug="", difficulty=body.difficulty, status="waiting",
                    creator_id=user.id, is_private=False, created_at=ds._now(), progress={}, rating_change={})
        db.add(duel)
    db.commit()
    db.refresh(duel)
    return _state(db, duel, user)


class CreateIn(BaseModel):
    difficulty: str = Field(pattern=DIFFICULTY_PATTERN)
    private: bool = True


@router.post("")
def create(body: CreateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_free(db, user)
    duel = Duel(code=ds.new_code(db), problem_slug="", difficulty=body.difficulty, status="waiting",
                creator_id=user.id, is_private=body.private, created_at=ds._now(), progress={}, rating_change={})
    db.add(duel)
    db.commit()
    db.refresh(duel)
    return _state(db, duel, user)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)


@router.post("/join")
def join(body: JoinIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    duel = db.scalar(select(Duel).where(Duel.code == body.code.strip().upper()))
    if not duel:
        raise HTTPException(404, "No duel with that code")
    if duel.creator_id == user.id:
        raise HTTPException(400, "You can't duel yourself. Share the code with a friend.")
    if user.id == duel.opponent_id:
        return _state(db, duel, user)  # already in: idempotent for double clicks
    ds.refresh(db, duel)
    if duel.status != "waiting" or duel.opponent_id or duel.bot:
        db.commit()
        raise HTTPException(400, "This duel is no longer open")
    _ensure_free(db, user)
    ds.start(db, duel, opponent=user)
    db.commit()
    db.refresh(duel)
    return _state(db, duel, user)


# ---------------------------------------------------------------------------------------------------- one duel
@router.get("/{duel_id}")
def get_duel(duel_id: int, light: bool = False, user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    duel = _get(db, duel_id, user)
    if ds.refresh(db, duel):
        db.commit()
    return _state(db, duel, user, include_problem=not light)


@router.post("/{duel_id}/bot")
def accept_bot(duel_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    duel = _get(db, duel_id, user)
    ds.refresh(db, duel)
    if duel.creator_id != user.id or duel.status != "waiting" or duel.opponent_id:
        db.commit()
        raise HTTPException(400, "This duel already has an opponent")
    waited = (ds._now() - ds._aware(duel.created_at)).total_seconds()
    if waited < ds.BOT_AFTER_SECONDS:
        raise HTTPException(400, "Still looking for a human opponent. Give it a few more seconds.")
    rating = ds.stats_for(db, user.id).rating
    ds.start(db, duel, bot=ds.make_bot(duel.difficulty, rating))
    db.commit()
    db.refresh(duel)
    return _state(db, duel, user)


@router.post("/{duel_id}/cancel")
def cancel(duel_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    duel = _get(db, duel_id, user)
    if duel.status != "waiting" or duel.creator_id != user.id:
        raise HTTPException(400, "Only a duel that is still waiting can be cancelled")
    duel.status = "cancelled"
    duel.finished_at = ds._now()
    db.commit()
    return _state(db, duel, user)


@router.post("/{duel_id}/forfeit")
def forfeit(duel_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    duel = _get(db, duel_id, user)
    ds.refresh(db, duel)
    if duel.status != "active":
        db.commit()
        raise HTTPException(400, "Only a duel in progress can be forfeited")
    winner = ds.BOT_ID if duel.bot else (duel.opponent_id if duel.creator_id == user.id else duel.creator_id)
    ds.finish(db, duel, winner, at=ds.elapsed_seconds(duel) or 0.0, forfeit_by=user.id)
    db.commit()
    return {**_state(db, duel, user, include_problem=False), "user": user_out(user)}


class DuelCodeIn(BaseModel):
    language: str = Field(pattern="^(python|javascript|go|java|cpp)$")
    code: str = Field(min_length=1, max_length=50_000)


def _live(db: Session, duel_id: int, user: User) -> tuple[Duel, dict]:
    duel = _get(db, duel_id, user)
    if ds.refresh(db, duel):
        db.commit()
    if duel.status != "active":
        raise HTTPException(400, "This duel is over. The editor is locked.")
    if (ds.elapsed_seconds(duel) or 0) < 0:
        raise HTTPException(400, "The duel hasn't started yet")
    problem = q.problem(db, duel.problem_slug)
    if not problem:
        raise HTTPException(404, "Problem not found")
    return duel, problem


@router.post("/{duel_id}/run")
def run(duel_id: int, body: DuelCodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _, problem = _live(db, duel_id, user)
    return runner.run_tests(problem, body.language, body.code, [t for t in problem["tests"] if not t["hidden"]])


@router.post("/{duel_id}/submit")
def submit(duel_id: int, body: DuelCodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    duel, problem = _live(db, duel_id, user)
    submitted_at = ds.elapsed_seconds(duel) or 0.0  # the moment the code arrived, not when judging finished
    result = runner.run_tests(problem, body.language, body.code, problem["tests"])
    accepted = result["status"] == "Accepted"
    db.add(Submission(user_id=user.id, problem_slug=duel.problem_slug, language=body.language, code=body.code,
                      passed=result["passed"], total=result["total"], status=result["status"],
                      runtime_ms=result["time_ms"]))
    db.refresh(duel)  # the opponent may have finished it while we were judging
    ds.refresh(db, duel)
    counted = duel.status == "active"
    if counted:
        mine = ds._side(duel, str(user.id), result["total"])
        ds.set_progress(duel, str(user.id), passed=max(mine["passed"], result["passed"]), total=result["total"],
                        attempts=mine["attempts"] + 1, solved_at=submitted_at if accepted else None)
        if accepted:
            ds.refresh(db, duel)  # first Accepted wins (a bot that solved earlier still wins)
    db.commit()
    badges = evaluate(db, user)
    db.commit()
    return {**result, "counted": counted, "badges": badges,
            "duel": _state(db, duel, user, include_problem=False), "user": user_out(user)}
