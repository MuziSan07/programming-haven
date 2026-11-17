"""Jobs: admin posts roles, Job Seekers build a profile and apply, the AI vetting pipeline decides each stage."""

from sqlalchemy import select

from app.database import SessionLocal
from app.models import InterviewSession, User

RESUME = ("Jane Doe, Backend Developer with 6 years of experience. Built Python and FastAPI services handling 2,000 "
          "requests per second on PostgreSQL and Redis. Led a migration to Docker and AWS, wrote integration tests "
          "with pytest, mentored two junior developers and owned on-call for the payments API.")


def _register(client, email, account_type="learner"):
    r = client.post("/api/auth/register", json={"name": "Jane Doe", "email": email, "password": "password123",
                                                 "account_type": account_type})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["account_type"] == account_type
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _admin(client):
    h = _register(client, "jobs-admin@example.com")
    with SessionLocal() as db:
        db.scalar(select(User).where(User.email == "jobs-admin@example.com")).is_admin = True
        db.commit()
    return h


JOB = {"title": "Senior Backend Engineer", "client_name": "Acme Payments", "show_client": False,
       "seniority": "Senior", "skills": ["Python", "FastAPI", "PostgreSQL"], "summary": "Own the payments API.",
       "description": "We need a senior backend engineer to own our payments API, built on Python and FastAPI.",
       "role": "Backend Developer", "status": "open",
       "stages": [{"type": "resume", "pass": 60}, {"type": "interview", "kind": "technical", "pass": 70}]}


def _seeker_ready(client, email):
    h = _register(client, email, "seeker")
    p = client.put("/api/seeker/profile", headers=h, json={
        "headline": "Backend engineer", "primary_role": "Backend Developer", "years_experience": 6,
        "skills": ["Python", "FastAPI", "PostgreSQL", "Python"], "english_level": "Fluent"}).json()
    assert p["skills"] == ["Python", "FastAPI", "PostgreSQL"] and not p["complete"] and p["missing"] == ["resume"]
    r = client.post("/api/seeker/resume", headers=h, files={"file": ("resume.txt", RESUME.encode(), "text/plain")})
    assert r.status_code == 200, r.text
    assert r.json()["complete"] and r.json()["resume"]["name"] == "resume.txt"
    return h


def _finish_interview(session_id, score):
    with SessionLocal() as db:
        s = db.get(InterviewSession, session_id)
        s.feedback = {"overall_score": score, "summary": "Clear, deep answers on API design."}
        db.commit()


def test_admin_posts_job_and_board_is_public(client):
    admin = _admin(client)
    learner = _register(client, "jobs-learner@example.com")
    assert client.get("/api/admin/jobs", headers=learner).status_code == 403

    bad = client.post("/api/admin/jobs", headers=admin, json={**JOB, "stages": []})
    assert bad.status_code == 400
    bad = client.post("/api/admin/jobs", headers=admin, json={**JOB, "stages": [{"type": "test", "test": "nope"}]})
    assert bad.status_code == 400
    draft = client.post("/api/admin/jobs", headers=admin, json={**JOB, "title": "Draft role", "status": "draft"}).json()
    job = client.post("/api/admin/jobs", headers=admin, json=JOB).json()
    assert job["pipeline"][1] == {"key": "s2", "type": "interview", "kind": "technical", "title": "Technical interview",
                                  "pass": 70}

    board = client.get("/api/jobs").json()["jobs"]  # no sign-in needed
    ids = [j["id"] for j in board]
    assert job["id"] in ids and draft["id"] not in ids
    public = client.get(f"/api/jobs/{job['id']}").json()
    assert public["company"] == "Programming Haven" and "client_name" not in public and public["accepting"]
    assert [s["type"] for s in public["stages"]] == ["resume", "interview"]
    assert client.get(f"/api/jobs/{draft['id']}").status_code == 404

    shown = client.put(f"/api/admin/jobs/{job['id']}", headers=admin, json={**JOB, "show_client": True}).json()
    assert shown["company"] == "Acme Payments"
    client.put(f"/api/admin/jobs/{job['id']}", headers=admin, json=JOB)


