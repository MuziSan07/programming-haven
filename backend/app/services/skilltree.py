"""Skill tree: a prerequisite graph over DSA patterns, language tracks and interview topics, with per-user mastery."""

import re
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..models import LessonProgress, QuestionAttempt, TestAttempt, User
from .scoring import solved_slugs

MASTERED = 80
UNLOCK = 40
DIFFICULTY_WEIGHT = {"Easy": 1, "Medium": 2, "Hard": 3, "Expert": 4}
DIFFICULTY_ORDER = {"Easy": 0, "Medium": 1, "Hard": 2, "Expert": 3}
QUESTION_CONFIDENCE = 15  # accuracy counts fully once this many distinct questions are attempted
# Aggregate nodes summarise their children and never lock them.
AGGREGATE_KINDS = {"track", "group"}

BRANCHES = [
    {"id": "dsa", "label": "DSA"},
    {"id": "languages", "label": "Languages"},
    {"id": "topics", "label": "Interview topics"},
]

# Canonical DSA patterns in learning order, with their prerequisites.
DSA_PREREQS: dict[str, list[str]] = {
    "Arrays & Hashing": [],
    "Two Pointers": ["Arrays & Hashing"],
    "Stack": ["Arrays & Hashing"],
    "Prefix Sums": ["Arrays & Hashing"],
    "Math": ["Arrays & Hashing"],
    "Bit Manipulation": ["Arrays & Hashing"],
    "Sliding Window": ["Two Pointers"],
    "Binary Search": ["Two Pointers"],
    "Matrix": ["Two Pointers"],
    "Linked List": ["Stack", "Two Pointers"],
    "Trees": ["Linked List", "Binary Search"],
    "Tries": ["Trees"],
    "Heap": ["Trees"],
    "Backtracking": ["Trees"],
    "Intervals": ["Heap"],
    "Greedy": ["Heap"],
    "Design": ["Linked List", "Heap"],
    "Graphs": ["Backtracking"],
    "Union-Find": ["Graphs"],
    "BFS / Grid": ["Graphs"],
    "Dynamic Programming": ["Backtracking"],
    "Interval DP": ["Dynamic Programming"],
}

# Raw pattern strings from the problem bank that don't map by their first segment.
PATTERN_ALIASES = {
    "heap / priority queue": "Heap",
    "heap / sorting": "Heap",
    "strings / two pointers": "Two Pointers",
    "prefix sums / hashing": "Prefix Sums",
    "bfs / grid": "BFS / Grid",
    "bfs / state search": "BFS / Grid",
    "bfs / state space": "BFS / Grid",
    "dp + binary search": "Dynamic Programming",
    "dynamic programming / strings": "Dynamic Programming",
    "interval dp": "Interval DP",
    "graphs / mst": "Graphs",
    "intervals / sweep line": "Intervals",
    "union-find": "Union-Find",
    "dp": "Dynamic Programming",
    "strings": "Arrays & Hashing",
    "hashing": "Arrays & Hashing",
    "bfs": "BFS / Grid",
    "dfs": "Graphs",
    "priority queue": "Heap",
    "sorting": "Arrays & Hashing",
}

