import math
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Comment, Hackathon, Like, Post, Report, User
from ..routers.admin import require_admin
from ..services import moderation
from ..services.scoring import award, level_for

router = APIRouter(tags=["community"])

KINDS = {"question", "discussion", "problem", "achievement"}
POSTS_PER_HOUR = 10
COMMENTS_PER_HOUR = 60
REPORTS_TO_HOLD = 3
XP_POST, XP_COMMENT, XP_SOLUTION = 5, 2, 15


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _author(u: User) -> dict:
    return {"id": u.id, "name": u.name, "role": u.target_role, "level": level_for(u.xp)["level"]}


def _clean_tags(tags: list[str]) -> list[str]:
    out = []
    for t in tags:
        t = re.sub(r"[^a-z0-9+#.\-]", "", t.lower().strip().replace(" ", "-"))[:24]
        if t and t not in out:
            out.append(t)
    return out[:5]


def _mod_view(item, viewer: User) -> dict | None:
    """Moderation details are visible to the author and to admins only."""
    if viewer.is_admin or item.user_id == viewer.id:
        return {"status": item.status, **{k: item.moderation.get(k) for k in ("verdict", "reason", "categories")}}
    return None


def _liked(db: Session, user: User, target_type: str, ids: list[int]) -> set[int]:
    if not ids:
        return set()
    return set(db.scalars(select(Like.target_id).where(Like.user_id == user.id, Like.target_type == target_type,
                                                        Like.target_id.in_(ids))))


def _post_out(p: Post, viewer: User, liked: bool, full: bool = False) -> dict:
    body = p.body if full else (p.body[:280] + ("…" if len(p.body) > 280 else ""))
    return {
        "id": p.id, "kind": p.kind, "title": p.title, "body": body, "tags": p.tags, "author": _author(p.author),
        "status": p.status, "moderation": _mod_view(p, viewer), "like_count": p.like_count,
        "comment_count": p.comment_count, "liked": liked, "solution_comment_id": p.solution_comment_id,
        "hackathon_id": p.hackathon_id, "hackathon": None, "created_at": _aware(p.created_at).isoformat(),
        "edited_at": _aware(p.edited_at).isoformat() if p.edited_at else None, "mine": p.user_id == viewer.id,
    }


def _rate_limit(db: Session, model, user: User, per_hour: int, label: str):
    since = _now() - timedelta(hours=1)
    count = db.scalar(select(func.count()).select_from(model).where(model.user_id == user.id, model.created_at >= since))
    if count >= per_hour and not user.is_admin:
        raise HTTPException(429, f"Slow down: you can create {per_hour} {label} per hour.")


def _purge_refs(db: Session, target_type: str, ids: list[int]):
    """Likes and reports point at posts/comments by id without a foreign key, so remove them explicitly."""
    if ids:
        for model in (Like, Report):
            db.query(model).filter(model.target_type == target_type, model.target_id.in_(ids)).delete(
                synchronize_session=False)


def _apply_moderation(item, result: dict):
    item.moderation = result
    item.status = moderation.STATUS_FOR[result["verdict"]]


# ---------------------------------------------------------------- posts

@router.get("/api/community/posts")
def list_posts(sort: str = "hot", kind: str | None = None, tag: str | None = None, q: str = "",
               hackathon: int | None = None, mine: bool = False, limit: int = 30, offset: int = 0,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Post)
    if mine:
        stmt = stmt.where(Post.user_id == user.id, Post.status != "removed")
    else:
        stmt = stmt.where(Post.status == "published")
    if kind in KINDS:
        stmt = stmt.where(Post.kind == kind)
    if hackathon:
        stmt = stmt.where(Post.hackathon_id == hackathon)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Post.title.ilike(like), Post.body.ilike(like)))
    if sort == "unanswered":
        stmt = stmt.where(Post.comment_count == 0)
    if sort == "top":
        stmt = stmt.order_by(Post.like_count.desc(), Post.created_at.desc())
    else:
        stmt = stmt.order_by(Post.created_at.desc())

    if sort == "hot":
        # Rank recent posts by engagement decayed by age (Hacker News-style)
        rows = db.scalars(stmt.limit(400)).all()
        now = _now()

        def heat(p: Post) -> float:
            hours = max(0.0, (now - _aware(p.created_at)).total_seconds() / 3600)
            return (1 + 2 * p.like_count + 3 * p.comment_count) / math.pow(hours + 2, 1.5)

        rows = sorted(rows, key=heat, reverse=True)
    else:
        rows = db.scalars(stmt.limit(400)).all()
    if tag:
        rows = [p for p in rows if tag.lower() in p.tags]
    total = len(rows)
    page = rows[offset:offset + min(limit, 50)]
    liked = _liked(db, user, "post", [p.id for p in page])
    tag_counts: dict[str, int] = {}
    for p in db.scalars(select(Post).where(Post.status == "published").order_by(Post.created_at.desc()).limit(300)):
        for t in p.tags:
            tag_counts[t] = tag_counts.get(t, 0) + 1
    return {"posts": [_post_out(p, user, p.id in liked) for p in page], "total": total,
            "trending_tags": sorted(tag_counts, key=lambda t: -tag_counts[t])[:12]}


