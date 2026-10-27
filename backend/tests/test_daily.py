"""Daily challenge: deterministic selection, the submit hook, the streak bonus and the leaderboard."""

from datetime import date, datetime, timedelta, timezone

from app.database import SessionLocal
from app.main import app
from app.models import DailySolve
from app.routers import daily as daily_router
from app.services import daily
from tests.test_problems import PY

if not any(getattr(r, "path", "").startswith("/api/daily") for r in app.routes):
    app.include_router(daily_router.router)

SLUG = "two-sum"


def _register(client, email, name="Daily Person"):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]


def _today_slug(monkeypatch):
    """Use today's real problem when its Python solution is known, otherwise pin a known one."""
    with SessionLocal() as db:
        slug = daily.pick_slug(db, daily.utc_today())
    if slug not in PY:
        monkeypatch.setattr(daily, "pick_slug", lambda db, day: SLUG)
        slug = SLUG
    return slug


def test_selection_is_deterministic_and_rotates():
    with SessionLocal() as db:
        start = date(2026, 3, 2)  # a Monday
        picks = [daily.pick_slug(db, start + timedelta(days=i)) for i in range(180)]
        assert picks == [daily.pick_slug(db, start + timedelta(days=i)) for i in range(180)]
        expected = ["Easy", "Easy", "Medium", "Medium", "Medium", "Hard", "Medium"]
        for i, slug in enumerate(picks):
            assert not slug.startswith("oa-")
            difficulty = daily.problem_summary(db, slug)["difficulty"]
            want = expected[(start + timedelta(days=i)).weekday()]
            assert difficulty in (("Hard", "Expert") if want == "Hard" else (want,))
            assert slug not in picks[max(0, i - daily.NO_REPEAT_DAYS):i], f"{slug} repeated on day {i}"


def test_bonus_formula():
    assert daily.bonus_for(1) == 15
    assert daily.bonus_for(3) == 25
    assert daily.bonus_for(30) == 50


def test_solve_through_dsa_submit(client, monkeypatch):
    slug = _today_slug(monkeypatch)
    headers, user = _register(client, "daily-solver@example.com")
    before = client.get("/api/daily", headers=headers).json()
    assert before["problem"]["slug"] == slug and not before["status"]["solved"]
    assert before["status"]["bonus_xp"] == 15 and before["streak"] == 0
    assert len(before["calendar"]) == 30

    wrong = client.post("/api/dsa/submit", headers=headers,
                        json={"slug": slug, "language": "python", "code": "def nope():\n    return None\n"}).json()
    assert wrong["status"] != "Accepted" and "daily" not in wrong

    r = client.post("/api/dsa/submit", headers=headers, json={"slug": slug, "language": "python", "code": PY[slug]})
    body = r.json()
    assert body["status"] == "Accepted", body
    assert body["daily"]["bonus_xp"] == 15 and body["daily"]["streak"] == 1 and body["daily"]["rank"] >= 1
    # Base problem XP plus the daily bonus, nothing more
    assert body["user"]["xp"] == user["xp"] + body["xp_gained"] + 15

    again = client.post("/api/dsa/submit", headers=headers,
                        json={"slug": slug, "language": "python", "code": PY[slug]}).json()
    assert "daily" not in again and again["user"]["xp"] == body["user"]["xp"]  # bonus once per day

    after = client.get("/api/daily", headers=headers).json()
    assert after["status"]["solved"] and after["status"]["attempts"] == 2 and after["status"]["bonus_xp"] == 15
    assert after["streak"] == 1 and after["calendar"][-1]["solved"]
    assert after["my_row"]["me"] and after["my_row"]["attempts"] == 2
    assert after["my_row"]["time_after_reset"].count(":") == 2


def test_streak_raises_bonus(client, monkeypatch):
    slug = _today_slug(monkeypatch)
    headers, user = _register(client, "daily-streak@example.com")
    today = daily.utc_today()
    with SessionLocal() as db:
        for i in (1, 2):
            db.add(DailySolve(user_id=user["id"], day=today - timedelta(days=i), problem_slug="x",
                              solved_at=datetime.now(timezone.utc) - timedelta(days=i)))
        db.commit()
    assert client.get("/api/daily", headers=headers).json()["streak"] == 2
    r = client.post("/api/dsa/submit", headers=headers,
                    json={"slug": slug, "language": "python", "code": PY[slug]}).json()
    assert r["daily"]["streak"] == 3 and r["daily"]["bonus_xp"] == 25
    hist = client.get("/api/daily/history?days=3", headers=headers).json()["days"]
    assert [d["solved"] for d in hist] == [True, True, False]
    assert all(d["problem"]["title"] for d in hist)


def test_leaderboard_order(client, monkeypatch):
    _today_slug(monkeypatch)
    today = daily.utc_today()
    start = daily.day_start(today)
    names = ["Board Early", "Board Tie Fewer", "Board Tie More"]
    users = [_register(client, f"board{i}@example.com", name)[1] for i, name in enumerate(names)]
    with SessionLocal() as db:
        # Earliest wins; equal times break on fewer attempts. Times sit before any real solve today.
        early = start + timedelta(microseconds=1)
        tie = start + timedelta(microseconds=2)
        for u, at, attempts in [(users[2], tie, 4), (users[0], early, 9), (users[1], tie, 1)]:
            db.add(DailySolve(user_id=u["id"], day=today, problem_slug="x", attempts=attempts, solved_at=at))
        db.commit()
    headers, _ = _register(client, "board-viewer@example.com")
    data = client.get("/api/daily", headers=headers).json()
    rows = [r["name"] for r in data["leaderboard"]]
    assert rows[:3] == names
    assert [r["rank"] for r in data["leaderboard"]] == list(range(1, len(rows) + 1))
    assert data["leaderboard"][0]["time_after_reset"] == "00:00:00"
    assert data["my_row"] is None and data["status"]["rank"] is None
