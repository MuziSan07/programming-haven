"""Career coach, flashcards, badges/certificates, rounds, leagues, contests and study groups."""

from app.content.store import load_seed_files
from tests.test_problems import PY

SEEDS = load_seed_files()


def _register(client, email):
    r = client.post("/api/auth/register", json={"name": "Second Person", "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_study_plan(client, auth):
    assert client.get("/api/coach/plan", headers=auth).json()["plan"] is None
    r = client.post("/api/coach/plan", headers=auth,
                    json={"target": "toptal", "weeks": 3, "hours_per_week": 10, "language": "python"})
    assert r.status_code == 200, r.text
    plan = r.json()["plan"]
    assert len(plan["plan"]["weeks"]) == 3 and plan["coach"]["notes"][0]["headline"]
    today = plan["today"]
    assert today and len(today["tasks"]) >= 2
    types = {t["type"] for w in plan["plan"]["weeks"] for d in w["days"] for t in d["tasks"]}
    assert {"problem", "flashcards"} <= types
    # No duplicate problems across the whole plan
    refs = [t["ref"] for w in plan["plan"]["weeks"] for d in w["days"] for t in d["tasks"] if t["type"] == "problem"]
    assert len(refs) == len(set(refs))
    task = today["tasks"][0]
    toggled = client.post("/api/coach/plan/tasks", headers=auth, json={"task_id": task["id"], "done": True}).json()
    assert toggled["plan"]["today"]["tasks"][0]["done"]
    replanned = client.post("/api/coach/plan/replan", headers=auth).json()["plan"]
    assert replanned["today"]["tasks"][0]["done"]  # finished work survives a replan


def test_wrong_answer_becomes_flashcard(client, auth):
    mcq = next(qn for qn in SEEDS["question"] if qn["type"] == "mcq")
    wrong = (mcq["answer"] + 1) % len(mcq["options"])
    r = client.post(f"/api/questions/{mcq['id']}/answer", headers=auth, json={"choice": wrong}).json()
    assert r["flashcard_added"]
    due = client.get("/api/flashcards/due", headers=auth).json()["cards"]
    card = next(c for c in due if c["question_id"] == mcq["id"])
    assert card["back"] == mcq["options"][mcq["answer"]]
    good = client.post(f"/api/flashcards/{card['id']}/review", headers=auth, json={"grade": 2}).json()
    assert good["interval_days"] == 1 and good["xp_gained"] == 1
    assert client.post(f"/api/flashcards/{card['id']}/review", headers=auth, json={"grade": 3}).json()[
        "interval_days"] == 7
    stats = client.get("/api/flashcards/stats", headers=auth).json()
    assert stats["total"] >= 1 and stats["reviewed_today"] >= 2
    added = client.post("/api/flashcards/topic", headers=auth, json={"topic": "Python", "count": 5}).json()
    assert added["added"] == 5


def test_badges_and_certificate_verification(client, auth):
    body = {"slug": "valid-anagram", "language": "python", "code": PY["valid-anagram"]}
    client.post("/api/dsa/submit", json=body, headers=auth)
    badges = client.get("/api/badges", headers=auth).json()
    earned = {b["id"] for b in badges["badges"] if b["earned"]}
    assert "first-solve" in earned
    assert client.get("/api/public/certificates/does-not-exist").status_code == 404


def test_debug_round(client, auth):
    rnd = SEEDS["debug"][0]
    data = client.get(f"/api/rounds/debug/{rnd['id']}", headers=auth).json()
    assert "solution" not in data and "hints" not in data
    run = client.post(f"/api/rounds/debug/{rnd['id']}/run", headers=auth, json={"files": {}}).json()
    assert run["status"] != "All tests pass"
    assert client.post(f"/api/rounds/debug/{rnd['id']}/run", headers=auth,
                       json={"files": {"evil.py": "x"}}).status_code == 400
    fixed = client.post(f"/api/rounds/debug/{rnd['id']}/submit", headers=auth,
                        json={"files": rnd["solution"]}).json()
    assert fixed["passed_round"] and fixed["xp_gained"] > 0 and fixed["solution"]
    again = client.post(f"/api/rounds/debug/{rnd['id']}/submit", headers=auth, json={"files": rnd["solution"]}).json()
    assert again["xp_gained"] == 0


def test_review_round_offline_grading(client, auth):
    rnd = SEEDS["review"][0]
    comments = [{"file": i["file"], "line": i["line"], "body": f"This is a real problem: {i['description']}"}
                for i in rnd["issues"]]
    r = client.post(f"/api/rounds/review/{rnd['id']}/submit", headers=auth, json={"comments": comments}).json()
    assert r["found"] == r["total"] and r["passed"]
    miss = client.post(f"/api/rounds/review/{rnd['id']}/submit", headers=auth,
                       json={"comments": [{"file": "nope.py", "line": 1, "body": "looks fine to me overall"}]}).json()
    assert miss["found"] == 0 and not miss["passed"]
    listing = client.get("/api/rounds", headers=auth).json()
    assert next(x for x in listing["review"] if x["id"] == rnd["id"])["status"] == "passed"


def test_league_and_contest(client, auth):
    league = client.get("/api/leagues/current", headers=auth).json()
    assert league["tier_name"] == "Bronze" and any(r["me"] for r in league["standings"])
    contests = client.get("/api/contests", headers=auth).json()["contests"]
    weekly = contests[0]
    assert weekly["phase"] == "live" and weekly["entry"] is None
    detail = client.get(f"/api/contests/{weekly['slug']}", headers=auth).json()
    assert "problems" not in detail  # hidden until started
    started = client.post(f"/api/contests/{weekly['slug']}/start", headers=auth).json()
    assert len(started["problems"]) == 4
    assert client.post(f"/api/contests/{weekly['slug']}/start", headers=auth).status_code == 400
    slug = next((p["slug"] for p in started["problems"] if p["slug"] in PY), None)
    if slug:
        r = client.post(f"/api/contests/{weekly['slug']}/problems/{slug}/submit", headers=auth,
                        json={"language": "python", "code": PY[slug]}).json()
        assert r["first_solve"] and r["rank"] == 1
    bad = started["problems"][0]["slug"]
    r = client.post(f"/api/contests/{weekly['slug']}/problems/{bad}/submit", headers=auth,
                    json={"language": "python", "code": "def nope(): pass"}).json()
    assert r["first_solve"] is False


def test_study_groups(client, auth):
    other = _register(client, "groupie@example.com")
    g = client.post("/api/groups", headers=auth, json={"name": "Toptal Python crew", "target": "toptal",
                                                       "description": "Daily algorithms practice"}).json()
    assert g["joined"] and g["invite_code"]
    assert client.post("/api/groups/join-code", headers=other, json={"code": g["invite_code"]}).json()["joined"]
    detail = client.get(f"/api/groups/{g['id']}", headers=other).json()
    assert len(detail["leaderboard"]) == 2 and len(detail["challenge"]["tasks"]) >= 3
    msg = client.post(f"/api/groups/{g['id']}/messages", headers=other,
                      json={"body": "Anyone want to pair on the sliding window problem tonight?"})
    assert msg.status_code == 200, msg.text
    assert client.get(f"/api/groups/{g['id']}", headers=auth).json()["messages"][-1]["body"].startswith("Anyone")
    assert client.post(f"/api/groups/{g['id']}/leave", headers=auth).json()["ok"]
    assert client.get(f"/api/groups/{g['id']}", headers=other).json()["role"] == "owner"


def test_dashboard_includes_growth_widgets(client, auth):
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["league"]["tier_name"] and "flashcards_due" in d and d["today_plan"]


def test_whiteboard_interview_kind(client, auth):
    kinds = {k["id"]: k for k in client.get("/api/interviews/kinds").json()}
    assert kinds["whiteboard"]["mode"] == "whiteboard"
