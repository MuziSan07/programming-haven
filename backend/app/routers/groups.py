"""Study groups: 5-8 people with the same target, a weekly AI challenge, a group leaderboard and chat."""

import secrets
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..content import store
from ..database import get_db
from ..deps import get_current_user
from ..models import GroupChallenge, GroupMember, GroupMessage, RoundAttempt, StudyGroup, User
from ..services import ai, moderation
from ..services.coach import TARGETS
from ..services.leagues import week_start
from ..services.scoring import level_for, solved_slugs, xp_since

router = APIRouter(prefix="/api/groups", tags=["groups"])

MIN_MEMBERS, MAX_MEMBERS = 2, 8


def _member(db: Session, group_id: int, user_id: int) -> GroupMember | None:
    return db.scalar(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id))


def _count(db: Session, group_id: int) -> int:
    return int(db.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group_id)) or 0)


def _summary(db: Session, g: StudyGroup, user: User) -> dict:
    me = _member(db, g.id, user.id)
    return {"id": g.id, "name": g.name, "target": g.target,
            "target_label": TARGETS.get(g.target, {}).get("label", g.target), "description": g.description,
            "members": _count(db, g.id), "max_members": g.max_members, "is_public": g.is_public,
            "joined": me is not None, "role": me.role if me else None,
            "invite_code": g.invite_code if me else None}