def test_seeker_applies_and_gets_vetted(client):
    admin = _login(client, "jobs-admin@example.com")
    job = next(j for j in client.get("/api/admin/jobs", headers=admin).json()["jobs"] if j["title"] == JOB["title"])

    learner = _login(client, "jobs-learner@example.com")
    r = client.post(f"/api/jobs/{job['id']}/apply", headers=learner, json={})
    assert r.status_code == 403 and "Job Seeker" in r.json()["detail"]

    seeker = _register(client, "seeker-incomplete@example.com", "seeker")
    assert client.post(f"/api/jobs/{job['id']}/apply", headers=seeker, json={}).status_code == 400

    seeker = _seeker_ready(client, "seeker@example.com")
    app = client.post(f"/api/jobs/{job['id']}/apply", headers=seeker, json={"cover_note": "Payments is my thing."}).json()
    assert client.post(f"/api/jobs/{job['id']}/apply", headers=seeker, json={}).status_code == 409
    # The resume screen ran on apply and passed; the interview is next. The seeker never sees scores.
    assert app["status"] == "vetting" and app["stages"][0]["status"] == "passed"
    assert app["stages"][1]["status"] == "ready" and app["current"] == 1
    assert "score" not in app["stages"][0] and "report" not in app

    started = client.post(f"/api/applications/{app['id']}/stages/1/begin", headers=seeker).json()
    assert started["href"].startswith("/interview/") and f"application={app['id']}" in started["href"]
    session_id = int(started["href"].split("/interview/")[1].split("?")[0])
    assert client.post(f"/api/applications/{app['id']}/stages/0/begin", headers=seeker).status_code == 400

    _finish_interview(session_id, 82)
    done = client.get(f"/api/applications/{app['id']}", headers=seeker).json()
    assert done["status"] == "vetted" and done["status_label"].startswith("Vetting complete") and done["feedback"]

    ranked = client.get(f"/api/admin/jobs/{job['id']}/applications", headers=admin).json()
    top = ranked["applications"][0]
    assert top["id"] == app["id"] and top["score"] > 0 and top["report"]["recommendation"] in ("Strong yes", "Yes", "Maybe")
    assert top["candidate"]["profile"]["years_experience"] == 6 and top["stages"][0]["detail"]["matched_skills"]
    assert ranked["job"]["counts"]["vetted"] == 1
    assert client.get(f"/api/admin/applications/{app['id']}/resume", headers=admin).status_code == 200

    # Stages are locked once people have applied
    locked = client.put(f"/api/admin/jobs/{job['id']}", headers=admin,
                        json={**JOB, "stages": [{"type": "resume"}]})
    assert locked.status_code == 400

    moved = client.patch(f"/api/admin/applications/{app['id']}", headers=admin,
                         json={"status": "shortlisted", "admin_note": "Strong API design."}).json()
    assert moved["status"] == "shortlisted" and moved["admin_note"] == "Strong API design."
    mine = client.get("/api/applications", headers=seeker).json()["applications"][0]
    assert mine["status_label"] == "Shortlisted" and "admin_note" not in mine
    assert client.patch(f"/api/admin/applications/{app['id']}", headers=admin, json={"status": "bogus"}).status_code == 400
    assert client.delete(f"/api/admin/jobs/{job['id']}", headers=admin).status_code == 400


def test_weak_candidate_is_screened_out(client):
    admin = _login(client, "jobs-admin@example.com")
    job = client.post("/api/admin/jobs", headers=admin, json={**JOB, "title": "Rust Systems Engineer",
                                                              "skills": ["Rust", "Kubernetes", "gRPC", "eBPF"],
                                                              "stages": [{"type": "resume", "pass": 70},
                                                                         {"type": "interview", "kind": "english"}]}).json()
    seeker = _register(client, "seeker-weak@example.com", "seeker")
    client.put("/api/seeker/profile", headers=seeker, json={"headline": "Designer", "primary_role": "Designer",
                                                            "years_experience": 1, "skills": ["Figma"]})
    client.post("/api/seeker/resume", headers=seeker,
                files={"file": ("cv.txt", ("I design posters and logos in Figma and Photoshop for local shops. " * 4).encode(), "text/plain")})
    app = client.post(f"/api/jobs/{job['id']}/apply", headers=seeker, json={}).json()
    assert app["status"] == "not_selected" and app["status_label"] == "Not moving forward"
    assert app["stages"][1]["status"] == "skipped" and app["feedback"]
    # Withdrawing is for live applications only
    assert client.post(f"/api/applications/{app['id']}/withdraw", headers=seeker).status_code == 400
    # Learners can't see seeker endpoints
    learner = _login(client, "jobs-learner@example.com")
    assert client.get("/api/seeker/profile", headers=learner).status_code == 403