# Interview topics: group -> topic -> prerequisite topics (suggested learning order inside the group).
TOPIC_GROUPS: dict[str, dict[str, list[str]]] = {
    "CS Fundamentals": {
        "Data Structures & Algorithms": [],
        "OOP & Design Patterns": [],
        "Operating Systems": [],
        "Computer Networks": ["Operating Systems"],
        "Security": ["Computer Networks"],
        "System Design": ["Data Structures & Algorithms", "Computer Networks"],
        "Git": [],
        "Java": ["OOP & Design Patterns"],
        "C++": ["OOP & Design Patterns"],
        "Go": ["Data Structures & Algorithms"],
    },
    "Web": {
        "Web & HTTP": [],
        "JavaScript": [],
        "TypeScript": ["JavaScript"],
        "React": ["JavaScript"],
        "Node.js": ["JavaScript", "Web & HTTP"],
        "API Design": ["Web & HTTP"],
        "Testing & QA": ["JavaScript"],
        "Mobile Development": ["React"],
    },
    "Data": {
        "Databases & SQL": [],
        "Python": [],
        "Data Science": ["Python", "Databases & SQL"],
        "Machine Learning": ["Data Science"],
        "Cloud & DevOps": ["Databases & SQL"],
    },
    "Soft skills": {
        "Behavioral & HR": [],
        "Remote Work & Communication": [],
    },
}


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def normalise_pattern(raw: str) -> str:
    key = raw.strip().lower()
    if key in PATTERN_ALIASES:
        return PATTERN_ALIASES[key]
    for name in DSA_PREREQS:
        if name.lower() == key:
            return name
    head = re.split(r"\s*(?:/|\+)\s*", raw.strip())[0]
    for name in DSA_PREREQS:
        if name.lower() == head.lower():
            return name
    return PATTERN_ALIASES.get(head.lower(), raw.strip())


def _node(nid, label, branch, kind, parents, done, total, mastery, href, **extra) -> dict:
    return {"id": nid, "label": label, "branch": branch, "kind": kind, "parents": parents,
            "mastery": max(0, min(100, round(mastery))), "done": done, "total": total, "href": href, **extra}


# ---------------------------------------------------------------- branches

def _assessment_solves(db: Session, user_id: int) -> set[str]:
    """Problems accepted inside finished online assessments (those don't create Submission rows)."""
    out: set[str] = set()
    for result in db.scalars(select(TestAttempt.result).where(TestAttempt.user_id == user_id,
                                                              TestAttempt.finished_at.is_not(None))):
        for c in (result or {}).get("coding", []):
            if c.get("status") == "Accepted":
                out.add(c.get("slug"))
    return out


def _dsa_nodes(db: Session, user: User) -> list[dict]:
    solved = solved_slugs(db, user.id) | _assessment_solves(db, user.id)
    groups: dict[str, list[dict]] = {}
    raw_count: dict[str, dict[str, int]] = {}
    # Company-style assessment problems (oa-) count too: several patterns only appear there.
    for p in q.problems(db):
        name = normalise_pattern(p["pattern"])
        groups.setdefault(name, []).append(p)
        raw_count.setdefault(name, {}).setdefault(p["pattern"], 0)
        raw_count[name][p["pattern"]] += 1

    # Unknown patterns hang off the root; known ones keep the curated prerequisites.
    prereqs = {k: list(v) for k, v in DSA_PREREQS.items()}
    for name in groups:
        prereqs.setdefault(name, ["Arrays & Hashing"])

    def resolve(parents: list[str]) -> list[str]:
        """Parents that have problems, skipping over empty ones to their own prerequisites."""
        out: list[str] = []
        for p in parents:
            for r in ([p] if p in groups else resolve(prereqs.get(p, []))):
                if r not in out:
                    out.append(r)
        return out

    nodes = []
    for name in prereqs:
        problems = groups.get(name)
        if not problems:
            continue
        total_w = sum(DIFFICULTY_WEIGHT.get(p["difficulty"], 2) for p in problems)
        done_w = sum(DIFFICULTY_WEIGHT.get(p["difficulty"], 2) for p in problems if p["slug"] in solved)
        practice = [p for p in problems if not p["slug"].startswith("oa-")]
        unsolved = sorted((p for p in practice if p["slug"] not in solved),
                          key=lambda p: (DIFFICULTY_ORDER.get(p["difficulty"], 1), p.get("order", 0), p["slug"]))
        if practice:
            primary = max(((r, c) for r, c in raw_count[name].items()
                           if any(p["pattern"] == r for p in practice)), key=lambda kv: kv[1])[0]
            browse = f"/dsa?pattern={quote(primary)}"
        else:
            browse = "/tests"  # only practised inside company-style online assessments
        nodes.append(_node(
            f"dsa:{_slug(name)}", name, "dsa", "skill", [f"dsa:{_slug(p)}" for p in resolve(prereqs[name])],
            sum(p["slug"] in solved for p in problems), len(problems), 100 * done_w / max(1, total_w),
            f"/dsa/{unsolved[0]['slug']}" if unsolved else browse,
            browse_href=browse, assessment_only=not practice, next_problem=unsolved[0]["title"] if unsolved else None,
            difficulty_mix={d: sum(p["difficulty"] == d for p in problems)
                            for d in DIFFICULTY_WEIGHT if any(p["difficulty"] == d for p in problems)},
        ))
    return nodes


