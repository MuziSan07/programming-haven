from app.content.store import load_seed_files
from tests.test_problems import PY

SEEDS = load_seed_files()


def test_auth_flow(client, auth):
    assert client.get("/api/auth/me").status_code == 401
    me = client.get("/api/auth/me", headers=auth).json()
    assert me["email"] == "test@example.com" and me["streak"] == 1
    bad = client.post("/api/auth/login", json={"email": "test@example.com", "password": "wrong-pass"})
    assert bad.status_code == 401


def test_learn_unlocks_in_order(client, auth):
    path = client.get("/api/learn/paths/python", headers=auth).json()
    first, second = path["units"][0]["lessons"][:2]
    assert not first["locked"] and second["locked"]
    r = client.post(f"/api/learn/lessons/{first['id']}/complete", json={"score": 100}, headers=auth)
    assert r.json()["xp_gained"] == 30
    path = client.get("/api/learn/paths/python", headers=auth).json()
    assert not path["units"][0]["lessons"][1]["locked"]


def test_code_exercise(client, auth):
    seed_lesson = next(l for l in SEEDS["lesson"] if any(s["type"] == "code" for s in l["steps"]))
    step = next(i for i, s in enumerate(seed_lesson["steps"]) if s["type"] == "code")
    lesson = client.get(f"/api/learn/lessons/{seed_lesson['id']}", headers=auth).json()
    assert "solution" not in lesson["steps"][step]
    body = {"lesson_id": seed_lesson["id"], "step": step, "code": seed_lesson["steps"][step]["solution"]}
    assert client.post("/api/learn/exercise", headers=auth, json=body).json()["correct"]
    revealed = client.post("/api/learn/exercise/solution", headers=auth, json=body).json()
    assert revealed["solution"] == seed_lesson["steps"][step]["solution"]


def test_dsa_submit_awards_xp_once(client, auth):
    problem = client.get("/api/dsa/problems/two-sum", headers=auth).json()
    assert "tests" not in problem and "hints" not in problem
    body = {"slug": "two-sum", "language": "python", "code": PY["two-sum"]}
    first = client.post("/api/dsa/submit", json=body, headers=auth).json()
    assert first["status"] == "Accepted" and first["xp_gained"] == 15
    assert client.post("/api/dsa/submit", json=body, headers=auth).json()["xp_gained"] == 0


def test_hint_and_review_offline(client, auth):
    body = {"slug": "two-sum", "language": "python", "code": "def two_sum(nums, target):\n    pass\n"}
    hint = client.post("/api/dsa/hint", json={**body, "level": 1}, headers=auth).json()
    assert hint["hint"] and hint["ai"] is False
    review = client.post("/api/dsa/review", json=body, headers=auth).json()
    assert "score" in review


def test_proctored_test_scoring(client, auth):
    test = client.get("/api/tests/python-dev-assessment", headers=auth).json()
    assert all("answer" not in m for m in test["mcq"])
    started = client.post("/api/tests/python-dev-assessment/start", headers=auth).json()
    answers = {"p1": 0, "p2": 2, "p3": 1, "p4": 0, "p5": 2, "p6": 1, "p7": 1, "p8": 1}
    code = {"two-sum": {"language": "python", "code": PY["two-sum"]},
            "valid-parentheses": {"language": "python", "code": PY["valid-parentheses"]}}
    violations = [{"type": "tab_switch", "at": 12.5}, {"type": "paste", "at": 30}]
    result = client.post(f"/api/tests/attempts/{started['attempt_id']}/submit", headers=auth,
                         json={"answers": answers, "code": code, "violations": violations}).json()
    assert result["score"] == 100 and result["integrity_score"] == 82 and result["passed"]
    again = client.post(f"/api/tests/attempts/{started['attempt_id']}/submit", headers=auth, json={})
    assert again.status_code == 409


