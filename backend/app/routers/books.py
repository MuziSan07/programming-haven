from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Book, BookProgress, User
from ..routers.admin import require_admin
from ..services import books as store

router = APIRouter(prefix="/api", tags=["books"])


def _split_tags(raw: str | list[str]) -> list[str]:
    items = raw if isinstance(raw, list) else raw.split(",")
    seen = []
    for t in (str(x).strip()[:40] for x in items):
        if t and t.lower() not in {s.lower() for s in seen}:
            seen.append(t)
    return seen[:12]


def _book_out(b: Book, progress: BookProgress | None = None, readers: int | None = None) -> dict:
    out = {"id": b.id, "title": b.title, "author": b.author, "description": b.description, "category": b.category,
           "tags": b.tags or [], "format": b.format, "size_bytes": b.size_bytes, "pages": b.pages,
           "cover_url": f"/api/books/{b.id}/cover?v={int(b.updated_at.timestamp())}" if b.cover else None,
           "published": b.published, "created_at": b.created_at.isoformat(),
           "progress": {"location": progress.location, "percent": progress.percent,
                        "updated_at": progress.updated_at.isoformat()} if progress else None}
    if readers is not None:
        out["readers"] = readers
        out["original_name"] = b.original_name
    return out


def _visible(db: Session, book_id: int, user: User) -> Book:
    b = db.get(Book, book_id)
    if not b or (not b.published and not user.is_admin):
        raise HTTPException(404, "Book not found")
    return b


def _raise(e: store.BookError):
    raise HTTPException(e.status, e.message) from e


# ---------------------------------------------------------------- readers

