"""Typed accessors over the content store used by the routers."""

from sqlalchemy.orm import Session

from . import store

PATTERN_ORDER = [
    "Arrays & Hashing", "Two Pointers", "Sliding Window", "Stack", "Binary Search", "Linked List", "Intervals",
    "Matrix", "Design", "Trees", "Tries", "Heap / Priority Queue", "Graphs", "Backtracking", "Greedy",
    "Dynamic Programming", "Bit Manipulation", "Math",
]
LEVEL_ORDER = ["Basic", "Intermediate", "Advanced", "Expert"]
DIFFICULTY_ORDER = ["Easy", "Medium", "Hard", "Expert"]


def tracks(db: Session) -> list[dict]:
    return store.all_items(db, "track")


def track(db: Session, track_id: str) -> dict | None:
    return store.get_item(db, "track", track_id)


def track_lessons(db: Session, track_id: str) -> list[dict]:
    """Lessons of a track ordered by unit, then by their own order."""
    t = track(db, track_id)
    if not t:
        return []
    unit_rank = {u["id"]: i for i, u in enumerate(t.get("units", []))}
    lessons = [l for l in store.all_items(db, "lesson") if l.get("track_id") == track_id]
    return sorted(lessons, key=lambda l: (unit_rank.get(l.get("unit_id"), 999), l.get("order", 0)))


def lesson(db: Session, lesson_id: str) -> dict | None:
    return store.get_item(db, "lesson", lesson_id)


def all_lesson_ids(db: Session) -> list[str]:
    return [l["id"] for t in tracks(db) for l in track_lessons(db, t["id"])]


def problems(db: Session) -> list[dict]:
    return store.all_items(db, "problem")


def problem(db: Session, slug: str) -> dict | None:
    return store.get_item(db, "problem", slug)


def patterns(db: Session) -> list[str]:
    present = {p["pattern"] for p in problems(db)}
    ordered = [p for p in PATTERN_ORDER if p in present]
    return ordered + sorted(present - set(ordered))


def tests(db: Session) -> list[dict]:
    return store.all_items(db, "test")


def test(db: Session, test_id: str) -> dict | None:
    return store.get_item(db, "test", test_id)


def questions(db: Session) -> list[dict]:
    return store.all_items(db, "question")


def question(db: Session, qid: str) -> dict | None:
    return store.get_item(db, "question", qid)


def projects(db: Session) -> list[dict]:
    return store.all_items(db, "project")


def project(db: Session, pid: str) -> dict | None:
    return store.get_item(db, "project", pid)


def knowledge(db: Session) -> list[dict]:
    return store.all_items(db, "knowledge")


def personas(db: Session) -> list[dict]:
    return store.all_items(db, "persona")


def persona(db: Session, pid: str | None) -> dict:
    found = store.get_item(db, "persona", pid) if pid else None
    if found:
        return found
    all_p = personas(db)
    return all_p[0] if all_p else {"id": "aria", "name": "Aria", "gender": "female", "title": "Interviewer",
                                   "personality": "", "appearance": {}, "voice": "autumn",
                                   "browser_voice": "female"}


def default_persona_id(db: Session, gender: str) -> str:
    """The interviewer defaults to the opposite gender of the candidate; users can change it."""
    want = {"male": "female", "female": "male"}.get(gender)
    for p in personas(db):
        if want is None or p.get("gender") == want:
            return p["id"]
    return persona(db, None)["id"]


def relevant_knowledge(db: Session, text: str, limit: int = 3) -> list[dict]:
    """Tiny keyword retrieval over the knowledge base for interviewer prompts."""
    words = {w for w in text.lower().replace(",", " ").split() if len(w) > 3}
    scored = []
    for doc in knowledge(db):
        hay = f"{doc.get('title', '')} {' '.join(doc.get('tags', []))} {doc.get('content', '')}".lower()
        score = sum(hay.count(w) for w in words) + 5 * sum(t in text.lower() for t in doc.get("tags", []))
        if score:
            scored.append((score, doc))
    return [d for _, d in sorted(scored, key=lambda x: -x[0])[:limit]]
