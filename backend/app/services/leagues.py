"""Weekly XP leagues (Duolingo-style). Weeks start Monday 00:00 UTC.

Each week users are placed in a group of up to GROUP_SIZE in their tier. When the week ends (processed
lazily the next time anyone in the group is looked up), the top players are promoted a tier and the
bottom ones demoted.
"""

import math
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import LeagueMembership, User
from .scoring import level_for, xp_since

TIERS = ["Bronze", "Silver", "Gold", "Sapphire", "Ruby", "Emerald", "Diamond"]
TIER_COLORS = ["#cd7f32", "#c0c0c0", "#f5c542", "#3b82f6", "#e11d48", "#10b981", "#a78bfa"]
GROUP_SIZE = 30
MIN_XP_TO_PROMOTE = 50


def week_start(d: date | None = None) -> date:
    d = d or datetime.now(timezone.utc).date()
    return d - timedelta(days=d.weekday())


def _window(ws: date) -> tuple[datetime, datetime]:
    start = datetime.combine(ws, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=7)


def _zones(n: int, tier: int) -> tuple[int, int]:
    """(promote_count, demote_count) for a group of n players."""
    promote = 0 if tier == len(TIERS) - 1 else min(7, max(1, math.ceil(n * 0.25)))
    demote = 0 if tier == 0 or n < 5 else min(5, n // 5)
    return promote, demote


def _ranked(db: Session, members: list[LeagueMembership], ws: date) -> list[tuple[LeagueMembership, int]]:
    start, end = _window(ws)
    xp = xp_since(db, [m.user_id for m in members], start)
    if datetime.now(timezone.utc) > end:
        # Past week: only count XP earned inside it
        later = xp_since(db, [m.user_id for m in members], end)
        xp = {uid: xp.get(uid, 0) - later.get(uid, 0) for uid in xp}
    return sorted(((m, xp.get(m.user_id, 0)) for m in members), key=lambda x: (-x[1], x[0].id))


def _finalize(db: Session, m: LeagueMembership) -> None:
    group = db.scalars(select(LeagueMembership).where(LeagueMembership.week_start == m.week_start,
                                                      LeagueMembership.tier == m.tier,
                                                      LeagueMembership.group_no == m.group_no)).all()
    ranked = _ranked(db, group, m.week_start)
    promote, demote = _zones(len(ranked), m.tier)
    for rank, (member, xp) in enumerate(ranked, 1):
        member.final_rank = rank
        if rank <= promote and xp >= MIN_XP_TO_PROMOTE:
            member.outcome = "promoted"
        elif demote and rank > len(ranked) - demote:
            member.outcome = "demoted"
        else:
            member.outcome = "stayed"


def current_membership(db: Session, user: User) -> LeagueMembership:
    ws = week_start()
    m = db.scalar(select(LeagueMembership).where(LeagueMembership.user_id == user.id, LeagueMembership.week_start == ws))
    if m:
        return m
    last = db.scalar(select(LeagueMembership).where(LeagueMembership.user_id == user.id)
                     .order_by(LeagueMembership.week_start.desc()))
    tier = 0
    if last:
        if last.outcome is None:
            _finalize(db, last)
        tier = last.tier + {"promoted": 1, "demoted": -1}.get(last.outcome, 0)
        tier = max(0, min(len(TIERS) - 1, tier))
    # Join the first group in this tier with space, or open a new one
    counts = dict(db.execute(select(LeagueMembership.group_no, func.count()).where(
        LeagueMembership.week_start == ws, LeagueMembership.tier == tier).group_by(LeagueMembership.group_no)).all())
    group_no = next((g for g, c in sorted(counts.items()) if c < GROUP_SIZE), max(counts, default=0) + 1)
    m = LeagueMembership(user_id=user.id, week_start=ws, tier=tier, group_no=group_no)
    db.add(m)
    db.commit()
    return m


def standings(db: Session, user: User) -> dict:
    m = current_membership(db, user)
    group = db.scalars(select(LeagueMembership).where(LeagueMembership.week_start == m.week_start,
                                                      LeagueMembership.tier == m.tier,
                                                      LeagueMembership.group_no == m.group_no)).all()
    ranked = _ranked(db, group, m.week_start)
    promote, demote = _zones(len(ranked), m.tier)
    _, end = _window(m.week_start)
    rows = []
    for rank, (member, xp) in enumerate(ranked, 1):
        zone = "promote" if rank <= promote else "demote" if demote and rank > len(ranked) - demote else "safe"
        rows.append({"rank": rank, "xp": xp, "zone": zone, "me": member.user_id == user.id,
                     "user": {"id": member.user.id, "name": member.user.name,
                              "level": level_for(member.user.xp)["level"]}})
    last = db.scalar(select(LeagueMembership).where(LeagueMembership.user_id == user.id,
                                                    LeagueMembership.week_start < m.week_start)
                     .order_by(LeagueMembership.week_start.desc()))
    return {
        "tier": m.tier, "tier_name": TIERS[m.tier], "tier_color": TIER_COLORS[m.tier],
        "tiers": [{"name": t, "color": c} for t, c in zip(TIERS, TIER_COLORS)],
        "week_start": m.week_start.isoformat(), "ends_at": end.isoformat(),
        "promote_count": promote, "demote_count": demote, "min_xp_to_promote": MIN_XP_TO_PROMOTE,
        "standings": rows,
        "last_week": {"tier_name": TIERS[last.tier], "rank": last.final_rank, "outcome": last.outcome} if last else None,
    }
