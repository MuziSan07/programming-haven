"""Daily challenge: one shared problem per UTC day, a streak bonus and a global leaderboard."""

import random
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..models import DailySolve, Submission, User
from .scoring import award, level_for

BONUS_BASE = 10
BONUS_PER_DAY = 5
BONUS_CAP = 50
NO_REPEAT_DAYS = 60
LEADERBOARD_SIZE = 50
EPOCH = date(2026, 1, 5)  # a Monday; weekday offsets below are relative to it

# Monday=0 ... Sunday=6
WEEKDAY_DIFFICULTY = {0: "Easy", 1: "Easy", 2: "Medium", 3: "Medium", 4: "Medium", 5: "Hard", 6: "Medium"}
POOL_DIFFICULTIES = {"Easy": ("Easy",), "Medium": ("Medium",), "Hard": ("Hard", "Expert")}


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- selection

def _pools(db: Session) -> dict[str, tuple[str, ...]]:
    problems = [p for p in q.problems(db) if not p["slug"].startswith(("oa-", "basics-"))]
    every = tuple(sorted(p["slug"] for p in problems))
    pools = {}
    for key, diffs in POOL_DIFFICULTIES.items():
        pools[key] = tuple(sorted(p["slug"] for p in problems if p["difficulty"] in diffs)) or every
    return pools


def _occurrence(day: date, difficulty: str) -> int:
    """How many days of this difficulty fall in [EPOCH, day). Negative before the epoch."""
    offsets = [i for i, d in WEEKDAY_DIFFICULTY.items() if d == difficulty]
    weeks, rem = divmod((day - EPOCH).days, 7)
    return weeks * len(offsets) + sum(1 for i in offsets if i < rem)


def _window(difficulty: str) -> int:
    """Max picks of one difficulty inside the no-repeat window."""
    per_week = sum(1 for d in WEEKDAY_DIFFICULTY.values() if d == difficulty)
    return -(-NO_REPEAT_DAYS * per_week // 7)


@lru_cache(maxsize=256)
def _cycle(pool: tuple[str, ...], difficulty: str, cycle: int) -> tuple[str, ...]:
    """A seeded shuffle of the pool for one pass through it. Each pass uses every problem once, and the problems
    that ended the previous pass are moved to the back so the boundary never repeats within the window."""
    order = list(pool)
    random.Random(f"daily:{difficulty}:{cycle}").shuffle(order)
    if cycle <= 0:
        return tuple(order)
    tail = set(_cycle(pool, difficulty, cycle - 1)[-_window(difficulty):])
    if len(pool) <= 2 * len(tail):  # pool too small to avoid repeats; keep the plain shuffle
        return tuple(order)
    return tuple([s for s in order if s not in tail] + [s for s in order if s in tail])


def pick_slug(db: Session, day: date) -> str:
    """Deterministic problem slug for a UTC date."""
    difficulty = WEEKDAY_DIFFICULTY[day.weekday()]
    pool = _pools(db)[difficulty]
    cycle, index = divmod(_occurrence(day, difficulty), len(pool))
    return _cycle(pool, difficulty, cycle)[index]


def problem_summary(db: Session, slug: str) -> dict:
    p = q.problem(db, slug) or {"slug": slug, "title": slug, "difficulty": "Medium", "pattern": ""}
    return {"slug": p["slug"], "title": p["title"], "difficulty": p["difficulty"], "pattern": p.get("pattern", "")}


# ---------------------------------------------------------------- streaks and bonus

def solve_days(db: Session, user_id: int, since: date | None = None) -> dict[date, DailySolve]:
    stmt = select(DailySolve).where(DailySolve.user_id == user_id)
    if since:
        stmt = stmt.where(DailySolve.day >= since)
    return {s.day: s for s in db.scalars(stmt)}


def daily_streak(db: Session, user_id: int, today: date | None = None) -> int:
    """Consecutive days with a daily solve, ending today (or yesterday while today is still open)."""
    today = today or utc_today()
    days = set(solve_days(db, user_id, today - timedelta(days=400)))
    cursor = today if today in days else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def bonus_for(streak: int) -> int:
    """Bonus for a solve that brings the daily streak to `streak` days (today included)."""
    return min(BONUS_CAP, BONUS_BASE + BONUS_PER_DAY * streak)


# ---------------------------------------------------------------- leaderboard

def _ordered(db: Session, day: date) -> list[DailySolve]:
    return list(db.scalars(select(DailySolve).where(DailySolve.day == day)
                           .order_by(DailySolve.solved_at, DailySolve.attempts, DailySolve.id)))


def _hms(seconds: int) -> str:
    h, rem = divmod(max(0, seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def leaderboard(db: Session, day: date, me: User) -> dict:
    solves = _ordered(db, day)
    start = day_start(day)
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_([s.user_id for s in solves])))} if solves else {}
    rows, mine = [], None
    for rank, s in enumerate(solves, start=1):
        u = users.get(s.user_id)
        seconds = int((_aware(s.solved_at) - start).total_seconds())
        row = {"rank": rank, "name": u.name if u else "Unknown", "level": level_for(u.xp)["level"] if u else 1,
               "seconds_after_reset": seconds, "time_after_reset": _hms(seconds), "attempts": s.attempts,
               "language": s.language, "runtime_ms": s.runtime_ms, "me": s.user_id == me.id}
        if row["me"]:
            mine = row
        if rank <= LEADERBOARD_SIZE:
            rows.append(row)
    return {"rows": rows, "me": mine, "total": len(solves)}


