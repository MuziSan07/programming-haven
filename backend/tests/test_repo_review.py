"""GitHub repo review: URL parsing, signals, offline review and the endpoint. No network access."""

import pytest

from app.services import repo_review as rr
from app.services.repo_review import RepoError

AWS_KEY = "AKIA" + "ABCDEFGHIJKLMNOP"  # split so scanners don't flag this test file

FAKE_TREE = [
    {"path": "README.md", "type": "blob", "size": 900},
    {"path": "package.json", "type": "blob", "size": 600},
    {"path": "package-lock.json", "type": "blob", "size": 90000},
    {"path": ".env", "type": "blob", "size": 80},
    {"path": ".env.example", "type": "blob", "size": 60},
    {"path": "Dockerfile", "type": "blob", "size": 300},
    {"path": ".github/workflows/ci.yml", "type": "blob", "size": 400},
    {"path": "src/index.ts", "type": "blob", "size": 1200},
    {"path": "src/routes/watchlist.ts", "type": "blob", "size": 2000},
    {"path": "src/feed/socket.ts", "type": "blob", "size": 2500},
    {"path": "src/config.ts", "type": "blob", "size": 200},
    {"path": "src/sort.test.ts", "type": "blob", "size": 800},
    {"path": "node_modules/react/index.js", "type": "blob", "size": 100},
    {"path": "dist/bundle.js", "type": "blob", "size": 100000},
    {"path": "src", "type": "tree"},
]

README = """# Crypto dashboard

## Setup
npm install

## Running
npm run dev

## Tests
npm test
"""

RAW_FILES = {
    "README.md": README,
    "package.json": '{"name": "dash", "scripts": {"test": "vitest"}}',
    "src/index.ts": "import { connect } from './feed/socket';\nconnect();\n",
    "src/routes/watchlist.ts": "export function sortWatchlist() { return []; }\n",
    "src/feed/socket.ts": "export function connect() { /* reconnect with backoff */ }\n",
    "src/config.ts": f"export const key = '{AWS_KEY}';\n",
    "src/sort.test.ts": "test('sort', () => {});\n",
}


def _commits(n, same_hour=False):
    out = []
    for i in range(n):
        day = 1 if same_hour else 1 + i
        out.append({"sha": f"{i:07d}abc", "author": {"login": "dev"},
                    "commit": {"message": "wip" if i % 3 == 0 else f"Add reconnect backoff step {i}",
                               "author": {"name": "Dev", "date": f"2026-10-{day:02d}T10:{i:02d}:00Z"}}})
    return out


def install_fake_github(monkeypatch, *, commits=None, missing=False, rate_limited=False):
    commits = _commits(6) if commits is None else commits

    def fake_json(client, url, params=None):
        if rate_limited:
            raise RepoError(429, "GitHub's hourly limit for anonymous requests is used up.")
        if missing:
            raise RepoError(404, "Repository not found. Check the link and make sure the repo is public.")
        if url.endswith("/repos/octo/dash"):
            return {"full_name": "octo/dash", "html_url": "https://github.com/octo/dash", "default_branch": "main",
                    "description": "Live crypto dashboard", "stargazers_count": 3, "size": 120,
                    "created_at": "2026-10-01T09:00:00Z", "pushed_at": "2026-10-06T10:00:00Z",
                    "license": {"spdx_id": "MIT"}, "topics": ["react"], "private": False}, {}
        if "/git/trees/" in url:
            return {"tree": FAKE_TREE, "truncated": False}, {}
        if url.endswith("/languages"):
            return {"TypeScript": 9000, "Dockerfile": 300}, {}
        if url.endswith("/commits"):
            return commits, {}
        raise AssertionError(f"unexpected url {url}")

    def fake_raw(client, url):
        path = url.split("/main/", 1)[1]
        return RAW_FILES.get(path)

    monkeypatch.setattr(rr, "_get_json", fake_json)
    monkeypatch.setattr(rr, "_get_raw", fake_raw)


# ---------------------------------------------------------------------------

@pytest.mark.parametrize("url,expected", [
    ("https://github.com/octo/dash", ("octo", "dash", None)),
    ("https://github.com/octo/dash/", ("octo", "dash", None)),
    ("http://www.github.com/octo/dash.git", ("octo", "dash", None)),
    ("octo/my.repo-name_1", ("octo", "my.repo-name_1", None)),
    ("https://github.com/octo/dash/tree/feature/live-feed", ("octo", "dash", "feature/live-feed")),
    ("  octo/dash  ", ("octo", "dash", None)),
])
def test_parse_repo_url_ok(url, expected):
    assert rr.parse_repo_url(url) == expected


