"""Database-backed content store.

All learning content (tracks, lessons, problems, tests, questions, projects, knowledge base,
interviewer personas) lives in the `content_items` table so admins can edit it at runtime.

Seed content ships as JSON bundles in `content/seed/**/*.json`. Each bundle is an object whose
keys are kind names (plural) mapping to lists of items, e.g. {"lessons": [...], "problems": [...]}.
On startup, seed items are inserted or refreshed; items edited in the admin panel
(source="admin") are never overwritten by seeds.
"""

import hashlib
import json
import logging
import threading
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AppMeta, ContentItem

log = logging.getLogger("haven.content")

SEED_DIR = Path(__file__).parent / "seed"

# plural bundle key -> kind
KINDS = {
    "tracks": "track",
    "lessons": "lesson",
    "problems": "problem",
    "tests": "test",
    "questions": "question",
    "projects": "project",
    "knowledge": "knowledge",
    "personas": "persona",
}
# Field used as each kind's unique slug
SLUG_FIELD = {"problem": "slug"}

_lock = threading.Lock()
_cache: dict[str, dict[str, dict]] | None = None


def slug_of(kind: str, item: dict) -> str:
    return str(item[SLUG_FIELD.get(kind, "id")])


def load_seed_files() -> dict[str, list[dict]]:
    """Read every seed bundle, in path order, assigning a stable `order` per kind."""
    out: dict[str, list[dict]] = {k: [] for k in KINDS.values()}
    for path in sorted(SEED_DIR.rglob("*.json")):
        bundle = json.loads(path.read_text(encoding="utf-8"))
        for key, items in bundle.items():
            kind = KINDS.get(key)
            if kind is None:
                raise ValueError(f"{path.name}: unknown bundle key '{key}'")
            for item in items:
                item.setdefault("order", len(out[kind]))
                out[kind].append(item)
    return out


def seed_fingerprint() -> str:
    h = hashlib.sha256()
    for path in sorted(SEED_DIR.rglob("*.json")):
        stat = path.stat()
        h.update(f"{path.relative_to(SEED_DIR)}:{stat.st_size}:{stat.st_mtime_ns}".encode())
    return h.hexdigest()


def seed(db: Session, force: bool = False) -> None:
    """Insert/refresh seed content. Skipped when the seed files haven't changed since the last run."""
    fingerprint = seed_fingerprint()
    meta = db.get(AppMeta, "seed_fingerprint")
    if not force and meta is not None and meta.value == fingerprint:
        log.info("Content seed unchanged, skipping")
        return
    seeds = load_seed_files()
    existing = {(c.kind, c.slug): c for c in db.scalars(select(ContentItem))}
    added = updated = 0
    for kind, items in seeds.items():
        for item in items:
            slug = slug_of(kind, item)
            row = existing.get((kind, slug))
            if row is None:
                db.add(ContentItem(kind=kind, slug=slug, data=item, source="seed"))
                added += 1
            elif row.source == "seed" and row.data != item:
                row.data = item
                updated += 1
    if meta is None:
        db.add(AppMeta(key="seed_fingerprint", value=fingerprint))
    else:
        meta.value = fingerprint
    db.commit()
    invalidate()
    log.info("Content seeded: %d added, %d refreshed", added, updated)


def invalidate() -> None:
    global _cache
    with _lock:
        _cache = None


def _load(db: Session) -> dict[str, dict[str, dict]]:
    global _cache
    with _lock:
        if _cache is None:
            cache: dict[str, dict[str, dict]] = {k: {} for k in KINDS.values()}
            rows = db.scalars(select(ContentItem).where(ContentItem.published.is_(True))).all()
            for row in sorted(rows, key=lambda r: (r.data.get("order", 10**9), r.id)):
                cache.setdefault(row.kind, {})[row.slug] = row.data
            _cache = cache
        return _cache


def all_items(db: Session, kind: str) -> list[dict]:
    return list(_load(db).get(kind, {}).values())


def get_item(db: Session, kind: str, slug: str) -> dict | None:
    return _load(db).get(kind, {}).get(slug)


def by_slug(db: Session, kind: str) -> dict[str, dict]:
    return _load(db).get(kind, {})