def _language_nodes(db: Session, user: User) -> list[dict]:
    completed = set(db.scalars(select(LessonProgress.lesson_id).where(LessonProgress.user_id == user.id)))
    nodes = []
    for track in sorted(q.tracks(db), key=lambda t: t.get("order", 0)):
        if not track.get("available", True):
            continue
        lessons = q.track_lessons(db, track["id"])
        if not lessons:
            continue
        done = sum(l["id"] in completed for l in lessons)
        tid = f"lang:{track['id']}"
        href = f"/learn/{track['id']}"
        nodes.append(_node(tid, track["title"], "languages", "track", [], done, len(lessons),
                           100 * done / len(lessons), href, icon=track.get("icon"), color=track.get("color")))
        prev = tid
        for unit in (q.track(db, track["id"]) or track).get("units", []):
            unit_lessons = [l for l in lessons if l.get("unit_id") == unit["id"]]
            if not unit_lessons:
                continue
            u_done = sum(l["id"] in completed for l in unit_lessons)
            uid = f"lang:{track['id']}:{unit['id']}"
            nodes.append(_node(uid, unit["title"], "languages", "unit", [prev], u_done, len(unit_lessons),
                               100 * u_done / len(unit_lessons), href, track=track["title"],
                               level=unit.get("level"), description=unit.get("description", "")))
            prev = uid
    return nodes


def _topic_nodes(db: Session, user: User) -> list[dict]:
    questions = q.questions(db)
    by_topic: dict[str, list[str]] = {}
    for it in questions:
        by_topic.setdefault(it["topic"], []).append(it["id"])
    topic_of = {it["id"]: it["topic"] for it in questions}
    stats: dict[str, dict] = {}
    for a in db.scalars(select(QuestionAttempt).where(QuestionAttempt.user_id == user.id)):
        topic = topic_of.get(a.question_id)
        if not topic:
            continue
        s = stats.setdefault(topic, {"attempts": 0, "correct": 0, "seen": set(), "solved": set()})
        s["attempts"] += 1
        s["correct"] += bool(a.correct)
        s["seen"].add(a.question_id)
        if a.correct:
            s["solved"].add(a.question_id)

    groups = {g: dict(topics) for g, topics in TOPIC_GROUPS.items()}
    known = {t for topics in groups.values() for t in topics}
    for topic in by_topic:
        if topic not in known:
            groups["CS Fundamentals"][topic] = []

    nodes = []
    for group, topics in groups.items():
        present = [t for t in topics if t in by_topic]
        if not present:
            continue
        gid = f"topic-group:{_slug(group)}"
        children = []
        for topic in present:
            s = stats.get(topic)
            accuracy = s["correct"] / s["attempts"] if s else 0
            confidence = min(1, len(s["seen"]) / QUESTION_CONFIDENCE) if s else 0
            parents = [f"topic:{_slug(p)}" for p in topics[topic] if p in by_topic] or [gid]
            children.append(_node(
                f"topic:{_slug(topic)}", topic, "topics", "topic", parents,
                len(s["solved"]) if s else 0, len(by_topic[topic]), 100 * accuracy * confidence,
                f"/questions?topic={quote(topic)}", group=group,
                accuracy=round(100 * accuracy) if s else None, attempted=len(s["seen"]) if s else 0))
        done = sum(c["done"] for c in children)
        total = sum(c["total"] for c in children)
        nodes.append(_node(gid, group, "topics", "group", [], done, total,
                           sum(c["mastery"] for c in children) / len(children),
                           f"/questions?topic={quote(present[0])}"))
        nodes.extend(children)
    return nodes


