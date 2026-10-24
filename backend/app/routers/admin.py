from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content import store
from ..content.validate import Report, run_job, validate_structure
from ..database import get_db
from ..deps import get_current_user
from ..models import (Comment, ContentItem, Hackathon, InterviewSession, Post, ProjectSubmission, QuestionAttempt,
                      Submission, TestAttempt, User)

router = APIRouter(prefix="/api/admin", tags=["admin"])

KIND_LIST = list(store.KINDS.values())


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "Admins only")
    return user


def _title(kind: str, data: dict) -> str:
    return str(data.get("title") or data.get("name") or data.get("question") or data.get("id") or "")[:120]


def _row_out(row: ContentItem, full: bool = False) -> dict:
    out = {"kind": row.kind, "slug": row.slug, "title": _title(row.kind, row.data), "source": row.source,
           "published": row.published, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
    for key in ("level", "difficulty", "topic", "niche", "track_id", "pattern"):
        if key in row.data:
            out[key] = row.data[key]
    if full:
        out["data"] = row.data
    return out


def _check(db: Session, kind: str, data: dict, run_checks: bool) -> list[str]:
    if kind not in KIND_LIST:
        raise HTTPException(400, f"Unknown kind {kind}")
    seeds: dict[str, list] = {k: [] for k in KIND_LIST}
    seeds[kind] = [data]
    report = Report()
    try:
        jobs = validate_structure(seeds, report, store.all_items(db, "problem") + ([data] if kind == "problem" else []),
                                  store.all_items(db, "track"))
    except (KeyError, TypeError, AttributeError) as exc:
        return [f"Malformed item: {exc}"]
    if run_checks and jobs and not report.errors:
        with ThreadPoolExecutor(max_workers=4) as pool:
            report.errors += [e for e in pool.map(run_job, jobs) if e]
    return report.errors


class ItemIn(BaseModel):
    data: dict
    published: bool = True
    run_checks: bool = False


@router.get("/stats")
def stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(ContentItem.kind, func.count()).group_by(ContentItem.kind)).all())
    recent = db.scalars(select(User).order_by(User.id.desc()).limit(8)).all()
    return {
        "content": {k: counts.get(k, 0) for k in KIND_LIST},
        "users": db.scalar(select(func.count()).select_from(User)),
        "submissions": db.scalar(select(func.count()).select_from(Submission)),
        "tests_taken": db.scalar(select(func.count()).select_from(TestAttempt)),
        "interviews": db.scalar(select(func.count()).select_from(InterviewSession)),
        "questions_answered": db.scalar(select(func.count()).select_from(QuestionAttempt)),
        "projects_submitted": db.scalar(select(func.count()).select_from(ProjectSubmission)),
        "posts": db.scalar(select(func.count()).select_from(Post)),
        "comments": db.scalar(select(func.count()).select_from(Comment)),
        "pending_moderation": db.scalar(select(func.count()).select_from(Post).where(Post.status == "pending"))
        + db.scalar(select(func.count()).select_from(Comment).where(Comment.status == "pending")),
        "hackathons": db.scalar(select(func.count()).select_from(Hackathon)),
        "recent_users": [{"id": u.id, "name": u.name, "email": u.email, "created_at": u.created_at.isoformat()}
                         for u in recent],
    }


@router.get("/content")
def list_content(kind: str, search: str = "", admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(ContentItem).where(ContentItem.kind == kind)).all()
    rows.sort(key=lambda r: (r.data.get("order", 10**9), r.id))
    needle = search.lower().strip()
    items = [_row_out(r) for r in rows]
    if needle:
        items = [i for i in items if needle in i["slug"].lower() or needle in i["title"].lower()]
    return items


