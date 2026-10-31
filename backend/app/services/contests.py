"""Weekly DSA contests.

A contest is created automatically for each week (Monday-Sunday UTC) with four problems of rising
difficulty. Once a user starts, they have a personal timer (90 minutes, never past the contest end).
Ranking: total points, then penalty minutes (time to each solve + 5 per wrong submission).
"""

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..models import Contest, ContestEntry
from .leagues import week_start
from .scoring import level_for

DURATION_MINUTES = 90
WRONG_PENALTY = 5
SLOTS = [("Easy", 3), ("Medium", 4), ("Medium", 5), ("Hard", 7)]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def finished(contest: Contest) -> bool:
    return _now() > _aware(contest.ends_at)


def phase(contest: Contest) -> str:
    now = _now()
    if now < _aware(contest.starts_at):
        return "upcoming"
    return "ended" if now > _aware(contest.ends_at) else "live"


def ensure_weekly(db: Session) -> Contest:
    ws = week_start()
    number = (ws - datetime(2026, 1, 5).date()).days // 7 + 1
    slug = f"weekly-{ws.isoformat()}"
    contest = db.scalar(select(Contest).where(Contest.slug == slug))
    if contest:
        return contest
    rng = random.Random(slug)
    pool = [p for p in q.problems(db) if not p["slug"].startswith(("oa-", "basics-"))]
    chosen = []
    for difficulty, points in SLOTS:
        options = [p["slug"] for p in pool if p["difficulty"] == difficulty and p["slug"] not in
                   {c["slug"] for c in chosen}] or [p["slug"] for p in pool if p["slug"] not in {c["slug"] for c in chosen}]
        chosen.append({"slug": rng.choice(sorted(options)), "points": points})
    start = datetime.combine(ws, datetime.min.time(), tzinfo=timezone.utc)
    contest = Contest(slug=slug, title=f"Weekly Contest #{number}", starts_at=start,
                      ends_at=start + timedelta(days=7) - timedelta(seconds=1), duration_minutes=DURATION_MINUTES,
                      problems=chosen)
    db.add(contest)
    db.commit()
    return contest


def standings(db: Session, contest: Contest) -> list[dict]:
    entries = db.scalars(select(ContestEntry).where(ContestEntry.contest_id == contest.id)).all()
    entries.sort(key=lambda e: (-e.score, e.penalty_minutes, e.id))
    return [{"rank": i, "score": e.score, "penalty": e.penalty_minutes, "solved": len(e.solved),
             "user": {"id": e.user.id, "name": e.user.name, "level": level_for(e.user.xp)["level"]}}
            for i, e in enumerate(entries, 1)]


def record_submission(entry: ContestEntry, contest: Contest, slug: str, accepted: bool) -> dict:
    """Update the entry after a judged submission. Returns {points, first_solve}."""
    points = next((p["points"] for p in contest.problems if p["slug"] == slug), 0)
    if slug in entry.solved:
        return {"points": 0, "first_solve": False}
    if not accepted:
        entry.wrong = {**entry.wrong, slug: entry.wrong.get(slug, 0) + 1}
        return {"points": 0, "first_solve": False}
    minutes = int((_now() - _aware(entry.started_at)).total_seconds() // 60)
    wrong = entry.wrong.get(slug, 0)
    entry.solved = {**entry.solved, slug: {"minutes": minutes, "wrong": wrong}}
    entry.score += points
    entry.penalty_minutes += minutes + WRONG_PENALTY * wrong
    return {"points": points, "first_solve": True}
