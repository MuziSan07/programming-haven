"""1v1 coding duels: matchmaking, the practice bot, lazy finalisation, Elo ratings.

Everything time-based is computed when the duel is read (no background workers): the client polls
GET /api/duels/{id} and each read moves the duel forward (bot progress, timeouts, the result).
"""

import random
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..content import queries as q
from ..models import Duel, DuelStats, User
from .scoring import award, solved_slugs

DIFFICULTIES = ("Easy", "Medium", "Hard")
COUNTDOWN_SECONDS = 5
MATCH_WINDOW = timedelta(minutes=2)  # quick match only joins duels this fresh
BOT_AFTER_SECONDS = 15  # client offers the bot at ~20 s; the server allows it slightly earlier
WAITING_EXPIRY = timedelta(minutes=10)  # an abandoned search is cancelled when next read
DEFAULT_RATING = 1200
K_RANKED, K_PRACTICE = 32, 16
XP = {"win": 40, "loss": 10, "draw": 15, "forfeit": 0}
BOT_ID = -1

# Bot solve time ranges in seconds, before rating scaling
BOT_SOLVE_RANGE = {"Easy": (4 * 60, 9 * 60), "Medium": (8 * 60, 16 * 60), "Hard": (15 * 60, 28 * 60)}
BOT_NAMES = ["Kai", "Nova", "Rio", "Juno", "Ezra", "Mika", "Sol", "Tess"]
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def new_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.scalar(select(Duel.id).where(Duel.code == code)):
            return code


def stats_for(db: Session, user_id: int) -> DuelStats:
    s = db.get(DuelStats, user_id)
    if not s:
        s = DuelStats(user_id=user_id, rating=DEFAULT_RATING, wins=0, losses=0, draws=0)
        db.add(s)
        db.flush()
    return s


def pick_problem(db: Session, difficulty: str, user_ids: list[int]) -> str:
    """A random problem of this difficulty, avoiding OA problems and anything either player already solved."""
    pool = [p for p in q.problems(db)
            if p["difficulty"] == difficulty and not p["slug"].startswith("oa-") and p.get("tests")]
    if not pool:
        pool = [p for p in q.problems(db) if not p["slug"].startswith("oa-") and p.get("tests")]
    solved: set[str] = set()
    for uid in user_ids:
        solved |= solved_slugs(db, uid)
    fresh = [p for p in pool if p["slug"] not in solved]
    return random.choice(fresh or pool)["slug"]


def make_bot(difficulty: str, user_rating: int) -> dict:
    rating = max(600, user_rating + random.randint(-60, 60))
    lo, hi = BOT_SOLVE_RANGE.get(difficulty, BOT_SOLVE_RANGE["Medium"])
    # Stronger bots are faster: 1200 -> x1.0, 1600 -> x0.8, 800 -> x1.2 (clamped)
    scale = min(1.35, max(0.7, 1 - (rating - DEFAULT_RATING) / 2000))
    solve = int(random.uniform(lo, hi) * scale)
    wrong = random.choices([0, 1, 2], weights=[45, 35, 20])[0]
    # Wrong submissions land at increasing fractions of the solve time with increasing pass rates
    fracs = sorted(random.uniform(0.45, 0.92) for _ in range(wrong))
    attempts = [{"at": round(f, 3), "passed": round(min(0.9, 0.3 + f * 0.6 + random.uniform(-0.1, 0.1)), 3)}
                for f in fracs]
    return {"name": f"{random.choice(BOT_NAMES)} (practice bot)", "rating": rating, "solve_seconds": solve,
            "wrong_attempts": attempts, "is_bot": True}


# ---------------------------------------------------------------------------------------------------- time
def elapsed_seconds(duel: Duel, now: datetime | None = None) -> float | None:
    """Seconds since the problem was revealed (negative during the countdown); frozen once finished."""
    started = _aware(duel.started_at)
    if not started:
        return None
    end = _aware(duel.finished_at) if duel.status == "finished" and duel.finished_at else (now or _now())
    return (end - started).total_seconds()


def bot_progress(duel: Duel, total: int, elapsed: float | None) -> dict:
    """The bot's visible progress at `elapsed`, derived from its stored schedule."""
    if duel.status == "finished" and "bot" in (duel.progress or {}):
        return duel.progress["bot"]
    b = duel.bot or {}
    solve = float(b.get("solve_seconds", 0))
    limit = duel.time_limit_minutes * 60
    t = elapsed if elapsed is not None else -1
    passed, attempts, solved_at = 0, 0, None
    for a in b.get("wrong_attempts", []):
        if t >= a["at"] * solve:
            attempts += 1
            passed = max(passed, min(total - 1, int(a["passed"] * total)))
    if t >= solve and solve <= limit:
        attempts += 1
        passed, solved_at = total, solve
    return {"passed": passed, "total": total, "attempts": attempts, "solved_at": solved_at}


def _side(duel: Duel, key: str, total: int) -> dict:
    p = (duel.progress or {}).get(key) or {}
    return {"passed": p.get("passed", 0), "total": p.get("total", total), "attempts": p.get("attempts", 0),
            "solved_at": p.get("solved_at")}


def set_progress(duel: Duel, key: str, **values) -> None:
    progress = dict(duel.progress or {})
    progress[key] = {**(progress.get(key) or {}), **values}
    duel.progress = progress
    flag_modified(duel, "progress")