@router.get("/books")
def list_books(search: str = "", category: str = "", user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    stmt = select(Book).where(Book.published.is_(True))
    if category:
        stmt = stmt.where(Book.category == category)
    if search.strip():
        like = f"%{search.strip()[:80]}%"
        stmt = stmt.where(or_(Book.title.ilike(like), Book.author.ilike(like), Book.description.ilike(like)))
    rows = db.scalars(stmt.order_by(Book.created_at.desc())).all()
    progress = {p.book_id: p for p in db.scalars(select(BookProgress).where(BookProgress.user_id == user.id))}
    categories = db.execute(select(Book.category, func.count()).where(Book.published.is_(True))
                            .group_by(Book.category).order_by(Book.category)).all()
    reading = sorted((p for p in progress.values() if 0 < p.percent < 99.5), key=lambda p: p.updated_at, reverse=True)
    by_id = {b.id: b for b in db.scalars(select(Book).where(Book.id.in_([p.book_id for p in reading]),
                                                         Book.published.is_(True)))}
    return {"books": [_book_out(b, progress.get(b.id)) for b in rows],
            "categories": [{"name": c, "count": n} for c, n in categories],
            "continue": [_book_out(by_id[p.book_id], p) for p in reading if p.book_id in by_id][:6]}


@router.get("/books/{book_id}")
def get_book(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = _visible(db, book_id, user)
    p = db.scalar(select(BookProgress).where(BookProgress.user_id == user.id, BookProgress.book_id == b.id))
    return _book_out(b, p)


@router.get("/books/{book_id}/file")
def book_file(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    b = _visible(db, book_id, user)
    path = store.path_for(b.filename)
    if not path.exists():
        raise HTTPException(410, "The file for this book is missing. Ask an admin to upload it again.")
    return FileResponse(path, media_type=store.media_type(b.filename), content_disposition_type="inline",
                        filename=f"{b.title[:80]}.{b.format}")


@router.get("/books/{book_id}/cover")
def book_cover(book_id: int, db: Session = Depends(get_db)):
    # Public so <img> tags can load it; covers are not sensitive
    b = db.get(Book, book_id)
    if not b or not b.cover or not store.path_for(b.cover).exists():
        raise HTTPException(404, "No cover")
    return FileResponse(store.path_for(b.cover), media_type=store.media_type(b.cover),
                        headers={"Cache-Control": "public, max-age=86400"})


class ProgressIn(BaseModel):
    location: str = Field(max_length=500)
    percent: float = Field(ge=0, le=100)


@router.put("/books/{book_id}/progress")
def save_progress(book_id: int, body: ProgressIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    b = _visible(db, book_id, user)
    p = db.scalar(select(BookProgress).where(BookProgress.user_id == user.id, BookProgress.book_id == b.id))
    if p is None:
        p = BookProgress(user_id=user.id, book_id=b.id)
        db.add(p)
    p.location, p.percent = body.location, round(body.percent, 1)
    db.commit()
    return {"location": p.location, "percent": p.percent}


# ---------------------------------------------------------------- admin

@router.get("/admin/books")
def admin_list(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    readers = dict(db.execute(select(BookProgress.book_id, func.count()).group_by(BookProgress.book_id)).all())
    rows = db.scalars(select(Book).order_by(Book.created_at.desc())).all()
    total = sum(b.size_bytes for b in rows)
    return {"books": [_book_out(b, readers=readers.get(b.id, 0)) for b in rows], "total_bytes": total,
            "max_mb": get_settings().max_book_mb}


@router.post("/admin/books")
async def admin_upload(file: UploadFile = File(...), title: str = Form(""), author: str = Form(""),
                       description: str = Form(""), category: str = Form(""), tags: str = Form(""),
                       published: bool = Form(True), cover: UploadFile | None = File(None),
                       admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    temp = None
    stored, cover_name = None, None
    try:
        temp, size = await store.save_upload(file)
        fmt = store.detect_format(store.path_for(temp))
        stored = store.finalize(temp, fmt)
        temp = None
        path = store.path_for(stored)
        meta = store.pdf_metadata(path) if fmt == "pdf" else store.epub_metadata(path)
        if cover is not None and cover.filename:
            data = await store.read_cover(cover)
            cover_name = store.save_cover(data, store.cover_extension(data))
        elif meta["cover"]:
            cover_name = store.save_cover(*meta["cover"])
    except store.BookError as e:
        store.remove(temp)
        store.remove(stored)
        store.remove(cover_name)
        _raise(e)
    book = Book(title=(title.strip() or meta["title"] or store.title_from_filename(file.filename))[:300],
                author=(author.strip() or meta["author"])[:200],
                description=(description.strip() or meta["description"])[:5000],
                category=(category.strip() or "General")[:60], tags=_split_tags(tags), format=fmt, filename=stored,
                original_name=(file.filename or "")[:300], size_bytes=size, pages=meta["pages"], cover=cover_name,
                published=published, uploaded_by=admin.id)
    db.add(book)
    db.commit()
    return _book_out(book, readers=0)


class BookPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    author: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: str | None = Field(default=None, min_length=1, max_length=60)
    tags: list[str] | None = Field(default=None, max_length=12)
    published: bool | None = None


@router.put("/admin/books/{book_id}")
def admin_update(book_id: int, body: BookPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    b = db.get(Book, book_id)
    if not b:
        raise HTTPException(404, "Book not found")
    data = body.model_dump(exclude_none=True)
    if "tags" in data:
        data["tags"] = _split_tags(data["tags"])
    for key, value in data.items():
        setattr(b, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    return _book_out(b, readers=db.scalar(select(func.count()).select_from(BookProgress)
                                          .where(BookProgress.book_id == b.id)))


@router.post("/admin/books/{book_id}/cover")
async def admin_cover(book_id: int, cover: UploadFile = File(...), admin: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    b = db.get(Book, book_id)
    if not b:
        raise HTTPException(404, "Book not found")
    try:
        data = await store.read_cover(cover)
        name = store.save_cover(data, store.cover_extension(data))
    except store.BookError as e:
        _raise(e)
    old, b.cover = b.cover, name
    db.commit()
    store.remove(old)
    return _book_out(b, readers=db.scalar(select(func.count()).select_from(BookProgress)
                                          .where(BookProgress.book_id == b.id)))


@router.delete("/admin/books/{book_id}")
def admin_delete(book_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    b = db.get(Book, book_id)
    if not b:
        raise HTTPException(404, "Book not found")
    files = (b.filename, b.cover)
    db.query(BookProgress).filter(BookProgress.book_id == b.id).delete()
    db.delete(b)
    db.commit()
    for name in files:
        store.remove(name)
    return {"ok": True}
