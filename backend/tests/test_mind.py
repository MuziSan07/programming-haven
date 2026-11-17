"""Mind Training: server-graded drills, adaptive levels, capped XP, lessons, habits, badges and coach tasks."""

import pytest

from app.services import mind_drills as md


def _register(client, email):
    r = client.post("/api/auth/register", json={"name": "Mind Tester", "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _perfect_answer(drill, data):
    """Solve a drill from its public data the way a flawless player would."""
    if drill == "number-span":
        return [r["digits"] for r in data["rounds"]]
    if drill == "schulte":
        cells = data["cells"]
        return {"clicks": sorted(range(len(cells)), key=lambda i: cells[i]), "time_ms": len(cells) * 700}
    if drill == "mental-math":
        return None  # needs the server-side answers
    if drill == "code-trace":
        return [md.run_snippet(code) for code in data["snippets"]]
    return None


@pytest.mark.parametrize("drill", [d["id"] for d in md.DRILLS])
def test_every_drill_generates_and_grades_at_every_level(drill):
    for level in range(1, md.MAX_LEVEL + 1):
        for seed in range(15):
            g = md.generate(drill, f"{drill}-{level}-{seed}", level)
            answers = g["answers"]
            if drill == "schulte":
                order = sorted(range(len(answers)), key=lambda i: answers[i])
                payload = {"clicks": order, "time_ms": len(answers) * 900}
            elif drill in ("number-span", "logic"):
                payload = list(answers)
            else:
                payload = [str(a) for a in answers]
            result = md.grade(drill, g, payload, 5_000)
            assert result["correct"] == result["total"], (drill, level, seed)
            assert 0 <= result["score"] <= 100
            # Nothing that reveals the answers is in the public payload
            if drill in ("logic", "estimation"):
                assert "answer" not in str(g["public"])


def test_wrong_answers_score_low():
    g = md.generate("code-trace", "x", 3)
    assert md.grade("code-trace", g, ["nope"] * 6, 1000)["score"] == 0
    g = md.generate("schulte", "y", 1)
    assert md.grade("schulte", g, {"clicks": [], "time_ms": 1000}, 1000)["score"] == 0
    assert md.estimate_points(5785, 578.7) == 50 and md.estimate_points(None, 10) == 0
    assert md.to_number("1.5k") == 1500 and md.to_number("2 million") == 2e6


def test_levels_adapt():
    assert md.next_level(1, 85) == 2 and md.next_level(5, 100) == 5
    assert md.next_level(3, 20) == 2 and md.next_level(1, 0) == 1 and md.next_level(3, 60) == 3


def test_drill_flow_xp_cap_and_badges(client):
    h = _register(client, "mind@example.com")
    over = client.get("/api/mind", headers=h).json()
    assert {d["id"] for d in over["drills"]} == {d["id"] for d in md.DRILLS}
    assert all(d["level"] == 1 for d in over["drills"]) and over["today"]["xp"] == 0

    start = client.post("/api/mind/drills/code-trace/start", headers=h).json()
    assert "answers" not in start and start["level"] == 1 and len(start["data"]["snippets"]) == 6
    answer = _perfect_answer("code-trace", start["data"])
    res = client.post(f"/api/mind/sessions/{start['id']}/finish", headers=h, json={"answer": answer}).json()
    assert res["score"] == 100 and res["next_level"] == 2 and res["xp"] == 12
    assert any(b["id"] == "mind-first" for b in res["new_badges"])
    again = client.post(f"/api/mind/sessions/{start['id']}/finish", headers=h, json={"answer": answer})
    assert again.status_code == 409  # a session can only be graded once

    # The level went up; repeat runs hit the daily XP cap
    total = res["xp"]
    for _ in range(8):
        s = client.post("/api/mind/drills/code-trace/start", headers=h).json()
        r = client.post(f"/api/mind/sessions/{s['id']}/finish", headers=h,
                        json={"answer": _perfect_answer("code-trace", s["data"])}).json()
        total += r["xp"]
    assert s["level"] == 2 or s["level"] > 1
    assert total == 60 and r["xp_capped"]
    over = client.get("/api/mind", headers=h).json()
    trace = next(d for d in over["drills"] if d["id"] == "code-trace")
    assert trace["runs"] == 9 and trace["best"] == 100 and over["today"]["xp"] == 60 and over["streak"] == 1
    assert len(client.get("/api/mind/drills/code-trace/history", headers=h).json()["runs"]) == 9

    # Other users can't finish my sessions
    other = _register(client, "mind-other@example.com")
    s = client.post("/api/mind/drills/schulte/start", headers=h).json()
    assert client.post(f"/api/mind/sessions/{s['id']}/finish", headers=other, json={"answer": {}}).status_code == 404
    assert client.post("/api/mind/drills/nope/start", headers=h).status_code == 404

    # Submitting nothing earns no XP
    lazy = _register(client, "mind-lazy@example.com")
    s = client.post("/api/mind/drills/mental-math/start", headers=lazy).json()
    r = client.post(f"/api/mind/sessions/{s['id']}/finish", headers=lazy, json={"answer": []}).json()
    assert r["score"] == 0 and r["xp"] == 0


def test_lessons_checkin_breathing_focus_habits(client):
    h = _register(client, "calm@example.com")
    lessons = client.get("/api/mind", headers=h).json()["lessons"]
    assert len(lessons) == 8 and not any(l["passed"] for l in lessons)
    lesson = client.get(f"/api/mind/lessons/{lessons[0]['id']}", headers=h).json()
    assert lesson["body"] and all("answer" not in c for c in lesson["checks"])

    wrong = client.post(f"/api/mind/lessons/{lesson['id']}/submit", headers=h, json={"answers": [0, 0, 0]}).json()
    assert not wrong["passed"] and wrong["xp"] == 0 and all("why" in r for r in wrong["review"])
    right = [md.content("mindset")[0]["checks"][i]["answer"] for i in range(3)]
    ok = client.post(f"/api/mind/lessons/{lesson['id']}/submit", headers=h, json={"answers": right}).json()
    assert ok["passed"] and ok["xp"] == 15
    assert client.post(f"/api/mind/lessons/{lesson['id']}/submit", headers=h, json={"answers": right}).json()["xp"] == 0

    r = client.put("/api/mind/today", headers=h, json={"mood": 4, "nerves": 2, "sleep_hours": 7.5, "note": "ok"}).json()
    assert r["xp"] == 3 and r["today"]["checked_in"]
    assert client.put("/api/mind/today", headers=h, json={"mood": 5}).json()["xp"] == 0
    assert client.put("/api/mind/today", headers=h, json={"mood": 9}).status_code == 422

    assert client.post("/api/mind/breathing", headers=h, json={"pattern": "box", "seconds": 30}).status_code == 400
    b = client.post("/api/mind/breathing", headers=h, json={"pattern": "box", "seconds": 120}).json()
    assert b["xp"] == 5 and b["today"]["breathing_sessions"] == 1
    assert client.post("/api/mind/breathing", headers=h, json={"pattern": "box", "seconds": 120}).json()["xp"] == 0

    f = client.post("/api/mind/focus", headers=h, json={"minutes": 25}).json()
    assert f["xp"] == 5 and f["today"]["focus_minutes"] == 25

    habits = client.post("/api/mind/habits", headers=h, json={"title": "  Sleep   before midnight "}).json()["habits"]
    assert habits[0]["title"] == "Sleep before midnight" and not habits[0]["done_today"]
    t = client.post(f"/api/mind/habits/{habits[0]['id']}/toggle", headers=h).json()
    assert t["habits"][0]["done_today"] and t["habits"][0]["streak"] == 1 and t["xp"] == 2
    t = client.post(f"/api/mind/habits/{habits[0]['id']}/toggle", headers=h).json()
    assert not t["habits"][0]["done_today"]
    assert client.delete(f"/api/mind/habits/{habits[0]['id']}", headers=h).json()["habits"] == []


def test_coach_plan_has_mind_tasks_that_complete(client):
    h = _register(client, "mind-coach@example.com")
    plan = client.post("/api/coach/plan", headers=h, json={"target": "toptal", "weeks": 3, "experience": "beginner",
                                                           "start": "today"}).json()["plan"]
    days = [d for w in plan["plan"]["weeks"] for d in w["days"]]
    assert all(sum(t["type"] == "mind" for t in d["tasks"]) == 1 for d in days)
    early = [t for d in days[:7] for t in d["tasks"] if t["type"] == "mind"]
    assert not any("estimation" in t["href"] or "/logic" in t["href"] for t in early)
    assert any(t["href"].startswith("/mind/lessons/") for d in days for t in d["tasks"] if t["type"] == "mind")

    client.post("/api/mind/breathing", headers=h, json={"pattern": "sigh", "seconds": 90})
    plan = client.get("/api/coach/plan", headers=h).json()["plan"]
    first = plan["plan"]["weeks"][0]["days"][0]
    assert next(t for t in first["tasks"] if t["type"] == "mind")["done"]