# ---------------------------------------------------------------- assembly

def _status(node: dict, by_id: dict[str, dict]) -> str:
    if node["mastery"] >= MASTERED:
        return "mastered"
    gating = [by_id[p] for p in node["parents"] if by_id[p]["kind"] not in AGGREGATE_KINDS]
    weak = any(p["mastery"] < UNLOCK for p in gating)
    if node["done"] > 0 or node["mastery"] > 0:
        return "in_progress"  # work already started is shown as progress even if a prerequisite is weak
    return "locked" if weak else "available"


def _recommend(nodes: list[dict], by_id: dict[str, dict]) -> list[dict]:
    def strength(n: dict) -> float:
        gating = [by_id[p]["mastery"] for p in n["parents"] if by_id[p]["kind"] not in AGGREGATE_KINDS]
        return min(gating) if gating else 100

    candidates = [n for n in nodes if n["status"] in ("available", "in_progress") and n["kind"] not in AGGREGATE_KINDS]
    ranked = sorted(candidates, key=lambda n: (-(strength(n) - n["mastery"]), n["mastery"], n["id"]))
    picked: list[dict] = []
    seen_branches: set[str] = set()
    for n in ranked:  # one per branch first, then fill by score
        if n["branch"] not in seen_branches:
            picked.append(n)
            seen_branches.add(n["branch"])
        if len(picked) == 3:
            break
    for n in ranked:
        if len(picked) == 3:
            break
        if n not in picked:
            picked.append(n)
    out = []
    for n in picked:
        s = strength(n)
        gating = [by_id[p] for p in n["parents"] if by_id[p]["kind"] not in AGGREGATE_KINDS]
        if n["mastery"] > 0:
            reason = f"{n['mastery']}% there, keep the momentum"
        elif gating:
            reason = f"Builds on {' and '.join(p['label'] for p in gating[:2])}"
        else:
            reason = "A strong place to start"
        out.append({"id": n["id"], "label": n["label"], "branch": n["branch"], "mastery": n["mastery"],
                    "status": n["status"], "done": n["done"], "total": n["total"], "href": n["href"],
                    "parent_strength": round(s), "reason": reason})
    return out


def build_tree(db: Session, user: User) -> dict:
    nodes = _dsa_nodes(db, user) + _language_nodes(db, user) + _topic_nodes(db, user)
    by_id = {n["id"]: n for n in nodes}
    for n in nodes:
        n["parents"] = [p for p in n["parents"] if p in by_id and p != n["id"]]
        n["children"] = []
    for n in nodes:
        for p in n["parents"]:
            by_id[p]["children"].append(n["id"])
    for n in nodes:
        n["status"] = _status(n, by_id)

    summary = {"nodes": len(nodes), "mastered": 0, "in_progress": 0, "available": 0, "locked": 0, "branches": {}}
    for b in BRANCHES:
        members = [n for n in nodes if n["branch"] == b["id"] and n["kind"] not in AGGREGATE_KINDS]
        counts = {s: sum(n["status"] == s for n in members) for s in ("mastered", "in_progress", "available", "locked")}
        for s, c in counts.items():
            summary[s] += c
        summary["branches"][b["id"]] = {
            **counts, "nodes": len(members),
            "mastery": round(sum(n["mastery"] for n in members) / len(members)) if members else 0,
        }
    skills = [n for n in nodes if n["kind"] not in AGGREGATE_KINDS]
    summary["mastery"] = round(sum(n["mastery"] for n in skills) / len(skills)) if skills else 0
    return {"branches": BRANCHES, "nodes": nodes, "recommended": _recommend(nodes, by_id), "summary": summary,
            "thresholds": {"mastered": MASTERED, "unlock": UNLOCK}}
