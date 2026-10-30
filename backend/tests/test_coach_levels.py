"""Study plans adapt to experience: beginners learn the language before mock interviews; plans can run a full year."""

import time

from app.content.store import load_seed_files

DIFFICULTY = {p["slug"]: p["difficulty"] for p in load_seed_files()["problem"]}


def _register(client, email):
    r = client.post("/api/auth/register", json={"name": "Level Tester", "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _tasks(week):
    return [t for d in week["days"] for t in d["tasks"]]


def test_levels_listed(client):
    levels = {lv["id"]: lv for lv in client.get("/api/coach/levels").json()}
    assert set(levels) == {"beginner", "junior", "mid", "senior"} and levels["beginner"]["weeks"] >= 36


def test_beginner_year_plan(client):
    h = _register(client, "beginner@example.com")
    started = time.perf_counter()
    r = client.post("/api/coach/plan", headers=h, json={"target": "toptal", "weeks": 52, "hours_per_week": 10,
                                                        "language": "python", "experience": "beginner"})
    assert r.status_code == 200, r.text
    assert time.perf_counter() - started < 20
    plan = r.json()["plan"]
    weeks = plan["plan"]["weeks"]
    assert plan["experience"] == "beginner" and len(weeks) == 52 and plan["experience_label"] == "New to programming"
    assert weeks[0]["focus"].startswith("Programming basics")

    early = [t for w in weeks[:10] for t in _tasks(w)]
    early_types = {t["type"] for t in early}
    assert "lesson" in early_types
    assert not early_types & {"interview", "test", "project", "review"}  # no mock pipeline while learning basics
    assert all(DIFFICULTY.get(t["ref"]) == "Easy" for t in early if t["type"] == "problem")

    late_types = {t["type"] for w in weeks[-10:] for t in _tasks(w)}
    assert "interview" in late_types
    # Every study day still has real work even after lessons and easy problems run out
    for w in weeks:
        for d in w["days"]:
            assert len(d["tasks"]) >= 2


def test_senior_plan_skews_to_hard_work(client):
    h = _register(client, "senior@example.com")
    plan = client.post("/api/coach/plan", headers=h, json={"target": "ateam", "weeks": 6, "hours_per_week": 12,
                                                           "language": "python", "experience": "senior"}).json()["plan"]
    tasks = [t for w in plan["plan"]["weeks"] for t in _tasks(w)]
    problems = [t for t in tasks if t["type"] == "problem"]
    assert problems and all(DIFFICULTY.get(t["ref"]) != "Easy" for t in problems)
    assert any(t["type"] == "interview" and t["ref"] in ("whiteboard", "system-design") for t in tasks)


def test_plan_length_limits(client):
    h = _register(client, "limits@example.com")
    bad = client.post("/api/coach/plan", headers=h, json={"target": "toptal", "weeks": 53, "experience": "mid"})
    assert bad.status_code == 422
    bad = client.post("/api/coach/plan", headers=h, json={"target": "toptal", "weeks": 8, "experience": "guru"})
    assert bad.status_code == 422
