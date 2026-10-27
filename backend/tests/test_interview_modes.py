"""Interview replay analytics, panel, stress and pair-programming modes (AI offline)."""

from app.content import store
from app.database import SessionLocal
from app.routers.interviews import STRESS_PUSHBACK
from app.services import speech


def _user(client, name):
    email = f"{name.lower()}@modes.example.com"
    r = client.post("/api/auth/register", json={"name": f"{name} Tester", "email": email, "password": "password123"})
    if r.status_code == 409:
        r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


FILLER_ANSWER = ("Um, so basically I built, like, a payments service. Basically it, you know, retried failed charges "
                 "and I mean it was basically fine. I like Python a lot.")


def test_filler_counting_ignores_verb_like():
    counts = speech.count_fillers(FILLER_ANSWER)
    assert counts["by_word"]["basically"] == 3
    assert counts["by_word"]["like"] == 1  # "I like Python" is not a filler
    assert counts["by_word"]["um"] == 1 and counts["by_word"]["you know"] == 1 and counts["by_word"]["i mean"] == 1
    assert counts["total"] == 7
    spans = speech.filler_spans(FILLER_ANSWER)
    assert all(FILLER_ANSWER[s["start"]:s["end"]].lower() == s["word"] for s in spans)


def test_reply_meta_stores_metrics_and_replay(client):
    h = _user(client, "Replay")
    s = client.post("/api/interviews", json={"kind": "technical"}, headers=h).json()
    meta = {"answer_ms": 40000, "think_ms": 12000, "speaking_ms": 30000, "input": "voice"}
    s = client.post(f"/api/interviews/{s['id']}/reply", headers=h, json={"text": FILLER_ANSWER, "meta": meta}).json()
    m = s["transcript"][1]["metrics"]
    words = len(FILLER_ANSWER.split())
    assert m["words"] == words and m["wpm"] == round(words / 0.5)
    assert m["fillers"]["total"] == 7 and m["fillers"]["by_word"]["basically"] == 3
    assert m["think_ms"] == 12000 and m["long_pause"] is True and m["answer_ms"] == 40000
    # A typed answer has no wpm
    s = client.post(f"/api/interviews/{s['id']}/reply", headers=h,
                    json={"text": "At my last job we cut p95 latency from 900 ms to 120 ms by adding a cache.",
                          "meta": {"answer_ms": 9000, "think_ms": 2000, "input": "text"}}).json()
    assert "wpm" not in s["transcript"][3]["metrics"] and s["transcript"][3]["metrics"]["long_pause"] is False
    # Bad meta is rejected
    bad = client.post(f"/api/interviews/{s['id']}/reply", headers=h, json={"text": "hi", "meta": {"think_ms": -5}})
    assert bad.status_code == 422

    assert client.get(f"/api/interviews/{s['id']}/replay", headers=h).status_code == 409
    done = client.post(f"/api/interviews/{s['id']}/end", headers=h).json()
    assert len(done["feedback"]["replay"]) == 2
    r = client.get(f"/api/interviews/{s['id']}/replay", headers=h).json()
    first = r["turns"][0]
    assert first["question"].startswith("Hi Replay") and first["answer"] == FILLER_ANSWER
    assert 1 <= len(first["tips"]) <= 3
    assert all(t["type"] in ("content", "delivery", "structure", "english") and
               t["severity"] in ("low", "medium", "high") and t["text"] for t in first["tips"])
    assert any("filler" in t["text"] for t in first["tips"])
    assert len(first["highlights"]) == 7
    assert r["totals"]["total_fillers"] == 7 and r["totals"]["top_fillers"][0] == {"word": "basically", "count": 3}
    assert r["totals"]["longest_pause_ms"] == 12000 and r["totals"]["avg_wpm"] == first["metrics"]["wpm"]
    assert r["session"]["overall_score"] == done["feedback"]["overall_score"]


def test_replay_is_computed_lazily_for_old_sessions(client):
    from app.models import InterviewSession
    h = _user(client, "Oldtimer")
    s = client.post("/api/interviews", json={"kind": "behavioral"}, headers=h).json()
    client.post(f"/api/interviews/{s['id']}/reply", headers=h, json={"text": "Um, I worked on a team."})
    client.post(f"/api/interviews/{s['id']}/end", headers=h)
    with SessionLocal() as db:  # simulate a session graded before replays existed
        row = db.get(InterviewSession, s["id"])
        row.feedback = {k: v for k, v in row.feedback.items() if k != "replay"}
        row.transcript = [{k: v for k, v in t.items() if k != "metrics"} for t in row.transcript]
        db.commit()
    r = client.get(f"/api/interviews/{s['id']}/replay", headers=h).json()
    assert r["turns"][0]["metrics"]["words"] == 6 and r["turns"][0]["metrics"]["think_ms"] is None
    with SessionLocal() as db:
        assert "replay" in db.get(InterviewSession, s["id"]).feedback