def test_interview_flow_offline(client, auth):
    s = client.post("/api/interviews", json={"kind": "english", "role": "Backend Developer"}, headers=auth).json()
    assert s["transcript"][0]["role"] == "interviewer"
    for _ in range(s["questions_total"]):
        s = client.post(f"/api/interviews/{s['id']}/reply", headers=auth,
                        json={"text": "I have five years of experience building APIs with Python and FastAPI."}).json()
    assert s["done"]
    done = client.post(f"/api/interviews/{s['id']}/end", headers=auth).json()
    assert done["feedback"]["overall_score"] > 0


def test_dashboard_and_paths(client, auth):
    dash = client.get("/api/dashboard", headers=auth).json()
    assert dash["readiness"]["score"] > 0 and dash["activity"]
    paths = client.get("/api/paths/companies", headers=auth).json()
    assert {p["slug"] for p in paths} >= {"toptal", "turing", "lemon-io"}


def test_question_bank(client, auth):
    data = client.get("/api/questions", headers=auth).json()
    if not data["questions"]:
        return
    mcq = next((x for x in data["questions"] if x["type"] == "mcq"), None)
    assert mcq and "answer" not in mcq
    seed = next(x for x in SEEDS["question"] if x["id"] == mcq["id"])
    r = client.post(f"/api/questions/{mcq['id']}/answer", json={"choice": seed["answer"]}, headers=auth).json()
    assert r["correct"] and r["explanation"]


def test_projects_offline_review(client, auth):
    data = client.get("/api/projects", headers=auth).json()
    if not data["projects"]:
        return
    pid = data["projects"][0]["id"]
    r = client.post(f"/api/projects/{pid}/submit", json={"notes": "Built with tests", "code": "print(1)"}, headers=auth)
    assert r.status_code == 200 and r.json()["review"]["ai"] is False


def test_activity_and_personas(client, auth):
    client.post("/api/activity/heartbeat", json={"area": "dsa", "ref": "two-sum", "seconds": 30}, headers=auth)
    client.post("/api/activity/heartbeat", json={"area": "dsa", "ref": "two-sum", "seconds": 15}, headers=auth)
    assert client.get("/api/activity/ref?area=dsa&ref=two-sum", headers=auth).json()["seconds"] == 45
    assert client.get("/api/activity/summary", headers=auth).json()["today_seconds"] >= 45
    assert client.post("/api/activity/heartbeat", json={"area": "dsa", "seconds": 600}, headers=auth).status_code == 422
    personas = client.get("/api/personas", headers=auth).json()
    assert {p["gender"] for p in personas} >= {"female", "male"}


def test_persona_defaults_to_opposite_gender(client):
    r = client.post("/api/auth/register", json={"name": "Sam", "email": "sam@example.com", "password": "password123",
                                                "gender": "male"}).json()
    assert r["user"]["persona_id"] == "aria" and not r["user"]["is_admin"]


def test_companion_and_mirror_offline(client, auth):
    r = client.post("/api/dsa/companion", json={"slug": "two-sum", "event": "open", "code": ""}, headers=auth).json()
    assert r["message"]
    m = client.post("/api/ai/mirror", json={"message": "Is my shirt professional?"}, headers=auth).json()
    assert m["reply"] and m["ai"] is False


def test_admin_requires_admin_and_crud(client, auth):
    assert client.get("/api/admin/stats", headers=auth).status_code == 403
    from app.database import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        db.query(User).filter(User.email == "test@example.com").update({"is_admin": True})
        db.commit()
    assert client.get("/api/admin/stats", headers=auth).json()["content"]["problem"] > 0
    item = {"id": "kb-test-doc", "title": "Test doc", "tags": ["test"], "content": "Hello"}
    assert client.post("/api/admin/content/knowledge", json={"data": item}, headers=auth).status_code == 200
    bad = client.post("/api/admin/content/question", json={"data": {"id": "q-bad"}}, headers=auth)
    assert bad.status_code == 422
    assert client.delete("/api/admin/content/knowledge/kb-test-doc", headers=auth).json()["ok"]