@pytest.mark.parametrize("url", [
    "", "octo", "https://gitlab.com/octo/dash", "https://github.com/octo", "octo/dash/issues",
    "https://github.com/-bad/dash", "octo/..", "https://github.com/octo/dash?tab=readme",
    "javascript:alert(1)", "https://github.com/octo/dash/tree/../../etc",
])
def test_parse_repo_url_rejects(url):
    with pytest.raises(RepoError) as e:
        rr.parse_repo_url(url)
    assert e.value.status == 400


def test_secret_detection_reports_type_not_value():
    found = rr.scan_secrets({
        "a.py": f"KEY = '{AWS_KEY}'",
        "b.js": "const k = 'sk-" + "x" * 30 + "'",
        "c.pem": "-----BEGIN PRIVATE KEY-----\nabc",
        ".env.example": f"AWS={AWS_KEY}",  # examples are ignored
        "clean.py": "print('hello')",
    })
    assert {(f["file"], f["type"]) for f in found} == {
        ("a.py", "AWS access key"), ("b.js", "OpenAI-style API key"), ("c.pem", "Private key")}
    assert AWS_KEY not in str(found)
    assert AWS_KEY not in rr.redact(f"x {AWS_KEY} y")


def test_signals_from_fake_repo(monkeypatch):
    install_fake_github(monkeypatch)
    data = rr.gather("octo", "dash")
    assert not any(t["path"].startswith(("node_modules/", "dist/")) for t in data["tree"])
    assert "package.json" in data["files"] and "src/index.ts" in data["files"]
    s = rr.compute_signals(data)
    assert s["tests"]["has"] and s["ci"]["has"] and s["docker"] and s["env_example"] and s["lockfile"]["has"]
    types = {(x["file"], x["type"]) for x in s["secrets"]}
    assert (".env", ".env file committed") in types
    assert ("src/config.ts", "AWS access key") in types
    assert AWS_KEY not in str(s)
    rd = s["readme"]["sections"]
    assert rd["setup"] and rd["run"] and rd["tests"] and not rd["decisions"]
    assert s["commits"]["count"] == 6 and not s["commits"]["single_commit_dump"]
    assert s["commits"]["low_quality_share"] == pytest.approx(0.33, abs=0.01)
    assert s["commits"]["active_days"] == 6


def test_single_commit_dump_flag():
    one = rr.commit_signals([{"message": "Initial commit", "date": "2026-10-01T10:00:00Z", "author": "a"}], 1, 30)
    assert one["single_commit_dump"] and one["spread"] == "single sitting"
    burst = rr.commit_signals([{"message": f"part {i}", "date": f"2026-10-01T10:0{i}:00Z", "author": "a"}
                               for i in range(3)], 3, 20)
    assert burst["single_commit_dump"]
    spread = rr.commit_signals([{"message": f"Add feature {i}", "date": f"2026-10-0{i + 1}T10:00:00Z", "author": "a"}
                                for i in range(5)], 5, 20)
    assert not spread["single_commit_dump"] and spread["active_days"] == 5


def test_low_quality_messages():
    for m in ("update", "fix", "WIP", "asdf", "Update README.md", "Add files via upload", "x"):
        assert rr.is_low_quality(m), m
    assert not rr.is_low_quality("Add exponential backoff to the ticker socket")


def _project():
    return {"title": "Dash", "niche": "Frontend", "level": "Intermediate", "brief": "Build it",
            "requirements": ["Automatic reconnect with exponential backoff", "Sortable watchlist columns",
                             "Price alerts over SMS gateway"],
            "rubric": [{"criterion": "Correctness", "weight": 50}, {"criterion": "Testing", "weight": 30},
                       {"criterion": "Documentation", "weight": 20}]}