@router.get("/content/{kind}/{slug}")
def get_content(kind: str, slug: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.scalar(select(ContentItem).where(ContentItem.kind == kind, ContentItem.slug == slug))
    if not row:
        raise HTTPException(404, "Not found")
    return _row_out(row, full=True)


@router.post("/validate/{kind}")
def validate(kind: str, body: ItemIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"errors": _check(db, kind, body.data, body.run_checks)}


def _save(db: Session, kind: str, slug: str | None, body: ItemIn) -> ContentItem:
    errors = _check(db, kind, body.data, body.run_checks)
    if errors:
        raise HTTPException(422, {"errors": errors})
    new_slug = store.slug_of(kind, body.data)
    if slug is not None and new_slug != slug:
        raise HTTPException(400, "The id/slug can't be changed. Create a new item instead.")
    row = db.scalar(select(ContentItem).where(ContentItem.kind == kind, ContentItem.slug == new_slug))
    if slug is None and row is not None:
        raise HTTPException(409, f"A {kind} with id '{new_slug}' already exists")
    if row is None:
        if slug is not None:
            raise HTTPException(404, "Not found")
        body.data.setdefault("order", 10**6 + (db.scalar(select(func.count()).select_from(ContentItem)) or 0))
        row = ContentItem(kind=kind, slug=new_slug, data=body.data, source="admin", published=body.published)
        db.add(row)
    else:
        body.data.setdefault("order", row.data.get("order", 10**6))
        row.data = body.data
        row.source = "admin"
        row.published = body.published
    db.commit()
    store.invalidate()
    return row


@router.post("/content/{kind}")
def create_content(kind: str, body: ItemIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _row_out(_save(db, kind, None, body), full=True)


@router.put("/content/{kind}/{slug}")
def update_content(kind: str, slug: str, body: ItemIn, admin: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    return _row_out(_save(db, kind, slug, body), full=True)


@router.delete("/content/{kind}/{slug}")
def delete_content(kind: str, slug: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.scalar(select(ContentItem).where(ContentItem.kind == kind, ContentItem.slug == slug))
    if not row:
        raise HTTPException(404, "Not found")
    if row.source == "seed":
        # Seed items would come back on restart; unpublish them instead
        row.published = False
    else:
        db.delete(row)
    db.commit()
    store.invalidate()
    return {"ok": True, "unpublished": row.source == "seed"}


@router.post("/content/{kind}/{slug}/reset")
def reset_content(kind: str, slug: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    seed_item = next((i for i in store.load_seed_files().get(kind, []) if store.slug_of(kind, i) == slug), None)
    row = db.scalar(select(ContentItem).where(ContentItem.kind == kind, ContentItem.slug == slug))
    if not seed_item or not row:
        raise HTTPException(404, "No seed version of this item")
    row.data, row.source, row.published = seed_item, "seed", True
    db.commit()
    store.invalidate()
    return _row_out(row, full=True)


class ImportIn(BaseModel):
    bundle: dict
    run_checks: bool = False


@router.post("/import")
def import_bundle(body: ImportIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    saved, errors = 0, []
    for key, items in body.bundle.items():
        kind = store.KINDS.get(key)
        if not kind or not isinstance(items, list):
            errors.append(f"Unknown bundle key '{key}'")
            continue
        for data in items:
            item_errors = _check(db, kind, data, body.run_checks)
            if item_errors:
                errors += item_errors
                continue
            slug = store.slug_of(kind, data)
            exists = db.scalar(select(ContentItem).where(ContentItem.kind == kind, ContentItem.slug == slug))
            _save(db, kind, slug if exists else None, ItemIn(data=data, published=True))
            saved += 1
    return {"saved": saved, "errors": errors}


@router.get("/export")
def export_bundle(kind: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    plural = next(k for k, v in store.KINDS.items() if v == kind)
    rows = db.scalars(select(ContentItem).where(ContentItem.kind == kind)).all()
    return {plural: [r.data for r in sorted(rows, key=lambda r: (r.data.get("order", 10**9), r.id))]}


@router.get("/users")
def users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(User).order_by(User.id.desc()).limit(500)).all()
    return [{"id": u.id, "name": u.name, "email": u.email, "is_admin": u.is_admin, "xp": u.xp, "streak": u.streak,
             "target_role": u.target_role, "created_at": u.created_at.isoformat()} for u in rows]


class UserPatch(BaseModel):
    is_admin: bool = Field(...)


@router.patch("/users/{user_id}")
def patch_user(user_id: int, body: UserPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id and not body.is_admin:
        raise HTTPException(400, "You can't remove your own admin rights")
    u.is_admin = body.is_admin
    db.commit()
    return {"id": u.id, "is_admin": u.is_admin}