# ---------------------------------------------------------------------------------------------------- lifecycle
def participants(duel: Duel) -> list[int]:
    return [i for i in (duel.creator_id, duel.opponent_id) if i]


def start(db: Session, duel: Duel, *, opponent: User | None = None, bot: dict | None = None) -> None:
    duel.opponent_id = opponent.id if opponent else None
    duel.bot = bot
    duel.problem_slug = pick_problem(db, duel.difficulty, participants(duel))
    problem = q.problem(db, duel.problem_slug)
    total = len(problem["tests"]) if problem else 0
    for uid in participants(duel):
        set_progress(duel, str(uid), passed=0, total=total, attempts=0, solved_at=None)
    duel.status = "active"
    duel.started_at = _now() + timedelta(seconds=COUNTDOWN_SECONDS)


def total_tests(db: Session, duel: Duel) -> int:
    problem = q.problem(db, duel.problem_slug) if duel.problem_slug else None
    return len(problem["tests"]) if problem else 0


def refresh(db: Session, duel: Duel) -> bool:
    """Finalise the duel if it should have ended. Returns True when something changed."""
    now = _now()
    if duel.status == "waiting":
        if _aware(duel.created_at) < now - WAITING_EXPIRY:
            duel.status = "cancelled"
            duel.finished_at = now
            return True
        return False
    if duel.status != "active":
        return False
    elapsed = elapsed_seconds(duel, now)
    if elapsed is None or elapsed < 0:
        return False
    limit = duel.time_limit_minutes * 60
    solves = []
    for uid in participants(duel):
        at = ((duel.progress or {}).get(str(uid)) or {}).get("solved_at")
        if at is not None:
            solves.append((at, uid))
    if duel.bot:
        bp = bot_progress(duel, total_tests(db, duel), elapsed)
        if bp["solved_at"] is not None:
            solves.append((bp["solved_at"], BOT_ID))
    if solves:
        at, winner = min(solves)
        finish(db, duel, winner, at=at)
        return True
    if elapsed >= limit:
        finish(db, duel, None, at=limit)
        return True
    return False


def _expected(ra: int, rb: int) -> float:
    return 1 / (1 + 10 ** ((rb - ra) / 400))


def finish(db: Session, duel: Duel, winner_id: int | None, *, at: float, forfeit_by: int | None = None) -> None:
    started = _aware(duel.started_at)
    if duel.bot:
        # Freeze the bot where it stood at the decisive moment
        set_progress(duel, "bot", **bot_progress(duel, total_tests(db, duel), at))
    duel.status = "finished"
    duel.winner_id = winner_id
    duel.finished_at = min(_now(), started + timedelta(seconds=max(0.0, at)))

    users = {u.id: u for u in (duel.creator, duel.opponent) if u}
    stats = {uid: stats_for(db, uid) for uid in users}
    changes: dict[str, int] = {}

    def score(uid: int) -> float:
        if winner_id is None:
            return 0.5
        return 1.0 if winner_id == uid else 0.0

    if duel.bot:
        uid = duel.creator_id
        s = stats[uid]
        delta = round(K_PRACTICE * (score(uid) - _expected(s.rating, int(duel.bot["rating"]))))
        changes[str(uid)] = delta
    else:
        a, b = duel.creator_id, duel.opponent_id
        ra, rb = stats[a].rating, stats[b].rating
        changes[str(a)] = round(K_RANKED * (score(a) - _expected(ra, rb)))
        changes[str(b)] = round(K_RANKED * (score(b) - _expected(rb, ra)))

    for uid, user in users.items():
        s = stats[uid]
        s.rating = max(100, s.rating + changes[str(uid)])
        result = "draw" if winner_id is None else ("win" if winner_id == uid else "loss")
        if result == "win":
            s.wins += 1
        elif result == "loss":
            s.losses += 1
        else:
            s.draws += 1
        xp = XP["forfeit"] if forfeit_by == uid else XP[result]
        award(user, xp)
        set_progress(duel, str(uid), xp=xp, result=result, forfeit=forfeit_by == uid)
    duel.rating_change = changes
    flag_modified(duel, "rating_change")


# ---------------------------------------------------------------------------------------------------- queries
def active_for(db: Session, user_id: int) -> Duel | None:
    return db.scalar(select(Duel).where(
        Duel.status.in_(("waiting", "active")),
        or_(Duel.creator_id == user_id, Duel.opponent_id == user_id),
    ).order_by(Duel.created_at.desc()))


def find_open(db: Session, user_id: int, difficulty: str) -> Duel | None:
    return db.scalar(select(Duel).where(
        Duel.status == "waiting", Duel.is_private.is_(False), Duel.difficulty == difficulty,
        Duel.creator_id != user_id, Duel.opponent_id.is_(None), Duel.created_at >= _now() - MATCH_WINDOW,
    ).order_by(Duel.created_at).limit(1))


def opponent_label(duel: Duel, user_id: int) -> dict:
    if duel.bot:
        return {"name": duel.bot["name"], "is_bot": True}
    other = duel.opponent if duel.creator_id == user_id else duel.creator
    return {"name": other.name if other else None, "is_bot": False}


def result_for(duel: Duel, user_id: int) -> str | None:
    if duel.status != "finished":
        return None
    if duel.winner_id is None:
        return "draw"
    return "win" if duel.winner_id == user_id else "loss"
