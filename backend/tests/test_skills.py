"""Skill tree: shape, valid parents, acyclic, mastery rises after a solve."""

from app.main import app
from app.routers import skills as skills_router
from tests.test_problems import PY

if not any(getattr(r, "path", "").startswith("/api/skills") for r in app.routes):
    app.include_router(skills_router.router)


def _register(client, email):
    r = client.post("/api/auth/register", json={"name": "Tree Person", "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_tree_shape_and_integrity(client):
    headers = _register(client, "skills-shape@example.com")
    data = client.get("/api/skills/tree", headers=headers).json()
    nodes = {n["id"]: n for n in data["nodes"]}
    assert {b["id"] for b in data["branches"]} == {"dsa", "languages", "topics"}
    assert {n["branch"] for n in nodes.values()} == {"dsa", "languages", "topics"}
    for key in ("id", "label", "branch", "parents", "mastery", "status", "done", "total", "href"):
        assert all(key in n for n in nodes.values()), key
    for n in nodes.values():
        assert all(p in nodes for p in n["parents"]), n
        assert 0 <= n["mastery"] <= 100 and n["status"] in {"mastered", "in_progress", "available", "locked"}
        assert n["href"].startswith("/")

    # The curated DSA order is present
    dsa = {n["label"]: n for n in nodes.values() if n["branch"] == "dsa"}
    assert dsa["Arrays & Hashing"]["parents"] == [] and dsa["Arrays & Hashing"]["status"] == "available"
    assert set(dsa["Trees"]["parents"]) == {"dsa:linked-list", "dsa:binary-search"}
    assert dsa["Graphs"]["status"] == "locked"
    assert {"Heap", "Union-Find", "BFS / Grid", "Interval DP"} <= set(dsa)
    # Every interview topic sits in exactly one node
    topics = [n for n in nodes.values() if n["kind"] == "topic"]
    assert len(topics) == len({n["label"] for n in topics}) >= 20
    assert len(data["recommended"]) == 3 and data["summary"]["nodes"] == len(nodes)

    # No cycles (Kahn's algorithm consumes every node)
    indeg = {nid: len(n["parents"]) for nid, n in nodes.items()}
    queue = [nid for nid, d in indeg.items() if d == 0]
    seen = 0
    while queue:
        nid = queue.pop()
        seen += 1
        for child in nodes[nid]["children"]:
            indeg[child] -= 1
            if indeg[child] == 0:
                queue.append(child)
    assert seen == len(nodes)


def test_mastery_rises_after_solve(client):
    headers = _register(client, "skills-solve@example.com")
    before = {n["id"]: n for n in client.get("/api/skills/tree", headers=headers).json()["nodes"]}
    node = before["dsa:arrays-hashing"]
    slug = node["href"].removeprefix("/dsa/")
    assert slug in PY
    r = client.post("/api/dsa/submit", headers=headers, json={"slug": slug, "language": "python", "code": PY[slug]})
    assert r.json()["status"] == "Accepted"
    after = {n["id"]: n for n in client.get("/api/skills/tree", headers=headers).json()["nodes"]}
    assert after["dsa:arrays-hashing"]["mastery"] > node["mastery"]
    assert after["dsa:arrays-hashing"]["done"] == node["done"] + 1
    assert after["dsa:arrays-hashing"]["status"] == "in_progress"
    assert after["dsa:arrays-hashing"]["href"] != node["href"]  # points at the next unsolved problem
