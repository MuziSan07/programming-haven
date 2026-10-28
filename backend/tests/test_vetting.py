"""Mock vetting runs: stage gating, first-attempt-counts, rejection, deadlines and the final report."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm.attributes import flag_modified

from app.database import SessionLocal
from app.models import InterviewSession, ProjectSubmission, TestAttempt, User, VettingRun


def _register(client, email):
    r = client.post("/api/auth/register", json={"name": "Vetting Candidate", "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]["id"]


def _grade_interview(session_id, score, terminated=False):
    with SessionLocal() as db:
        s = db.get(InterviewSession, session_id)
        s.feedback = {"overall_score": score, "verdict": "Likely to pass", "summary": "Clear, structured answers.",
                      "improvements": ["Quantify results"], "terminated": terminated}
        s.ended_at = datetime.now(timezone.utc)
        db.commit()


def _finish_test(user_id, test_id, score, passed):
    with SessionLocal() as db:
        db.add(TestAttempt(user_id=user_id, test_id=test_id, finished_at=datetime.now(timezone.utc), score=score,
                           integrity_score=100, violations=[],
                           result={"passed": passed, "late": False, "pass_mark": 80}))
        db.commit()


def _begin(client, h, run_id, index):
    r = client.post(f"/api/vetting/runs/{run_id}/stages/{index}/begin", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_platforms_listing(client, auth):
    data = client.get("/api/vetting/platforms", headers=auth).json()
    ids = {p["id"]: p for p in data["platforms"]}
    assert set(ids) == {"toptal", "turing", "lemon"}
    assert [s["type"] for s in ids["toptal"]["stages"]] == ["interview", "test", "interview", "project"]
    assert ids["toptal"]["stages"][1]["pass"] == 80  # the test's own pass mark


def test_full_toptal_pass(client):
    h, uid = _register(client, "vetting-pass@example.com")
    run = client.post("/api/vetting/runs", headers=h, json={"platform": "toptal", "level": "Mid-level"}).json()
    assert run["status"] == "active" and run["stages"][0]["status"] == "ready"
    assert run["stages"][1]["status"] == "locked"
    assert client.post(f"/api/vetting/runs/{run['id']}/stages/1/begin", headers=h).status_code == 400
    assert client.post("/api/vetting/runs", headers=h, json={"platform": "toptal"}).status_code == 409

    # Stage 1: English interview
    begun = _begin(client, h, run["id"], 0)
    assert begun["href"].startswith("/interview/")
    _grade_interview(int(begun["href"].split("/")[2].split("?")[0]), 82)
    run = client.get(f"/api/vetting/runs/{run['id']}", headers=h).json()
    assert run["stages"][0]["status"] == "passed" and run["stages"][1]["status"] == "ready"

    # Stage 2: proctored test, decided by the first attempt after the stage began
    begun = _begin(client, h, run["id"], 1)
    assert begun["href"] == f"/tests/toptal-style-algorithm-screen?vetting={run['id']}"
    _finish_test(uid, "toptal-style-algorithm-screen", 91, True)
    _finish_test(uid, "toptal-style-algorithm-screen", 10, False)  # a later retry must not count
    run = client.get(f"/api/vetting/runs/{run['id']}", headers=h).json()
    assert run["stages"][1]["status"] == "passed" and run["stages"][1]["score"] == 91

    # Stage 3: live coding
    begun = _begin(client, h, run["id"], 2)
    _grade_interview(int(begun["href"].split("/")[2].split("?")[0]), 78)
    run = client.get(f"/api/vetting/runs/{run['id']}", headers=h).json()
    assert run["stages"][2]["status"] == "passed"

    # Stage 4: take-home project reviewed from a GitHub repo
    begun = _begin(client, h, run["id"], 3)
    stage = begun["stages"][3]
    project_id = stage["detail"]["project_id"]
    assert stage["deadline"] and begun["href"] == f"/projects/{project_id}?vetting={run['id']}"
    with SessionLocal() as db:
        db.add(ProjectSubmission(user_id=uid, project_id=project_id, code="", notes="pasted, not a repo",
                                 review={"kind": "paste", "overall_score": 99}))
        db.add(ProjectSubmission(user_id=uid, project_id=project_id, repo_url="https://github.com/x/y", code="",
                                 review={"kind": "repo", "overall_score": 84, "summary": "Solid, tested work."}))
        db.commit()
    final = client.get(f"/api/vetting/runs/{run['id']}", headers=h).json()
    assert final["status"] == "passed" and final["stages"][3]["score"] == 84
    report = final["report"]
    assert report["verdict"] == "Offer-ready" and report["xp_gained"] == 300 and report["certificate_id"]
    assert any(b["id"] == "final-boss" for b in final["badges"])
    cert = client.get(f"/api/public/certificates/{report['certificate_id']}").json()
    assert cert["kind"] == "vetting"


def test_rejection_ends_the_run(client):
    h, uid = _register(client, "vetting-fail@example.com")
    run = client.post("/api/vetting/runs", headers=h, json={"platform": "lemon"}).json()
    begun = _begin(client, h, run["id"], 0)
    _grade_interview(int(begun["href"].split("/")[2].split("?")[0]), 81)
    client.get(f"/api/vetting/runs/{run['id']}", headers=h)
    _begin(client, h, run["id"], 1)
    _finish_test(uid, "lemon-io-senior-screen", 42, False)
    final = client.get(f"/api/vetting/runs/{run['id']}", headers=h).json()
    assert final["status"] == "failed"
    assert [s["status"] for s in final["stages"]] == ["passed", "failed", "skipped", "skipped"]
    report = final["report"]
    assert report["verdict"] == "Rejected at stage 2" and report["failed_stage"] == 1
    assert report["xp_gained"] == 20 and len(report["plan"]) >= 2 and report["headline"]
    assert any(item["href"] == "/dsa" for item in report["plan"])
    # A new run can start once the old one is over
    assert client.post("/api/vetting/runs", headers=h, json={"platform": "lemon"}).status_code == 200


def test_interview_integrity_termination_fails_stage(client):
    h, _ = _register(client, "vetting-cheat@example.com")
    run = client.post("/api/vetting/runs", headers=h, json={"platform": "turing"}).json()
    with SessionLocal() as db:  # jump straight to the technical interview stage
        r = db.get(VettingRun, run["id"])
        r.stages[0].update(status="passed", score=90)
        r.stages[1].update(status="passed", score=88)
        r.stages[2]["status"] = "ready"
        flag_modified(r, "stages")
        db.commit()
    begun = _begin(client, h, run["id"], 2)
    _grade_interview(int(begun["href"].split("/")[2].split("?")[0]), 95, terminated=True)
    final = client.get(f"/api/vetting/runs/{run['id']}", headers=h).json()
    assert final["status"] == "failed" and "integrity" in final["stages"][2]["note"]


def test_project_deadline_and_withdraw(client):
    h, _ = _register(client, "vetting-late@example.com")
    run = client.post("/api/vetting/runs", headers=h, json={"platform": "toptal"}).json()
    with SessionLocal() as db:
        r = db.get(VettingRun, run["id"])
        for st in r.stages[:3]:
            st.update(status="passed", score=80)
        past = datetime.now(timezone.utc) - timedelta(days=6)
        r.stages[3].update(status="active", ref="proj-fs-booking", started_at=past.isoformat(),
                           deadline=(past + timedelta(days=5)).isoformat())
        flag_modified(r, "stages")
        db.commit()
    final = client.get(f"/api/vetting/runs/{run['id']}", headers=h).json()
    assert final["status"] == "failed" and "deadline" in final["stages"][3]["note"]

    other = client.post("/api/vetting/runs", headers=h, json={"platform": "turing"}).json()
    out = client.post(f"/api/vetting/runs/{other['id']}/withdraw", headers=h).json()
    assert out["status"] == "withdrawn"
    listing = client.get("/api/vetting/platforms", headers=h).json()
    assert {r["status"] for r in listing["runs"]} == {"failed", "withdrawn"}
    with SessionLocal() as db:
        assert db.query(User).filter(User.email == "vetting-late@example.com").one().xp >= 60
