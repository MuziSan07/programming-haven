from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import InterviewBan, User


def _user(client, name):
    email = f"{name.lower()}@example.com"
    r = client.post("/api/auth/register", json={"name": f"{name} Tester", "email": email, "password": "password123"})
    if r.status_code == 409:
        r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _start(client, headers):
    return client.post("/api/interviews", json={"kind": "technical"}, headers=headers)


def test_greets_candidate_by_profile_name(client):
    h = _user(client, "Zara")
    s = _start(client, h).json()
    assert s["transcript"][0]["content"].startswith("Hi Zara")


def test_warning_then_termination_then_escalating_bans(client):
    h = _user(client, "Cheater")
    s = _start(client, h).json()
    warn = client.post(f"/api/interviews/{s['id']}/integrity", headers=h, json={"kind": "left_tab"}).json()
    assert warn["integrity"]["action"] == "warning" and not warn["terminated"]
    out = client.post(f"/api/interviews/{s['id']}/integrity", headers=h, json={"kind": "paste"}).json()
    assert out["integrity"]["action"] == "terminated" and out["terminated"] and out["feedback"]["verdict"] == "Terminated"
    assert out["integrity"]["ban"]["length"] == "1 hour"
    assert _start(client, h).status_code == 403
    assert client.get("/api/interviews/ban", headers=h).json()["ban"]["offense"] == 1

    # Expire the ban, offend again: the next ban is 24 hours, and so on up the ladder
    lengths = []
    for _ in range(5):
        with SessionLocal() as db:
            for b in db.query(InterviewBan).join(User).filter(User.email == "cheater@example.com"):
                if b.ends_at is not None:
                    b.ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
        s = _start(client, h).json()
        client.post(f"/api/interviews/{s['id']}/integrity", headers=h, json={"kind": "left_tab"})
        r = client.post(f"/api/interviews/{s['id']}/integrity", headers=h, json={"kind": "left_tab"}).json()
        lengths.append(r["integrity"]["ban"]["length"])
    assert lengths == ["24 hours", "3 days", "1 week", "1 month", "permanently"]
    assert "Contact support" in _start(client, h).json()["detail"]


def test_admin_can_lift_ban_and_it_stops_counting(client):
    h = _user(client, "Oops")
    s = _start(client, h).json()
    for _ in range(2):
        client.post(f"/api/interviews/{s['id']}/integrity", headers=h, json={"kind": "left_tab"})
    admin = _user(client, "Boss")
    with SessionLocal() as db:
        db.query(User).filter(User.email == "boss@example.com").update({"is_admin": True})
        db.commit()
    data = client.get("/api/admin/integrity", headers=admin).json()
    ban = next(b for b in data["bans"] if b["user"]["email"] == "oops@example.com")
    assert ban["active"] and len([x for x in data["strikes"] if x["user"]["email"] == "oops@example.com"]) == 2
    client.post(f"/api/admin/integrity/bans/{ban['id']}/lift", headers=admin)
    assert _start(client, h).status_code == 200
    # The lifted ban doesn't count: the next offense is treated as a first offense again
    s = _start(client, h).json()
    for _ in range(2):
        r = client.post(f"/api/interviews/{s['id']}/integrity", headers=h, json={"kind": "left_tab"}).json()
    assert r["integrity"]["ban"]["length"] == "1 hour"