def test_fallback_review_shape(monkeypatch):
    install_fake_github(monkeypatch)
    data = rr.gather("octo", "dash")
    review, signals, used_ai = rr.review_repo(_project(), data, "notes")
    assert used_ai is False
    for key in ("overall_score", "verdict", "rationale", "rubric", "structure", "tests", "readme", "commits",
                "requirements", "red_flags", "strengths", "top_fixes", "interviewer_questions"):
        assert key in review, key
    assert 0 <= review["overall_score"] <= 35  # capped because secrets were committed
    assert review["verdict"] in rr.VERDICTS
    assert [r["criterion"] for r in review["rubric"]] == ["Correctness", "Testing", "Documentation"]
    assert all(0 <= r["score"] <= 10 for r in review["rubric"])
    assert {r["status"] for r in review["requirements"]} <= {"met", "partial", "missing"}
    assert len(review["requirements"]) == 3
    assert "coverage_guess" in review["tests"] and "missing_sections" in review["readme"]
    assert set(review["commits"]["examples"]) == {"good", "bad"}
    assert any("secret" in f.lower() for f in review["red_flags"])
    assert all(f["priority"] in ("high", "medium", "low") for f in review["top_fixes"])
    assert 3 <= len(review["interviewer_questions"]) <= 5
    assert AWS_KEY not in str(review)


def test_normalise_keeps_secret_cap():
    signals = {"secrets": [{"file": ".env", "type": ".env file committed"}]}
    fb = {"overall_score": 30, "verdict": "no", "rationale": "", "summary": "", "rubric": [
        {"criterion": "Correctness", "score": 3, "comment": ""}], "structure": [], "tests": {"comment": "",
        "coverage_guess": "low"}, "readme": {"comment": "", "missing_sections": []},
        "commits": {"comment": "", "examples": {"good": [], "bad": []}}, "requirements": [], "red_flags": [],
        "strengths": [], "top_fixes": [], "interviewer_questions": ["q"]}
    out = rr.normalise({"overall_score": 140, "verdict": "Hire", "rubric": [{"criterion": "correctness", "score": 12}]},
                       fb, signals)
    assert out["overall_score"] == 45 and out["verdict"] == "lean no"
    assert out["rubric"][0]["score"] == 10
    assert any(".env" in f for f in out["red_flags"])


# ---------------------------------------------------------------------------

def _pid(client, auth):
    projects = client.get("/api/projects", headers=auth).json()["projects"]
    if not projects:
        pytest.skip("no projects seeded")
    return projects[0]["id"]


def test_endpoint_happy_path(client, auth, monkeypatch):
    install_fake_github(monkeypatch)
    pid = _pid(client, auth)
    r = client.post(f"/api/projects/{pid}/review-repo",
                    json={"repo_url": "https://github.com/octo/dash", "notes": "Focused on the feed"}, headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kind"] == "repo" and body["repo"]["full_name"] == "octo/dash"
    assert body["review"]["ai"] is False and body["xp_gained"] == 10
    assert body["signals"]["tests"]["has"] is True
    assert body["user"]["xp"] >= 10

    listing = client.get(f"/api/projects/{pid}/submissions", headers=auth).json()["submissions"]
    assert listing[0]["id"] == body["id"]
    detail = client.get(f"/api/projects/{pid}/submissions/{body['id']}", headers=auth)
    assert detail.status_code == 200 and detail.json()["review"]["verdict"] == body["review"]["verdict"]
    assert client.get(f"/api/projects/{pid}", headers=auth).json()["submissions"][0]["kind"] == "repo"
    assert client.get(f"/api/projects/{pid}/submissions/999999", headers=auth).status_code == 404


def test_endpoint_errors(client, auth, monkeypatch):
    pid = _pid(client, auth)
    url = f"/api/projects/{pid}/review-repo"
    assert client.post(url, json={"repo_url": "https://gitlab.com/a/b"}, headers=auth).status_code == 400
    install_fake_github(monkeypatch, missing=True)
    r = client.post(url, json={"repo_url": "octo/private-thing"}, headers=auth)
    assert r.status_code == 404 and "public" in r.json()["detail"]
    install_fake_github(monkeypatch, rate_limited=True)
    r = client.post(url, json={"repo_url": "octo/dash"}, headers=auth)
    assert r.status_code == 429 and "limit" in r.json()["detail"]
    assert client.post("/api/projects/nope/review-repo", json={"repo_url": "octo/dash"},
                       headers=auth).status_code == 404


def test_rate_limit_header_mapping():
    import httpx

    def handler(request):
        return httpx.Response(403, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        with pytest.raises(RepoError) as e:
            rr._get_json(c, "https://api.github.com/repos/a/b")
    assert e.value.status == 429

    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(404))) as c:
        with pytest.raises(RepoError) as e:
            rr._get_json(c, "https://api.github.com/repos/a/b")
    assert e.value.status == 404