class PostIn(BaseModel):
    kind: str = Field(default="discussion")
    title: str = Field(min_length=5, max_length=200)
    body: str = Field(min_length=10, max_length=20_000)
    tags: list[str] = Field(default_factory=list, max_length=8)
    hackathon_id: int | None = None


@router.post("/api/community/posts")
def create_post(body: PostIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.kind not in KINDS:
        raise HTTPException(400, f"Kind must be one of {sorted(KINDS)}")
    if body.hackathon_id and not db.get(Hackathon, body.hackathon_id):
        raise HTTPException(404, "Hackathon not found")
    _rate_limit(db, Post, user, POSTS_PER_HOUR, "posts")
    post = Post(user_id=user.id, kind=body.kind, title=body.title.strip(), body=body.body.strip(),
                tags=_clean_tags(body.tags), hackathon_id=body.hackathon_id)
    _apply_moderation(post, moderation.moderate("post", f"[{body.kind}] {post.title}\n\n{post.body}\nTags: {post.tags}"))
    db.add(post)
    if post.status == "published":
        award(user, XP_POST)
    db.commit()
    db.refresh(post)
    return _post_out(post, user, False, full=True)


def _visible_post(db: Session, post_id: int, user: User) -> Post:
    post = db.get(Post, post_id)
    if not post or (post.status != "published" and post.user_id != user.id and not user.is_admin):
        raise HTTPException(404, "Post not found")
    return post


def _comment_out(c: Comment, viewer: User, liked: set[int]) -> dict:
    hidden = c.deleted or c.status == "removed"
    return {
        "id": c.id, "parent_id": c.parent_id, "body": "" if hidden else c.body, "deleted": hidden,
        "author": None if hidden else _author(c.author), "like_count": c.like_count, "liked": c.id in liked,
        "status": c.status, "moderation": None if hidden else _mod_view(c, viewer),
        "created_at": _aware(c.created_at).isoformat(),
        "edited_at": _aware(c.edited_at).isoformat() if c.edited_at else None,
        "mine": c.user_id == viewer.id and not hidden, "children": [],
    }


def _comment_tree(db: Session, post: Post, viewer: User) -> list[dict]:
    rows = db.scalars(select(Comment).where(Comment.post_id == post.id).order_by(Comment.created_at)).all()
    visible = [c for c in rows if c.status == "published" or c.user_id == viewer.id or viewer.is_admin
               or c.deleted]
    liked = _liked(db, viewer, "comment", [c.id for c in visible])
    nodes = {c.id: _comment_out(c, viewer, liked) for c in visible}
    roots = []
    for c in visible:
        node = nodes[c.id]
        parent = nodes.get(c.parent_id) if c.parent_id else None
        (parent["children"] if parent else roots).append(node)

    def prune(items: list[dict]) -> list[dict]:
        # Drop deleted comments that no longer have any replies
        kept = []
        for n in items:
            n["children"] = prune(n["children"])
            if not (n["deleted"] and not n["children"]):
                kept.append(n)
        return kept

    return prune(roots)


@router.get("/api/community/posts/{post_id}")
def get_post(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = _visible_post(db, post_id, user)
    liked = bool(_liked(db, user, "post", [post.id]))
    data = _post_out(post, user, liked, full=True)
    if post.hackathon_id:
        h = db.get(Hackathon, post.hackathon_id)
        data["hackathon"] = {"id": h.id, "slug": h.slug, "title": h.title} if h else None
    data["comments"] = _comment_tree(db, post, user)
    return data


class PostEdit(BaseModel):
    title: str | None = Field(default=None, min_length=5, max_length=200)
    body: str | None = Field(default=None, min_length=10, max_length=20_000)
    tags: list[str] | None = Field(default=None, max_length=8)


@router.patch("/api/community/posts/{post_id}")
def edit_post(post_id: int, body: PostEdit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post or post.user_id != user.id or post.status == "removed":
        raise HTTPException(404, "Post not found")
    if body.title is not None:
        post.title = body.title.strip()
    if body.body is not None:
        post.body = body.body.strip()
    if body.tags is not None:
        post.tags = _clean_tags(body.tags)
    post.edited_at = _now()
    # Edits are moderated again, so a rejected post can be fixed and resubmitted
    _apply_moderation(post, moderation.moderate("post", f"[{post.kind}] {post.title}\n\n{post.body}\nTags: {post.tags}"))
    db.commit()
    return _post_out(post, user, bool(_liked(db, user, "post", [post.id])), full=True)


@router.delete("/api/community/posts/{post_id}")
def delete_post(post_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post or (post.user_id != user.id and not user.is_admin):
        raise HTTPException(404, "Post not found")
    comment_ids = list(db.scalars(select(Comment.id).where(Comment.post_id == post.id)))
    _purge_refs(db, "comment", comment_ids)
    _purge_refs(db, "post", [post.id])
    db.query(Comment).filter(Comment.post_id == post.id).delete(synchronize_session=False)
    db.delete(post)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- comments

class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)
    parent_id: int | None = None


@router.post("/api/community/posts/{post_id}/comments")
def add_comment(post_id: int, body: CommentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post or post.status != "published":
        raise HTTPException(404, "Post not found")
    parent = None
    if body.parent_id is not None:
        parent = db.get(Comment, body.parent_id)
        if not parent or parent.post_id != post.id or parent.deleted:
            raise HTTPException(404, "The comment you're replying to no longer exists")
    _rate_limit(db, Comment, user, COMMENTS_PER_HOUR, "comments")
    context = f"Post: {post.title}\n{post.body[:800]}" + (f"\n\nReplying to: {parent.body[:600]}" if parent else "")
    comment = Comment(post_id=post.id, user_id=user.id, parent_id=parent.id if parent else None, body=body.body.strip())
    _apply_moderation(comment, moderation.moderate("comment", comment.body, context))
    db.add(comment)
    if comment.status == "published":
        post.comment_count += 1
        award(user, XP_COMMENT)
    db.commit()
    db.refresh(comment)
    return _comment_out(comment, user, set())


class CommentEdit(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)


@router.patch("/api/community/comments/{comment_id}")
def edit_comment(comment_id: int, body: CommentEdit, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    c = db.get(Comment, comment_id)
    if not c or c.user_id != user.id or c.deleted or c.status == "removed":
        raise HTTPException(404, "Comment not found")
    post = db.get(Post, c.post_id)
    was_published = c.status == "published"
    c.body = body.body.strip()
    c.edited_at = _now()
    _apply_moderation(c, moderation.moderate("comment", c.body, f"Post: {post.title}\n{post.body[:800]}"))
    post.comment_count += (c.status == "published") - was_published
    db.commit()
    return _comment_out(c, user, _liked(db, user, "comment", [c.id]))


@router.delete("/api/community/comments/{comment_id}")
def delete_comment(comment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Comment, comment_id)
    if not c or (c.user_id != user.id and not user.is_admin) or c.deleted:
        raise HTTPException(404, "Comment not found")
    post = db.get(Post, c.post_id)
    if c.status == "published":
        post.comment_count = max(0, post.comment_count - 1)
    if post.solution_comment_id == c.id:
        post.solution_comment_id = None
    has_replies = db.scalar(select(func.count()).select_from(Comment).where(Comment.parent_id == c.id))
    if has_replies:
        c.deleted, c.body = True, ""  # keep the thread intact
    else:
        _purge_refs(db, "comment", [c.id])
        db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/api/community/posts/{post_id}/solution/{comment_id}")
def mark_solution(post_id: int, comment_id: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    c = db.get(Comment, comment_id)
    if not post or post.user_id != user.id:
        raise HTTPException(404, "Post not found")
    if not c or c.post_id != post.id or c.status != "published" or c.deleted:
        raise HTTPException(404, "Comment not found")
    if post.solution_comment_id == c.id:
        post.solution_comment_id = None
    else:
        if post.solution_comment_id is None and c.user_id != user.id:
            award(db.get(User, c.user_id), XP_SOLUTION)
        post.solution_comment_id = c.id
    db.commit()
    return {"solution_comment_id": post.solution_comment_id}


# ---------------------------------------------------------------- likes & reports

class TargetIn(BaseModel):
    target_type: str = Field(pattern="^(post|comment)$")
    target_id: int
    reason: str = Field(default="", max_length=300)


def _target(db: Session, t: TargetIn):
    model = Post if t.target_type == "post" else Comment
    item = db.get(model, t.target_id)
    if not item or item.status != "published" or getattr(item, "deleted", False):
        raise HTTPException(404, "Not found")
    return item


@router.post("/api/community/like")
def toggle_like(body: TargetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = _target(db, body)
    existing = db.scalar(select(Like).where(Like.user_id == user.id, Like.target_type == body.target_type,
                                            Like.target_id == body.target_id))
    if existing:
        db.delete(existing)
        item.like_count = max(0, item.like_count - 1)
        liked = False
    else:
        db.add(Like(user_id=user.id, target_type=body.target_type, target_id=body.target_id))
        item.like_count += 1
        liked = True
    db.commit()
    return {"liked": liked, "like_count": item.like_count}


@router.post("/api/community/report")
def report(body: TargetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = _target(db, body)
    if item.user_id == user.id:
        raise HTTPException(400, "You can't report your own content")
    if db.scalar(select(Report).where(Report.user_id == user.id, Report.target_type == body.target_type,
                                      Report.target_id == body.target_id)):
        return {"ok": True, "already": True}
    db.add(Report(user_id=user.id, target_type=body.target_type, target_id=body.target_id, reason=body.reason))
    db.flush()
    open_reports = db.scalar(select(func.count()).select_from(Report).where(
        Report.target_type == body.target_type, Report.target_id == body.target_id, Report.resolved.is_(False)))
    if open_reports >= REPORTS_TO_HOLD:
        # Enough members flagged it: hide until an admin decides
        item.status = "pending"
        item.moderation = {**item.moderation, "verdict": "review",
                           "reason": f"Held after {open_reports} community reports."}
        if body.target_type == "comment":
            post = db.get(Post, item.post_id)
            post.comment_count = max(0, post.comment_count - 1)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- admin moderation

def _queue_item(db: Session, kind: str, item) -> dict:
    reports = db.scalars(select(Report).where(Report.target_type == kind, Report.target_id == item.id)).all()
    base = {"type": kind, "id": item.id, "status": item.status, "moderation": item.moderation,
            "author": _author(item.author), "created_at": _aware(item.created_at).isoformat(),
            "reports": [{"reason": r.reason, "resolved": r.resolved} for r in reports]}
    if kind == "post":
        return {**base, "title": item.title, "body": item.body[:1500], "kind": item.kind, "post_id": item.id}
    post = db.get(Post, item.post_id)
    return {**base, "title": f"Comment on: {post.title if post else '?'}", "body": item.body[:1500],
            "post_id": item.post_id}


@router.get("/api/admin/moderation")
def moderation_queue(status: str = "pending", admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """status: pending | rejected | reported | published | removed | all"""
    items = []
    for kind, model in (("post", Post), ("comment", Comment)):
        stmt = select(model).order_by(model.created_at.desc()).limit(200)
        if status == "reported":
            ids = select(Report.target_id).where(Report.target_type == kind, Report.resolved.is_(False))
            stmt = stmt.where(model.id.in_(ids))
        elif status != "all":
            stmt = stmt.where(model.status == status)
        if kind == "comment":
            stmt = stmt.where(Comment.deleted.is_(False))
        items += [_queue_item(db, kind, i) for i in db.scalars(stmt)]
    items.sort(key=lambda i: i["created_at"], reverse=True)

    def count(model, st):
        return db.scalar(select(func.count()).select_from(model).where(model.status == st))

    stats = {st: count(Post, st) + count(Comment, st) for st in ("published", "pending", "rejected", "removed")}
    stats["reported"] = db.scalar(select(func.count(func.distinct(Report.target_id))).where(Report.resolved.is_(False)))
    stats["ai_decisions"] = sum(1 for m in db.scalars(select(Post.moderation)) if (m or {}).get("ai"))
    return {"items": items, "stats": stats}


class DecisionIn(BaseModel):
    action: str = Field(pattern="^(approve|reject|remove)$")
    note: str = Field(default="", max_length=300)


@router.post("/api/admin/moderation/{kind}/{item_id}")
def moderation_decision(kind: str, item_id: int, body: DecisionIn, admin: User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    model = {"post": Post, "comment": Comment}.get(kind)
    item = db.get(model, item_id) if model else None
    if not item:
        raise HTTPException(404, "Not found")
    was_published = item.status == "published"
    item.status = {"approve": "published", "reject": "rejected", "remove": "removed"}[body.action]
    item.moderation = {**item.moderation, "admin_action": body.action, "admin_note": body.note,
                       "admin_id": admin.id, "decided_at": _now().isoformat(),
                       "reason": body.note or item.moderation.get("reason", "")}
    if kind == "comment":
        post = db.get(Post, item.post_id)
        post.comment_count = max(0, post.comment_count + (item.status == "published") - was_published)
    for r in db.scalars(select(Report).where(Report.target_type == kind, Report.target_id == item_id)):
        r.resolved = True
    db.commit()
    return {"ok": True, "status": item.status}
