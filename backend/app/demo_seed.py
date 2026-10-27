"""Populate a local database with sample learners so leagues, contests and study groups look alive in a demo.

    python -m app.demo_seed            # add demo peers (safe to run again)
    python -m app.demo_seed --remove   # delete them

Demo peers use @demo.haven.local emails and random passwords nobody knows; they can't be logged into.
"""

import random
import secrets
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from .content import queries as q
from .database import SessionLocal
from .migrate import upgrade
from .models import ContestEntry, GroupMember, GroupMessage, StudyGroup, User, XpEvent
from .security import hash_password
from .services import contests, leagues

DOMAIN = "@demo.haven.local"
PEERS = [
    ("Daniyal Qureshi", "Backend Developer"), ("Sofia Marin", "Frontend Developer"), ("Kwame Mensah", "Full Stack Developer"),
    ("Ayesha Siddiqui", "Mobile Developer"), ("Lucas Ferreira", "Backend Developer"), ("Mei Lin", "Data Scientist"),
    ("Omar Haddad", "Full Stack Developer"), ("Elena Petrova", "AI Engineer"), ("Bilal Ahmed", "DevOps Engineer"),
    ("Priya Nair", "Frontend Developer"), ("Mateo Rossi", "Full Stack Developer"), ("Zainab Okafor", "Backend Developer"),
    ("Hamza Rauf", "Full Stack Developer"), ("Ana Kowalska", "Mobile Developer"), ("Yusuf Demir", "Backend Developer"),
    ("Grace Mwangi", "Data Scientist"), ("Arjun Mehta", "AI Engineer"), ("Laila Karimi", "Frontend Developer"),
]
GROUPS = [
    ("Toptal Algorithms Squad", "toptal", "Codility-style timed practice every weekday, 9pm PKT."),
    ("Turing Python Track", "turing", "Python MCQs and coding challenges for the Turing vetting."),
    ("System Design Saturdays", "ateam", "Whiteboard a new system every Saturday, review each other's diagrams."),
]
CHAT = [
    "Finished the sliding window one, the trick is shrinking only when the window becomes invalid.",
    "Anyone up for a mock live-coding session tonight? I'll interview, you solve.",
    "My Codility score went from 62 to 88 after a week of edge-case drills. Keep going!",
    "Reminder: weekly contest closes Sunday night, try to get at least the first two.",
]


def seed() -> None:
    upgrade()
    rng = random.Random(42)
    with SessionLocal() as db:
        users = []
        for name, role in PEERS:
            email = name.lower().replace(" ", ".") + DOMAIN
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                user = User(email=email, name=name, target_role=role, password_hash=hash_password(secrets.token_urlsafe(24)),
                            gender="unspecified", xp=rng.randint(300, 6000), streak=rng.randint(0, 45))
                db.add(user)
                db.flush()
            users.append(user)
        now = datetime.now(timezone.utc)
        week_start = datetime.combine(leagues.week_start(), datetime.min.time(), tzinfo=timezone.utc)
        for user in users:
            if not db.scalar(select(XpEvent.id).where(XpEvent.user_id == user.id, XpEvent.created_at >= week_start)):
                for _ in range(rng.randint(2, 12)):
                    at = week_start + (now - week_start) * rng.random()
                    db.add(XpEvent(user_id=user.id, amount=rng.choice([15, 20, 30, 30, 45, 50]), created_at=at))
        db.commit()
        for user in users:
            leagues.current_membership(db, user)

        contest = contests.ensure_weekly(db)
        problems = {p["slug"]: p for p in q.problems(db)}
        for user in users[:12]:
            if db.scalar(select(ContestEntry.id).where(ContestEntry.contest_id == contest.id,
                                                       ContestEntry.user_id == user.id)):
                continue
            started = contests._aware(contest.starts_at) + (now - contests._aware(contest.starts_at)) * rng.random() * 0.8
            entry = ContestEntry(contest_id=contest.id, user_id=user.id, started_at=started,
                                 deadline=started + timedelta(minutes=contest.duration_minutes), solved={}, wrong={},
                                 score=0, penalty_minutes=0)
            minute = 0
            for p in contest.problems:
                if rng.random() < 0.85 - 0.18 * contest.problems.index(p):
                    minute += rng.randint(6, 28)
                    wrong = rng.choice([0, 0, 0, 1, 2])
                    entry.solved[p["slug"]] = {"minutes": minute, "wrong": wrong}
                    entry.score += p["points"]
                    entry.penalty_minutes += minute + contests.WRONG_PENALTY * wrong
            assert all(slug in problems for slug in entry.solved)
            db.add(entry)
        db.commit()

        for i, (name, target, desc) in enumerate(GROUPS):
            group = db.scalar(select(StudyGroup).where(StudyGroup.name == name))
            if group:
                continue
            members = users[i * 5:(i * 5) + rng.randint(4, 6)]
            group = StudyGroup(name=name, target=target, description=desc, owner_id=members[0].id,
                               invite_code=secrets.token_hex(4).upper(), max_members=8, is_public=True)
            db.add(group)
            db.flush()
            for j, m in enumerate(members):
                db.add(GroupMember(group_id=group.id, user_id=m.id, role="owner" if j == 0 else "member"))
            for j, text in enumerate(CHAT[:3]):
                db.add(GroupMessage(group_id=group.id, user_id=members[j % len(members)].id, body=text,
                                    created_at=now - timedelta(hours=10 - j * 3)))
        db.commit()
        print(f"Demo peers ready: {len(users)} learners, contest '{contest.title}', {len(GROUPS)} study groups.")


def remove() -> None:
    with SessionLocal() as db:
        ids = list(db.scalars(select(User.id).where(User.email.like(f"%{DOMAIN}"))))
        group_ids = list(db.scalars(select(StudyGroup.id).where(StudyGroup.owner_id.in_(ids))))
        db.execute(delete(StudyGroup).where(StudyGroup.id.in_(group_ids)))
        db.execute(delete(User).where(User.id.in_(ids)))
        db.commit()
        print(f"Removed {len(ids)} demo peers.")


if __name__ == "__main__":
    remove() if "--remove" in sys.argv else seed()
