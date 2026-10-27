"""1v1 coding duels: matchmaking, judging, ratings, the practice bot, invites and access control."""

from datetime import timedelta

import pytest

from app.database import SessionLocal
from app.main import app
from app.models import Duel
from app.routers import duels as duels_router
from app.services import duels as ds
from app.services.scoring import solved_slugs
from tests.test_problems import PY

if not any(getattr(r, "path", "").startswith("/api/duels") for r in app.routes):
    app.include_router(duels_router.router)

SLUG = "two-sum"


def _register(client, email, name="Duel Player"):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def fixed_problem(monkeypatch):
    monkeypatch.setattr(ds, "pick_problem", lambda db, difficulty, user_ids: SLUG)


def _shift_clock(monkeypatch, seconds):
    real = ds._now()
    monkeypatch.setattr(ds, "_now", lambda: real + timedelta(seconds=seconds))


def _edit(duel_id, **fields):
    with SessionLocal() as db:
        d = db.get(Duel, duel_id)
        for k, v in fields.items():
            setattr(d, k, v)
        db.commit()


def test_quick_match_and_accepted_wins(client, fixed_problem, monkeypatch):
    a = _register(client, "duel-a@example.com", "Ada Duel")
    b = _register(client, "duel-b@example.com", "Bob Duel")

    first = client.post("/api/duels/quick", headers=a, json={"difficulty": "Easy"})
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "waiting" and first.json()["opponent"] is None
    second = client.post("/api/duels/quick", headers=b, json={"difficulty": "Easy"}).json()
    assert second["id"] == first.json()["id"]
    assert second["status"] == "active" and second["phase"] == "countdown"
    duel_id = second["id"]

    # No code or problem during the countdown
    assert second.get("workspace") is None and second["problem"] is None
    early = client.post(f"/api/duels/{duel_id}/run", headers=a, json={"language": "python", "code": PY[SLUG]})
    assert early.status_code == 400

    _shift_clock(monkeypatch, 10)
    state = client.get(f"/api/duels/{duel_id}", headers=a).json()
    assert state["phase"] == "active" and state["workspace"]["slug"] == SLUG
    assert "solutions" not in state["workspace"] and state["opponent"]["name"] == "Bob Duel"
    assert not state["opponent"]["is_bot"] and state["me"]["me"]

    run = client.post(f"/api/duels/{duel_id}/run", headers=b, json={"language": "python", "code": PY[SLUG]})
    assert run.json()["status"] == "Accepted"

    # A wrong submission still shows progress and counts an attempt
    wrong = client.post(f"/api/duels/{duel_id}/submit", headers=b,
                        json={"language": "python", "code": "def two_sum(nums, target):\n    return [0, 1]\n"}).json()
    assert wrong["status"] != "Accepted" and wrong["duel"]["me"]["progress"]["attempts"] == 1
    seen_by_a = client.get(f"/api/duels/{duel_id}?light=1", headers=a).json()
    assert seen_by_a["opponent"]["progress"]["attempts"] == 1
    assert seen_by_a["opponent"]["progress"]["passed"] == wrong["passed"]
    assert "code" not in seen_by_a["opponent"] and "workspace" not in seen_by_a

    xp_before = client.get("/api/auth/me", headers=a).json()["xp"]
    win = client.post(f"/api/duels/{duel_id}/submit", headers=a, json={"language": "python", "code": PY[SLUG]})
    assert win.status_code == 200, win.text
    body = win.json()
    assert body["status"] == "Accepted" and body["duel"]["status"] == "finished"
    assert body["duel"]["result"]["outcome"] == "win" and body["duel"]["result"]["rating_change"] > 0
    assert body["user"]["xp"] >= xp_before + ds.XP["win"]

    # Visible to the loser, with ratings moved in opposite directions
    lost = client.get(f"/api/duels/{duel_id}", headers=b).json()
    assert lost["result"]["outcome"] == "loss" and lost["result"]["rating_change"] < 0
    assert lost["result"]["xp"] == ds.XP["loss"]
    me_a = client.get("/api/duels/me", headers=a).json()
    me_b = client.get("/api/duels/me", headers=b).json()
    assert me_a["stats"]["wins"] == 1 and me_a["stats"]["rating"] > ds.DEFAULT_RATING
    assert me_b["stats"]["losses"] == 1 and me_b["stats"]["rating"] < ds.DEFAULT_RATING
    assert me_a["recent"][0]["outcome"] == "win" and me_a["active"] is None
    board = client.get("/api/duels/leaderboard", headers=a).json()["leaderboard"]
    assert board[0]["user"]["name"] == "Ada Duel"

    # Locked after the finish; the normal submission counts as solved
    locked = client.post(f"/api/duels/{duel_id}/submit", headers=b, json={"language": "python", "code": PY[SLUG]})
    assert locked.status_code == 400
    with SessionLocal() as db:
        assert SLUG in solved_slugs(db, body["user"]["id"])