def test_panel_alternates_speakers(client):
    h = _user(client, "Panelist")
    s = client.post("/api/interviews", json={"kind": "panel", "persona_id": "aria"}, headers=h).json()
    assert s["mode"] == "panel" and [p["id"] for p in s["panel"]] == ["aria", "alex"]
    assert all(p["name"] and p["voice"] and p["model_url"] and p["title"] for p in s["panel"])
    assert s["transcript"][0]["speaker"] == "aria"
    for i in range(3):
        s = client.post(f"/api/interviews/{s['id']}/reply", headers=h,
                        json={"text": f"Answer number {i} with some detail about my work."}).json()
    speakers = [t["speaker"] for t in s["transcript"] if t["role"] == "interviewer"]
    assert speakers == ["aria", "alex", "aria", "alex"]
    assert s["questions_asked"] == 4
    done = client.post(f"/api/interviews/{s['id']}/end", headers=h).json()
    f = done["feedback"]
    assert f["panel"] == ["Aria", "Alex"] and f["technical_view"] and f["hr_view"]
    assert f["replay"][1]["speaker"] == "alex"


def test_panel_two_line_reply_counts_as_one_question():
    from app.routers.interviews import _panel_lines
    lines = _panel_lines({"lines": [{"speaker": "alex", "text": "[Alex] Sorry to jump in, Aria, but why?"},
                                    {"speaker": "aria", "text": "Good point. And how did you test it?"}],
                          "interrupts": True}, ["aria", "alex"], "aria")
    assert [x["speaker"] for x in lines] == ["alex", "aria"]
    assert lines[0]["content"].startswith("Sorry") and lines[1]["cont"] and lines[1]["interrupts"]
    single = _panel_lines({"speaker": "nobody", "text": "Next question?", "interrupts": False}, ["aria", "alex"], "alex")
    assert single == [{"role": "interviewer", "content": "Next question?", "speaker": "alex"}]


def test_stress_mode(client):
    h = _user(client, "Pressure")
    s = client.post("/api/interviews", json={"kind": "technical", "stress": True}, headers=h).json()
    assert s["stress"] is True
    s = client.post(f"/api/interviews/{s['id']}/reply", headers=h,
                    json={"text": "I would add an index and cache the hot rows in Redis."}).json()
    assert any(s["transcript"][-1]["content"].startswith(p) for p in STRESS_PUSHBACK)
    done = client.post(f"/api/interviews/{s['id']}/end", headers=h).json()
    f = done["feedback"]
    assert f["stress"] is True and 0 <= f["composure"] <= 100 and f["composure_note"]
    # English never runs in stress mode
    e = client.post("/api/interviews", json={"kind": "english", "stress": True}, headers=h).json()
    assert e["stress"] is False


def _solution_files(round_id):
    with SessionLocal() as db:
        item = store.get_item(db, "debug", round_id)
    return {**item["files"], **item["solution"]}, item


def test_pair_programming_round(client):
    h = _user(client, "Pairer")
    s = client.post("/api/interviews", json={"kind": "pair-programming", "language": "python"}, headers=h).json()
    assert s["mode"] == "pair"
    rnd = s["round"]
    assert rnd["language"] == "python" and rnd["difficulty"] != "Expert" and len(rnd["files"]) <= 2
    assert "solution" not in rnd and rnd["test_file"] == "tests.py"
    solution, item = _solution_files(rnd["id"])

    failing = client.post(f"/api/interviews/{s['id']}/run", headers=h, json={"files": rnd["files"]}).json()
    assert failing["status"] != "All tests pass"
    bad = client.post(f"/api/interviews/{s['id']}/run", headers=h, json={"files": {"tests.py": "x = 1"}})
    assert bad.status_code == 400
    passing = client.post(f"/api/interviews/{s['id']}/run", headers=h, json={"files": solution}).json()
    assert passing["status"] == "All tests pass"
    got = client.get(f"/api/interviews/{s['id']}", headers=h).json()
    assert got["last_run"]["status"] == "All tests pass" and got["edits"]

    s = client.post(f"/api/interviews/{s['id']}/reply", headers=h,
                    json={"text": "I think the boundary check is off by one, let me fix it.", "files": solution}).json()
    assert s["transcript"][-1]["role"] == "interviewer"
    xp_before = client.get("/api/auth/me", headers=h).json()["xp"]
    done = client.post(f"/api/interviews/{s['id']}/end", headers=h, json={"files": solution}).json()
    f = done["feedback"]
    assert f["bug_found"] is True and f["tests"]["status"] == "All tests pass"
    assert "collaboration" in f["scores"] and "communication" in f["scores"]
    from app.routers.rounds import XP_ROUND
    from app.services.scoring import XP_INTERVIEW
    assert done["xp_gained"] == XP_INTERVIEW + XP_ROUND[item["difficulty"]]
    assert done["user"]["xp"] == xp_before + done["xp_gained"]
    # Ending again doesn't award XP twice
    again = client.post(f"/api/interviews/{s['id']}/end", headers=h, json={"files": solution}).json()
    assert "xp_gained" not in again
    assert client.post(f"/api/interviews/{s['id']}/run", headers=h, json={"files": solution}).status_code == 409


def test_pair_end_with_buggy_files(client):
    h = _user(client, "Stuck")
    s = client.post("/api/interviews", json={"kind": "pair-programming", "language": "javascript"}, headers=h).json()
    assert s["round"]["language"] == "javascript" and s["round"]["test_file"] == "tests.js"
    client.post(f"/api/interviews/{s['id']}/reply", headers=h, json={"text": "Let me read the tests first."})
    done = client.post(f"/api/interviews/{s['id']}/end", headers=h).json()
    assert done["feedback"]["bug_found"] is False and done["xp_gained"] == 40