def rank_of(db: Session, day: date, user_id: int) -> int | None:
    for rank, s in enumerate(_ordered(db, day), start=1):
        if s.user_id == user_id:
            return rank
    return None


# ---------------------------------------------------------------- submit hook

def on_submit(db: Session, user: User, slug: str, language: str, result: dict) -> dict | None:
    """Called by the DSA submit route after its Submission is added. Records the first accepted solve of today's
    problem, awards the streak bonus (the normal problem XP is awarded by the DSA route) and returns the payload."""
    today = utc_today()
    if result.get("status") != "Accepted" or slug != pick_slug(db, today):
        return None
    if db.scalar(select(DailySolve.id).where(DailySolve.user_id == user.id, DailySolve.day == today)):
        return None
    db.flush()  # make the pending Submission countable
    attempts = db.scalar(select(func.count()).select_from(Submission).where(
        Submission.user_id == user.id, Submission.problem_slug == slug,
        Submission.created_at >= day_start(today))) or 1
    streak = daily_streak(db, user.id, today) + 1
    bonus = bonus_for(streak)
    db.add(DailySolve(user_id=user.id, day=today, problem_slug=slug, language=language, attempts=attempts,
                      runtime_ms=result.get("time_ms"), bonus_xp=bonus, solved_at=datetime.now(timezone.utc)))
    award(user, bonus)
    db.flush()
    return {"bonus_xp": bonus, "streak": streak, "rank": rank_of(db, today, user.id)}


# ---------------------------------------------------------------- views

def overview(db: Session, user: User) -> dict:
    today = utc_today()
    slug = pick_slug(db, today)
    since = today - timedelta(days=29)
    mine = solve_days(db, user.id, since)
    solve = mine.get(today)
    streak = daily_streak(db, user.id, today)
    board = leaderboard(db, today, user)
    attempts = solve.attempts if solve else db.scalar(select(func.count()).select_from(Submission).where(
        Submission.user_id == user.id, Submission.problem_slug == slug, Submission.created_at >= day_start(today)))
    return {
        "date": today.isoformat(),
        "problem": problem_summary(db, slug),
        "resets_at": day_start(today + timedelta(days=1)).isoformat(),
        "status": {
            "solved": solve is not None,
            "solved_at": _aware(solve.solved_at).isoformat() if solve else None,
            "attempts": attempts or 0,
            "bonus_xp": solve.bonus_xp if solve else bonus_for(streak + 1),
            "rank": board["me"]["rank"] if board["me"] else None,
            "language": solve.language if solve else None,
        },
        "streak": streak,
        "bonus_rule": {"base": BONUS_BASE, "per_day": BONUS_PER_DAY, "cap": BONUS_CAP},
        "calendar": [{"date": d.isoformat(), "solved": d in mine,
                      "slug": mine[d].problem_slug if d in mine else None}
                     for d in (since + timedelta(days=i) for i in range(30))],
        "leaderboard": board["rows"],
        "my_row": board["me"],
        "solvers": board["total"],
    }


def history(db: Session, user: User, days: int) -> list[dict]:
    today = utc_today()
    mine = solve_days(db, user.id, today - timedelta(days=days))
    counts = dict(db.execute(select(DailySolve.day, func.count()).where(DailySolve.day >= today - timedelta(days=days))
                             .group_by(DailySolve.day)).all())
    out = []
    for i in range(1, days + 1):
        d = today - timedelta(days=i)
        s = mine.get(d)
        out.append({"date": d.isoformat(), "problem": problem_summary(db, s.problem_slug if s else pick_slug(db, d)),
                    "solved": s is not None, "attempts": s.attempts if s else None,
                    "bonus_xp": s.bonus_xp if s else 0, "solvers": counts.get(d, 0)})
    return out