@router.get("")
def list_groups(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mine_ids = set(db.scalars(select(GroupMember.group_id).where(GroupMember.user_id == user.id)))
    groups = db.scalars(select(StudyGroup).order_by(StudyGroup.created_at.desc()).limit(200)).all()
    mine = [_summary(db, g, user) for g in groups if g.id in mine_ids]
    open_groups = [s for s in (_summary(db, g, user) for g in groups if g.is_public and g.id not in mine_ids)
                   if s["members"] < s["max_members"]]
    return {"mine": mine, "open": open_groups[:50],
            "targets": [{"id": k, "label": v["label"]} for k, v in TARGETS.items()]}


class GroupIn(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    target: str
    description: str = Field(default="", max_length=400)
    max_members: int = Field(default=MAX_MEMBERS, ge=5, le=MAX_MEMBERS)
    is_public: bool = True


@router.post("")
def create(body: GroupIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.target not in TARGETS:
        raise HTTPException(400, "Unknown target")
    verdict = moderation.moderate("post", f"Study group name: {body.name}\n{body.description}")
    if verdict["verdict"] == "rejected":
        raise HTTPException(400, verdict["reason"] or "That name or description isn't allowed")
    g = StudyGroup(name=body.name.strip(), target=body.target, description=body.description.strip(),
                   owner_id=user.id, invite_code=secrets.token_hex(4).upper(), max_members=body.max_members,
                   is_public=body.is_public)
    db.add(g)
    db.flush()
    db.add(GroupMember(group_id=g.id, user_id=user.id, role="owner"))
    db.commit()
    return _summary(db, g, user)


def _join(db: Session, g: StudyGroup, user: User) -> dict:
    if _member(db, g.id, user.id):
        return _summary(db, g, user)
    if _count(db, g.id) >= g.max_members:
        raise HTTPException(400, "This group is full")
    db.add(GroupMember(group_id=g.id, user_id=user.id))
    db.commit()
    return _summary(db, g, user)


@router.post("/{gid}/join")
def join(gid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.get(StudyGroup, gid)
    if not g:
        raise HTTPException(404, "Group not found")
    if not g.is_public:
        raise HTTPException(403, "This group is private. Ask a member for the invite code.")
    return _join(db, g, user)


class CodeIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)


@router.post("/join-code")
def join_code(body: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.scalar(select(StudyGroup).where(StudyGroup.invite_code == body.code.strip().upper()))
    if not g:
        raise HTTPException(404, "No group with that invite code")
    return _join(db, g, user)


@router.post("/{gid}/leave")
def leave(gid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    me = _member(db, gid, user.id)
    if not me:
        raise HTTPException(404, "You're not in this group")
    db.delete(me)
    db.flush()
    rest = db.scalars(select(GroupMember).where(GroupMember.group_id == gid).order_by(GroupMember.joined_at)).all()
    if not rest:
        db.delete(db.get(StudyGroup, gid))
    elif me.role == "owner":
        rest[0].role = "owner"
        db.get(StudyGroup, gid).owner_id = rest[0].user_id
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- weekly challenge

def _challenge(db: Session, g: StudyGroup) -> GroupChallenge:
    ws = week_start()
    ch = db.scalar(select(GroupChallenge).where(GroupChallenge.group_id == g.id, GroupChallenge.week_start == ws))
    if ch:
        return ch
    import random

    rng = random.Random(f"{g.id}-{ws}")
    problems = [p for p in q.problems(db) if not p["slug"].startswith("oa-")]
    picks = []
    for diff in ("Easy", "Medium", "Hard"):
        pool = sorted(p["slug"] for p in problems if p["difficulty"] == diff)
        if pool:
            picks.append(rng.choice(pool))
    by_slug = {p["slug"]: p for p in problems}
    tasks = [{"type": "problem", "ref": s, "title": by_slug[s]["title"], "difficulty": by_slug[s]["difficulty"],
              "href": f"/dsa/{s}"} for s in picks]
    debug = sorted(r["id"] for r in store.all_items(db, "debug"))
    if debug:
        rid = rng.choice(debug)
        item = store.get_item(db, "debug", rid)
        tasks.append({"type": "debug", "ref": rid, "title": item["title"], "difficulty": item["difficulty"],
                      "href": f"/rounds/debug/{rid}"})
    label = TARGETS.get(g.target, TARGETS["remote"])["label"]
    listing = "\n".join(f"- {t['title']} ({t['difficulty']})" for t in tasks)
    fallback = {"title": f"Week of {ws.strftime('%d %b')}: {label} sprint",
                "description": "Everyone solves the same set this week. Post your approach in the chat before "
                               "Friday and review one teammate's solution."}
    result, _ = ai.chat_json([
        {"role": "system", "content": "You write short, motivating weekly challenges for small study groups "
                                      "preparing for developer hiring screens. Respond only with JSON."},
        {"role": "user", "content": f"Group target: {label}. This week's tasks:\n{listing}\n\nReturn JSON: title "
                                    "(max 8 words), description (2 sentences: the theme and one group ritual, e.g. "
                                    "explain your solution in chat, mock-interview a teammate)."},
    ], lambda: fallback, fast=True)
    ch = GroupChallenge(group_id=g.id, week_start=ws, title=str(result.get("title") or fallback["title"])[:160],
                        description=str(result.get("description") or fallback["description"]), tasks=tasks)
    db.add(ch)
    db.commit()
    return ch


@router.get("/{gid}")
def detail(gid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.get(StudyGroup, gid)
    if not g:
        raise HTTPException(404, "Group not found")
    data = _summary(db, g, user)
    members = db.scalars(select(GroupMember).where(GroupMember.group_id == gid)).all()
    if not data["joined"]:
        return {**data, "member_names": [m.user.name for m in members]}
    ch = _challenge(db, g)
    ws = week_start()
    since = datetime.combine(ws, time.min, tzinfo=timezone.utc)
    xp = xp_since(db, [m.user_id for m in members], since)
    debug_done = {(r.user_id, r.round_id) for r in db.scalars(select(RoundAttempt).where(
        RoundAttempt.user_id.in_([m.user_id for m in members]), RoundAttempt.passed.is_(True)))}
    board = []
    for m in members:
        solved = solved_slugs(db, m.user_id)
        done = [t["ref"] for t in ch.tasks if (t["type"] == "problem" and t["ref"] in solved)
                or (t["type"] == "debug" and (m.user_id, t["ref"]) in debug_done)]
        board.append({"user": {"id": m.user.id, "name": m.user.name, "level": level_for(m.user.xp)["level"],
                               "streak": m.user.streak},
                      "role": m.role, "week_xp": xp.get(m.user_id, 0), "challenge_done": done,
                      "me": m.user_id == user.id})
    board.sort(key=lambda r: (-len(r["challenge_done"]), -r["week_xp"]))
    for i, r in enumerate(board, 1):
        r["rank"] = i
    msgs = db.scalars(select(GroupMessage).where(GroupMessage.group_id == gid, GroupMessage.status == "published")
                      .order_by(GroupMessage.id.desc()).limit(80)).all()
    return {**data, "challenge": {"title": ch.title, "description": ch.description, "tasks": ch.tasks,
                                  "week_start": ws.isoformat(),
                                  "ends_at": (since + timedelta(days=7)).isoformat()},
            "leaderboard": board, "group_week_xp": sum(xp.values()),
            "messages": [_msg_out(m) for m in reversed(msgs)]}


def _msg_out(m: GroupMessage) -> dict:
    return {"id": m.id, "body": m.body, "created_at": m.created_at.isoformat(),
            "user": {"id": m.user.id, "name": m.user.name}}


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@router.post("/{gid}/messages")
def post_message(gid: int, body: MessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not _member(db, gid, user.id):
        raise HTTPException(403, "Join the group to chat")
    text = body.body.strip()
    # Group chat is allowed to be casual; only spam and abuse are blocked
    verdict = moderation.moderate("comment", text, "Casual study-group chat between developers. Greetings and "
                                                   "motivation are fine; only block spam, abuse or scams.")
    msg = GroupMessage(group_id=gid, user_id=user.id, body=text, moderation=verdict,
                       status="hidden" if verdict["verdict"] == "rejected" else "published")
    db.add(msg)
    db.commit()
    if msg.status != "published":
        raise HTTPException(400, verdict["reason"] or "Message blocked by moderation")
    return _msg_out(msg)