def test_bot_match_bot_wins(client, fixed_problem, monkeypatch):
    c = _register(client, "duel-c@example.com", "Cy Solo")
    duel = client.post("/api/duels/quick", headers=c, json={"difficulty": "Medium"}).json()
    assert duel["status"] == "waiting"
    too_soon = client.post(f"/api/duels/{duel['id']}/bot", headers=c)
    assert too_soon.status_code == 400

    _shift_clock(monkeypatch, 30)
    started = client.post(f"/api/duels/{duel['id']}/bot", headers=c)
    assert started.status_code == 200, started.text
    s = started.json()
    assert s["opponent"]["is_bot"] and "bot" in s["opponent"]["name"].lower()
    assert abs(s["opponent"]["rating"] - ds.DEFAULT_RATING) <= 60

    with SessionLocal() as db:
        bot = dict(db.get(Duel, duel["id"]).bot)
    lo, hi = ds.BOT_SOLVE_RANGE["Medium"]
    assert lo * 0.7 <= bot["solve_seconds"] <= hi * 1.35 and len(bot["wrong_attempts"]) <= 2
    _edit(duel["id"], bot={**bot, "solve_seconds": 0})

    _shift_clock(monkeypatch, 40)
    state = client.get(f"/api/duels/{duel['id']}", headers=c).json()
    assert state["status"] == "finished" and state["result"]["outcome"] == "loss"
    assert state["result"]["practice"] and state["result"]["rating_change"] < 0
    assert state["opponent"]["progress"]["solved_at"] == 0
    assert state["opponent"]["progress"]["passed"] == state["opponent"]["progress"]["total"]
    stats = client.get("/api/duels/me", headers=c).json()["stats"]
    assert stats["losses"] == 1 and stats["rating"] >= ds.DEFAULT_RATING - ds.K_PRACTICE


def test_bot_progress_advances_with_time(client, fixed_problem, monkeypatch):
    d = Duel(code="X", problem_slug=SLUG, difficulty="Easy", status="active", creator_id=1, time_limit_minutes=30,
             bot={"name": "Kai (practice bot)", "rating": 1200, "solve_seconds": 600,
                  "wrong_attempts": [{"at": 0.5, "passed": 0.6}]}, progress={})
    assert ds.bot_progress(d, 10, 100)["attempts"] == 0
    mid = ds.bot_progress(d, 10, 310)
    assert mid["attempts"] == 1 and 0 < mid["passed"] < 10 and mid["solved_at"] is None
    done = ds.bot_progress(d, 10, 601)
    assert done["passed"] == 10 and done["attempts"] == 2 and done["solved_at"] == 600


def test_private_invite_self_join_and_access(client, fixed_problem):
    d = _register(client, "duel-d@example.com", "Dee Host")
    e = _register(client, "duel-e@example.com", "Eli Guest")
    f = _register(client, "duel-f@example.com", "Fay Outsider")

    created = client.post("/api/duels", headers=d, json={"difficulty": "Hard", "private": True}).json()
    assert created["is_private"] and created["code"] and created["status"] == "waiting"
    code = created["code"]

    # A private duel is never picked by quick match
    other = client.post("/api/duels/quick", headers=f, json={"difficulty": "Hard"}).json()
    assert other["id"] != created["id"]
    client.post(f"/api/duels/{other['id']}/cancel", headers=f)

    assert client.post("/api/duels/join", headers=d, json={"code": code}).status_code == 400
    assert client.get(f"/api/duels/{created['id']}", headers=f).status_code == 403

    joined = client.post("/api/duels/join", headers=e, json={"code": code.lower()})
    assert joined.status_code == 200, joined.text
    assert joined.json()["id"] == created["id"] and joined.json()["status"] == "active"
    assert joined.json()["code"] is None

    # Full now; outsiders can neither join nor read nor act
    assert client.post("/api/duels/join", headers=f, json={"code": code}).status_code == 400
    assert client.get(f"/api/duels/{created['id']}", headers=f).status_code == 403
    assert client.post(f"/api/duels/{created['id']}/forfeit", headers=f).status_code == 403

    # Cancel only while waiting; forfeit counts as a loss for the forfeiter
    assert client.post(f"/api/duels/{created['id']}/cancel", headers=d).status_code == 400
    ff = client.post(f"/api/duels/{created['id']}/forfeit", headers=e).json()
    assert ff["result"]["outcome"] == "loss" and ff["result"]["forfeit"]
    host = client.get(f"/api/duels/{created['id']}", headers=d).json()
    assert host["result"]["outcome"] == "win" and host["result"]["opponent_forfeit"]
    assert client.post(f"/api/duels/{created['id']}/forfeit", headers=d).status_code == 400


def test_timeout_is_a_draw(client, fixed_problem, monkeypatch):
    g = _register(client, "duel-g@example.com")
    h = _register(client, "duel-h@example.com")
    duel = client.post("/api/duels", headers=g, json={"difficulty": "Easy", "private": True}).json()
    client.post("/api/duels/join", headers=h, json={"code": duel["code"]})
    _shift_clock(monkeypatch, 31 * 60 + 10)
    state = client.get(f"/api/duels/{duel['id']}", headers=h).json()
    assert state["status"] == "finished" and state["result"]["outcome"] == "draw"
    assert state["result"]["xp"] == ds.XP["draw"]


def test_stale_search_is_not_matched(client, fixed_problem):
    i = _register(client, "duel-i@example.com")
    j = _register(client, "duel-j@example.com")
    old = client.post("/api/duels/quick", headers=i, json={"difficulty": "Hard"}).json()
    _edit(old["id"], created_at=ds._now() - timedelta(minutes=3))
    fresh = client.post("/api/duels/quick", headers=j, json={"difficulty": "Hard"}).json()
    assert fresh["id"] != old["id"] and fresh["status"] == "waiting"
    client.post(f"/api/duels/{fresh['id']}/cancel", headers=j)
    client.post(f"/api/duels/{old['id']}/cancel", headers=i)
