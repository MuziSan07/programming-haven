"""Review a public GitHub repository like a hiring manager reviewing a take-home project.

Pipeline: parse the URL -> gather repo data from the GitHub REST API (about 5 API calls, file contents come
from raw.githubusercontent.com so they don't spend API quota) -> compute deterministic signals -> ask the AI
for a rubric-based review, with a signals-only offline fallback.

No token is used: the unauthenticated limit is 60 requests per hour per IP.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import httpx

from . import ai

API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"
HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "programming-haven"}
TIMEOUT = 10

TREE_CAP = 2000
MAX_KEY_FILES = 12
FILE_CAP = 6_000
TOTAL_CAP = 48_000
README_CAP = 8_000
SKIP_DIRS = {"node_modules", "vendor", "dist", ".git", "build", ".next", "coverage", "__pycache__", ".venv",
             "venv", "target", "out", ".idea", ".vscode"}
VERDICTS = ("hire", "lean hire", "lean no", "no")


class RepoError(Exception):
    """A user-facing failure with the HTTP status the router should return."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------------------
# URL parsing
# ---------------------------------------------------------------------------

_OWNER = r"[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}"
_REPO = r"[A-Za-z0-9._-]{1,100}"
_REF = r"[A-Za-z0-9._/-]{1,200}"
_URL_RE = re.compile(
    rf"^(?:https?://(?:www\.)?github\.com/)?(?P<owner>{_OWNER})/(?P<repo>{_REPO}?)(?:\.git)?"
    rf"(?:/tree/(?P<ref>{_REF}))?/?$"
)


def parse_repo_url(url: str) -> tuple[str, str, str | None]:
    """Return (owner, repo, ref or None). Raises RepoError(400) for anything that isn't a GitHub repo."""
    s = (url or "").strip()
    m = _URL_RE.match(s)
    if not m:
        raise RepoError(400, "Use a GitHub repository link like https://github.com/owner/repo or owner/repo")
    owner, repo, ref = m.group("owner"), m.group("repo"), m.group("ref")
    if repo in {".", ".."} or not repo or (ref and (".." in ref or ref.startswith("/") or "//" in ref)):
        raise RepoError(400, "That doesn't look like a valid GitHub repository link")
    return owner, repo, (ref.strip("/") or None) if ref else None


# ---------------------------------------------------------------------------
# HTTP (module-level so tests can monkeypatch them)
# ---------------------------------------------------------------------------

def _get_json(client: httpx.Client, url: str, params: dict | None = None) -> tuple[Any, dict]:
    """GET a GitHub API URL. Returns (json, headers). Maps GitHub failures to RepoError."""
    try:
        resp = client.get(url, params=params)
    except httpx.HTTPError as e:
        raise RepoError(502, "GitHub is not reachable right now. Try again in a minute.") from e
    remaining = resp.headers.get("x-ratelimit-remaining")
    if resp.status_code in (403, 429) and (remaining == "0" or resp.status_code == 429):
        reset = resp.headers.get("x-ratelimit-reset")
        when = ""
        if reset and reset.isdigit():
            when = " after " + datetime.fromtimestamp(int(reset), timezone.utc).strftime("%H:%M UTC")
        raise RepoError(429, f"GitHub's hourly limit for anonymous requests is used up. Try again{when}.")
    if resp.status_code == 404:
        raise RepoError(404, "Repository not found. Check the link and make sure the repo is public.")
    if resp.status_code == 409:  # empty repository
        raise RepoError(400, "That repository is empty")
    if resp.status_code >= 400:
        raise RepoError(502, f"GitHub returned an error ({resp.status_code}). Try again shortly.")
    try:
        return resp.json(), dict(resp.headers)
    except ValueError as e:
        raise RepoError(502, "GitHub returned an unreadable response") from e


def _get_raw(client: httpx.Client, url: str) -> str | None:
    """GET a raw file. Returns None on any failure (a missing file never fails the review)."""
    try:
        resp = client.get(url)
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    return resp.text


# ---------------------------------------------------------------------------
# Gathering
# ---------------------------------------------------------------------------

MANIFESTS = {"package.json", "requirements.txt", "pyproject.toml", "go.mod", "pom.xml", "build.gradle",
             "build.gradle.kts", "cargo.toml", "gemfile", "composer.json", "pipfile", "setup.py", "tsconfig.json"}
LOCKFILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "poetry.lock", "pipfile.lock",
             "go.sum", "cargo.lock", "gemfile.lock", "composer.lock", "uv.lock"}
CODE_EXT = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".java", ".kt", ".rb", ".php", ".cs",
            ".rs", ".swift", ".scala", ".vue", ".svelte", ".c", ".cc", ".cpp", ".h", ".hpp", ".dart", ".ex", ".exs"}
TEXT_EXT = CODE_EXT | {".json", ".toml", ".yml", ".yaml", ".txt", ".mod", ".xml", ".gradle", ".kts", ".sql",
                       ".prisma", ".graphql", ".md", ".cfg", ".ini", ".env", ".example", ".sample", ".template"}
_TEST_RE = re.compile(r"(^|/)(tests?|__tests__|spec|e2e)/|(^|/)test_[^/]+$|[._-](test|spec)\.[a-z]+$|_test\.go$|"
                      r"Tests?\.(java|kt|cs)$", re.I)
_ENV_EXAMPLE_RE = re.compile(r"(^|/)\.env\.(example|sample|template|dist|defaults)$|(^|/)env\.example$", re.I)
_ENV_FILE_RE = re.compile(r"(^|/)\.env(\.(local|development|dev|production|prod|staging|test))?$", re.I)


def _ext(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    return "." + name.rsplit(".", 1)[-1].lower() if "." in name.lstrip(".") else ""


def _name(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def is_test_path(path: str) -> bool:
    return bool(_TEST_RE.search(path))


def is_code_path(path: str) -> bool:
    return _ext(path) in CODE_EXT


def _skipped(path: str) -> bool:
    return any(part in SKIP_DIRS for part in path.split("/")[:-1]) or _name(path) in SKIP_DIRS


def _file_rank(path: str, size: int) -> tuple[int, str]:
    """Return (relevance score, category). Score 0 means not interesting."""
    name = _name(path).lower()
    depth = path.count("/")
    ext = _ext(path)
    if size > 300_000 or name in LOCKFILES or name.endswith((".min.js", ".map")):
        return 0, ""
    if name in MANIFESTS:
        return 100 - depth * 10, "manifest"
    if name in {"dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
        return 82 - depth * 5, "docker"
    if path.startswith(".github/workflows/") or name in {".gitlab-ci.yml", ".travis.yml"}:
        return (80 if re.search(r"test|ci|build|check", name) else 74), "ci"
    if _ENV_EXAMPLE_RE.search(path):
        return 72, "env"
    if ext not in CODE_EXT:
        return 0, ""
    stem = name.rsplit(".", 1)[0]
    lower = path.lower()
    if is_test_path(path):
        return 55 - depth * 2, "test"
    if stem in {"main", "app", "index", "server", "manage", "program", "application", "wsgi", "asgi"}:
        return 90 - depth * 6, "entry"
    if re.search(r"(^|/)(routes?|routers?|controllers?|handlers?|api|views|endpoints|resolvers)(/|\.|$)", lower):
        return 66 - depth * 2, "routes"
    if re.search(r"(^|/)(models?|schemas?|entities|entity|domain|types)(/|\.|$)", lower):
        return 60 - depth * 2, "models"
    if re.search(r"(^|/)(services?|hooks|store|stores|lib|core|utils?)(/|\.|$)", lower):
        return 44 - depth * 2, "logic"
    if lower.startswith(("src/", "app/", "cmd/", "internal/", "pkg/", "lib/")):
        return 35 - depth * 2, "code"
    return 20 - depth * 2, "code"


_CATEGORY_CAP = {"manifest": 3, "docker": 2, "ci": 1, "env": 1, "test": 3, "entry": 2, "routes": 3,
                 "models": 2, "logic": 2, "code": 2}


def pick_key_files(tree: list[dict]) -> list[str]:
    ranked = []
    for item in tree:
        score, cat = _file_rank(item["path"], item.get("size") or 0)
        if score > 0:
            ranked.append((score, item["path"], cat))
    ranked.sort(key=lambda t: (-t[0], t[1]))
    picked, used = [], Counter()
    for _, path, cat in ranked:
        if used[cat] >= _CATEGORY_CAP.get(cat, 2):
            continue
        picked.append(path)
        used[cat] += 1
        if len(picked) >= MAX_KEY_FILES:
            break
    return picked


def _total_commits(headers: dict, sampled: int) -> int:
    link = headers.get("link") or headers.get("Link") or ""
    m = re.search(r'[?&]page=(\d+)>;\s*rel="last"', link)
    return int(m.group(1)) if m else sampled


def gather(owner: str, repo: str, ref: str | None = None) -> dict:
    """Fetch everything needed for the review. About 5 API calls plus up to 13 raw file reads."""
    base = f"{API}/repos/{owner}/{repo}"
    with httpx.Client(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
        meta, _ = _get_json(client, base)
        if not isinstance(meta, dict) or meta.get("private"):
            raise RepoError(404, "Repository not found. Check the link and make sure the repo is public.")
        branch = ref or meta.get("default_branch") or "main"
        try:
            tree_json, _ = _get_json(client, f"{base}/git/trees/{branch}", {"recursive": "1"})
        except RepoError as e:
            if e.status == 404 and ref and "/" in ref:  # /tree/<branch>/<subpath>
                branch = ref.split("/", 1)[0]
                tree_json, _ = _get_json(client, f"{base}/git/trees/{branch}", {"recursive": "1"})
            elif e.status == 404 and ref:
                raise RepoError(404, f"Branch '{ref}' was not found in {owner}/{repo}") from e
            else:
                raise
        languages, _ = _get_json(client, f"{base}/languages")
        commits_json, commit_headers = _get_json(client, f"{base}/commits", {"sha": branch, "per_page": 50})

        raw_tree = tree_json.get("tree", []) if isinstance(tree_json, dict) else []
        tree = []
        for t in raw_tree:
            if t.get("type") != "blob" or _skipped(t.get("path", "")):
                continue
            tree.append({"path": t["path"], "size": int(t.get("size") or 0)})
            if len(tree) >= TREE_CAP:
                break
        truncated = bool(tree_json.get("truncated")) or len(tree) >= TREE_CAP

        commits = []
        for c in commits_json if isinstance(commits_json, list) else []:
            info = c.get("commit") or {}
            author = info.get("author") or {}
            commits.append({
                "sha": (c.get("sha") or "")[:7],
                "message": (info.get("message") or "").strip()[:500],
                "date": author.get("date"),
                "author": (c.get("author") or {}).get("login") or author.get("name") or "unknown",
            })
        total_commits = len(commits)
        if len(commits) >= 50:
            _, h = _get_json(client, f"{base}/commits", {"sha": branch, "per_page": 1})
            total_commits = _total_commits(h, len(commits))

        raw_base = f"{RAW}/{owner}/{repo}/{branch}"
        readme_path = next((t["path"] for t in tree if "/" not in t["path"]
                            and t["path"].lower().startswith("readme")), None)
        readme = (_get_raw(client, f"{raw_base}/{readme_path}") or "") if readme_path else ""

        files: dict[str, str] = {}
        total = 0
        for path in pick_key_files(tree):
            if total >= TOTAL_CAP:
                break
            text = _get_raw(client, f"{raw_base}/{path}")
            if text is None:
                continue
            chunk = text[:min(FILE_CAP, TOTAL_CAP - total)]
            if len(text) > len(chunk):
                chunk += f"\n... [truncated, {len(text)} chars total]"
            files[path] = chunk
            total += len(chunk)

    lic = meta.get("license") or {}
    return {
        "repo": {
            "owner": owner, "name": repo, "full_name": meta.get("full_name") or f"{owner}/{repo}",
            "html_url": meta.get("html_url") or f"https://github.com/{owner}/{repo}",
            "description": meta.get("description"), "default_branch": meta.get("default_branch"),
            "branch": branch, "stars": meta.get("stargazers_count", 0), "forks": meta.get("forks_count", 0),
            "open_issues": meta.get("open_issues_count", 0), "size_kb": meta.get("size", 0),
            "created_at": meta.get("created_at"), "pushed_at": meta.get("pushed_at"),
            "license": lic.get("spdx_id") or lic.get("name"), "topics": meta.get("topics") or [],
            "fork": bool(meta.get("fork")), "archived": bool(meta.get("archived")),
            "languages": languages if isinstance(languages, dict) else {},
        },
        "tree": tree,
        "tree_truncated": truncated,
        "readme_path": readme_path,
        "readme": readme,
        "commits": commits,
        "total_commits": total_commits,
        "files": files,
    }


# ---------------------------------------------------------------------------
# Deterministic signals
# ---------------------------------------------------------------------------

SECRET_PATTERNS = [
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("Private key", re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY")),
    ("Stripe live key", re.compile(r"\b[sr]k_live_[0-9A-Za-z]{20,}")),
    ("OpenAI-style API key", re.compile(r"\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("Slack token", re.compile(r"\bxox[abprs]-[0-9A-Za-z-]{10,}")),
]

LOW_QUALITY = {"update", "updates", "updated", "fix", "fixes", "fixed", "wip", "asdf", "changes", "change",
               "commit", "stuff", "minor", "misc", "test", "tmp", "temp", "save", "done", "final", "more",
               "edit", "edits", "work", "code", "push", "aaa", "asd", "qwe", "x", ".", "-", "..."}
_GITHUB_DEFAULT_RE = re.compile(r"^(add files via upload|update [\w./-]+\.\w+|create [\w./-]+\.\w+|"
                                r"delete [\w./-]+\.\w+)$", re.I)

README_SECTIONS = {
    "setup": re.compile(r"install|setup|set up|getting started|prerequisite|requirement|configuration", re.I),
    "run": re.compile(r"\brun|usage|start|quick ?start|how to use|development|local", re.I),
    "tests": re.compile(r"test", re.I),
    "decisions": re.compile(r"decision|trade-?off|architecture|design|approach|assumption|limitation|"
                            r"known issue|future|improvement|why", re.I),
}
_RUN_CMD_RE = re.compile(r"(npm|pnpm|yarn|bun) (run )?(dev|start)|uvicorn|flask run|go run|python [\w/]+\.py|"
                         r"docker compose up|docker-compose up|mvn spring-boot:run|cargo run|rails s", re.I)
_TEST_CMD_RE = re.compile(r"(npm|pnpm|yarn|bun) (run )?test|pytest|go test|mvn test|gradle test|cargo test|"
                          r"vitest|jest|rspec", re.I)


def scan_secrets(files: dict[str, str]) -> list[dict]:
    """Return [{file, type}] for obvious secrets. Never returns the matched value."""
    found, seen = [], set()
    for path, text in files.items():
        if _ENV_EXAMPLE_RE.search(path):
            continue
        for label, rx in SECRET_PATTERNS:
            if rx.search(text) and (path, label) not in seen:
                seen.add((path, label))
                found.append({"file": path, "type": label})
    return found


def redact(text: str) -> str:
    for _, rx in SECRET_PATTERNS:
        text = rx.sub("[REDACTED]", text)
    return text


def is_low_quality(message: str) -> bool:
    first = (message.splitlines() or [""])[0].strip()
    norm = re.sub(r"[^a-z0-9 ]", "", first.lower()).strip()
    return (norm in LOW_QUALITY or len(first) < 6 or bool(_GITHUB_DEFAULT_RE.match(first))
            or bool(re.fullmatch(r"(wip|fix|update|asdf)\W*\d*", norm)))


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def readme_signals(readme: str) -> dict:
    prose = re.sub(r"```.*?(```|$)", "", readme, flags=re.S)  # '#' lines inside code blocks aren't headings
    headings = [re.sub(r"^#+\s*", "", ln).strip() for ln in prose.splitlines() if re.match(r"^#{1,6}\s+\S", ln)]
    heading_text = "\n".join(headings)
    sections = {k: bool(rx.search(heading_text)) for k, rx in README_SECTIONS.items()}
    if not sections["run"] and _RUN_CMD_RE.search(readme):
        sections["run"] = True
    if not sections["tests"] and _TEST_CMD_RE.search(readme):
        sections["tests"] = True
    return {"exists": bool(readme.strip()), "length": len(readme), "words": len(readme.split()),
            "headings": headings[:30], "sections": sections,
            "missing_sections": [k for k, v in sections.items() if not v]}


def commit_signals(commits: list[dict], total: int, code_files: int) -> dict:
    msgs = [c["message"] for c in commits]
    firsts = [(m.splitlines() or [""])[0] for m in msgs]
    low = [f for f in firsts if is_low_quality(f)]
    dates = sorted(d for d in (_parse_dt(c.get("date")) for c in commits) if d)
    span_hours = round((dates[-1] - dates[0]).total_seconds() / 3600, 1) if len(dates) > 1 else 0.0
    per_day = Counter(d.date().isoformat() for d in dates)
    if total <= 1:
        dump, reason = True, "The whole project arrived in a single commit."
    elif total <= 3 and span_hours < 1 and code_files >= 10:
        dump, reason = True, f"{total} commits within one hour for {code_files} code files."
    else:
        dump, reason = False, ""
    if span_hours < 1:
        spread = "single sitting"
    elif span_hours < 24:
        spread = "same day"
    else:
        spread = f"over {len(per_day)} active days"
    return {
        "count": total,
        "sampled": len(commits),
        "authors": len({c["author"] for c in commits}),
        "avg_message_length": round(sum(len(f) for f in firsts) / len(firsts), 1) if firsts else 0,
        "low_quality_share": round(len(low) / len(firsts), 2) if firsts else 0,
        "low_quality_examples": list(dict.fromkeys(low))[:5],
        "good_examples": [f for f in sorted(set(firsts) - set(low), key=len, reverse=True)][:3],
        "single_commit_dump": dump,
        "dump_reason": reason,
        "span_hours": span_hours,
        "active_days": len(per_day),
        "spread": spread,
        "first_at": dates[0].isoformat() if dates else None,
        "last_at": dates[-1].isoformat() if dates else None,
        "per_day": [{"date": d, "count": n} for d, n in sorted(per_day.items())],
    }


def compute_signals(data: dict) -> dict:
    tree = data["tree"]
    paths = [t["path"] for t in tree]
    code = [p for p in paths if is_code_path(p)]
    tests = [p for p in code if is_test_path(p)]
    ci = [p for p in paths if p.startswith(".github/workflows/") and _ext(p) in {".yml", ".yaml"}]
    names = {_name(p).lower() for p in paths}
    env_files = [p for p in paths if _ENV_FILE_RE.search(p)]
    secrets = [{"file": p, "type": ".env file committed"} for p in env_files]
    secrets += scan_secrets({**data["files"], **({data["readme_path"]: data["readme"]} if data["readme_path"] else {})})
    lockfiles = [p for p in paths if _name(p).lower() in LOCKFILES]
    return {
        "file_count": len(paths),
        "code_file_count": len(code),
        "tree_truncated": data.get("tree_truncated", False),
        "tests": {"has": bool(tests), "files": len(tests),
                  "ratio": round(len(tests) / max(1, len(code) - len(tests)), 2), "sample": tests[:8]},
        "ci": {"has": bool(ci), "files": ci[:5]},
        "docker": any(n in names for n in ("dockerfile", "docker-compose.yml", "docker-compose.yaml",
                                           "compose.yml", "compose.yaml")),
        "env_example": any(_ENV_EXAMPLE_RE.search(p) for p in paths),
        "secrets": secrets,
        "lockfile": {"has": bool(lockfiles), "files": lockfiles[:4]},
        "readme": readme_signals(data.get("readme") or ""),
        "commits": commit_signals(data["commits"], data.get("total_commits") or len(data["commits"]), len(code)),
        "largest_files": [{"path": t["path"], "size": t["size"]}
                          for t in sorted(tree, key=lambda t: -t["size"])[:5]],
        "languages": data["repo"].get("languages") or {},
        "key_files": list(data["files"].keys()),
    }


# ---------------------------------------------------------------------------
# Review
# ---------------------------------------------------------------------------

def _verdict(score: int) -> str:
    if score >= 80:
        return "hire"
    if score >= 65:
        return "lean hire"
    if score >= 45:
        return "lean no"
    return "no"


_STOP = {"the", "and", "with", "for", "from", "that", "this", "each", "every", "plus", "least", "one", "into",
         "using", "use", "via", "are", "is", "be", "a", "an", "of", "to", "in", "on", "or", "as", "by", "at", "it",
         "its", "all", "any", "must", "should", "can", "your", "their", "them", "so", "not"}


def _requirement_evidence(req: str, paths: list[str], files: dict[str, str]) -> list[str]:
    words = [w for w in re.findall(r"[a-z][a-z0-9-]{3,}", req.lower()) if w not in _STOP]
    hits = []
    for p in paths:
        lp = p.lower()
        content = files.get(p, "").lower()
        score = sum(1 for w in words if w in lp) * 2 + sum(1 for w in words if w in content)
        if score >= 2:
            hits.append((score, p))
    hits.sort(key=lambda t: (-t[0], t[1]))
    return [p for _, p in hits[:3]]


def fallback_review(project: dict, signals: dict, data: dict) -> dict:
    """Signals-only review used when the AI is unavailable. Deterministic."""
    t, rd, cm = signals["tests"], signals["readme"], signals["commits"]
    secrets = signals["secrets"]
    paths = [x["path"] for x in data["tree"]]

    test_score = 0 if not t["has"] else min(10, 4 + round(t["ratio"] * 12) + (2 if signals["ci"]["has"] else 0))
    readme_score = 0 if not rd["exists"] else min(10, 2 + 2 * (4 - len(rd["missing_sections"]))
                                                  + (1 if rd["words"] > 300 else 0))
    hygiene = max(0, 10 - round(cm["low_quality_share"] * 8) - (5 if cm["single_commit_dump"] else 0)
                  - (2 if cm["count"] < 5 else 0))
    structure = min(10, 3 + (2 if signals["code_file_count"] >= 5 else 0) + (1 if signals["lockfile"]["has"] else 0)
                    + (1 if signals["docker"] else 0) + (1 if signals["env_example"] else 0)
                    + (2 if signals["ci"]["has"] else 0)) - (4 if secrets else 0)
    structure = max(0, structure)
    base = round((test_score + readme_score + hygiene + structure) / 4)

    requirements = []
    for req in project.get("requirements", []):
        ev = _requirement_evidence(req, paths, data["files"])
        requirements.append({"requirement": req, "status": "partial" if ev else "missing",
                             "evidence": ev, "note": "Offline check: matched by file names and keywords only."
                             if ev else "No file or code matched this requirement."})

    def crit_score(name: str) -> int:
        n = name.lower()
        if "test" in n:
            return test_score
        if any(k in n for k in ("doc", "readme", "communication", "commit", "git")):
            return round((readme_score + hygiene) / 2)
        if any(k in n for k in ("quality", "architecture", "structure", "design", "maintain")):
            return structure
        if any(k in n for k in ("security", "secur")):
            return 2 if secrets else 6
        return base

    rubric = [{"criterion": c["criterion"], "score": crit_score(c["criterion"]),
               "comment": "Estimated from repository signals; the AI reviewer was offline."}
              for c in project.get("rubric", [])]
    weight_total = sum(c.get("weight", 0) for c in project.get("rubric", [])) or 1
    overall = round(sum(r["score"] * c.get("weight", 0) for r, c in zip(rubric, project.get("rubric", [])))
                    * 10 / weight_total) if rubric else base * 10
    met_share = sum(1 for r in requirements if r["status"] != "missing") / max(1, len(requirements))
    overall = round(overall * (0.6 + 0.4 * met_share))
    if secrets:
        overall = min(overall, 35)
    if cm["single_commit_dump"]:
        overall = min(overall, 55)
    overall = max(0, min(75, overall))  # without reading the code, never claim more than "lean hire"

    red_flags, strengths, fixes = [], [], []
    for s in secrets:
        red_flags.append(f"Possible secret committed: {s['type']} in {s['file']}")
    if secrets:
        fixes.append({"priority": "high", "fix": "Remove committed secrets, rotate the keys, add the files to "
                      ".gitignore and ship a .env.example instead."})
    if cm["single_commit_dump"]:
        red_flags.append(cm["dump_reason"] + " Reviewers can't see how you worked.")
        fixes.append({"priority": "high", "fix": "Next time commit in small, described steps as you build."})
    if not t["has"]:
        red_flags.append("No automated tests found.")
        fixes.append({"priority": "high", "fix": "Add unit tests for the core logic and one integration test "
                      "for the main flow, and document the test command."})
    elif t["ratio"] < 0.15:
        fixes.append({"priority": "medium", "fix": "Test coverage looks thin; cover edge cases and error paths."})
    else:
        strengths.append(f"{t['files']} test files alongside the code.")
    if not rd["exists"]:
        red_flags.append("No README.")
    if rd["missing_sections"]:
        fixes.append({"priority": "medium", "fix": "README is missing: " + ", ".join(rd["missing_sections"]) + "."})
    elif rd["exists"]:
        strengths.append("README covers setup, running, tests and decisions.")
    if cm["low_quality_share"] > 0.3:
        fixes.append({"priority": "low", "fix": "Write commit messages that say what changed and why."})
    elif cm["count"] >= 8 and not cm["single_commit_dump"]:
        strengths.append(f"{cm['count']} commits spread {cm['spread']} with readable messages.")
    if signals["ci"]["has"]:
        strengths.append("CI workflow runs on GitHub Actions.")
    if signals["docker"]:
        strengths.append("Dockerfile makes the project easy to run.")
    if signals["env_example"]:
        strengths.append("Ships a .env.example for configuration.")
    if not signals["lockfile"]["has"] and signals["code_file_count"]:
        fixes.append({"priority": "low", "fix": "Commit a lockfile so installs are reproducible."})
    missing = [r["requirement"] for r in requirements if r["status"] == "missing"]
    if missing:
        fixes.insert(0, {"priority": "high", "fix": f"Cover the {len(missing)} requirement(s) with no visible "
                         "implementation, starting with: " + missing[0]})

    questions = [
        "Walk me through the architecture. Which part would break first under 10x load?",
        "What did you deliberately leave out, and how would you add it with another day?",
    ]
    if t["has"]:
        questions.append("Which test gives you the most confidence, and what is still untested?")
    else:
        questions.append("You shipped without tests. How did you verify it works, and what would you test first?")
    if cm["single_commit_dump"]:
        questions.append("Everything landed in one commit. How did you actually build this, step by step?")
    if signals["key_files"]:
        questions.append(f"Explain the responsibility of {signals['key_files'][0]} and why it lives there.")

    verdict = _verdict(overall)
    return {
        "overall_score": overall,
        "verdict": verdict,
        "rationale": "Signals-only estimate: the AI reviewer was offline, so code was not read in depth.",
        "summary": f"Automated checks found {t['files']} test files, {cm['count']} commits ({cm['spread']}), "
                   f"and {len(secrets)} secret warning(s). Treat this as a checklist, not a final grade.",
        "rubric": rubric,
        "structure": [f"{signals['file_count']} files, {signals['code_file_count']} source files."]
                     + ([f"Key files: {', '.join(signals['key_files'][:5])}."] if signals["key_files"] else []),
        "tests": {"comment": f"{t['files']} test files found." if t["has"] else "No tests found.",
                  "coverage_guess": "none" if not t["has"] else ("low" if t["ratio"] < 0.2 else
                                                                 "moderate" if t["ratio"] < 0.5 else "good")},
        "readme": {"comment": f"README has {rd['words']} words." if rd["exists"] else "No README found.",
                   "missing_sections": rd["missing_sections"]},
        "commits": {"comment": f"{cm['count']} commits, {round(cm['low_quality_share'] * 100)}% low-quality "
                               f"messages, made {cm['spread']}.",
                    "examples": {"good": cm["good_examples"], "bad": cm["low_quality_examples"]}},
        "requirements": requirements,
        "red_flags": red_flags,
        "strengths": strengths,
        "top_fixes": fixes[:6],
        "interviewer_questions": questions[:5],
    }


def _as_list(v: Any) -> list:
    return v if isinstance(v, list) else ([] if v in (None, "") else [v])


def _clamp(v: Any, lo: int, hi: int, default: int) -> int:
    try:
        return max(lo, min(hi, round(float(v))))
    except (TypeError, ValueError):
        return default


def normalise(review: dict, fallback: dict, signals: dict) -> dict:
    """Coerce an AI answer into the expected shape and keep the deterministic facts authoritative."""
    out = dict(fallback)
    out["overall_score"] = _clamp(review.get("overall_score"), 0, 100, fallback["overall_score"])
    v = str(review.get("verdict") or "").strip().lower().replace("_", " ").replace("-", " ")
    out["verdict"] = v if v in VERDICTS else _verdict(out["overall_score"])
    for key in ("rationale", "summary"):
        if isinstance(review.get(key), str) and review[key].strip():
            out[key] = review[key].strip()

    by_name = {str(r.get("criterion", "")).lower(): r for r in _as_list(review.get("rubric")) if isinstance(r, dict)}
    out["rubric"] = [{"criterion": fb["criterion"],
                      "score": _clamp(by_name.get(fb["criterion"].lower(), {}).get("score"), 0, 10, fb["score"]),
                      "comment": str(by_name.get(fb["criterion"].lower(), {}).get("comment") or fb["comment"])}
                     for fb in fallback["rubric"]]

    out["structure"] = [str(s) for s in _as_list(review.get("structure"))] or fallback["structure"]
    for key, sub in (("tests", "coverage_guess"), ("readme", "missing_sections"), ("commits", "examples")):
        val = review.get(key)
        if isinstance(val, dict):
            out[key] = {**fallback[key], **{k: val[k] for k in ("comment", sub) if k in val}}
        elif isinstance(val, str):
            out[key] = {**fallback[key], "comment": val}
    out["readme"]["missing_sections"] = [str(s) for s in _as_list(out["readme"].get("missing_sections"))]
    ex = out["commits"].get("examples")
    if not isinstance(ex, dict):
        ex = {}
    out["commits"]["examples"] = {"good": [str(x) for x in _as_list(ex.get("good"))][:4],
                                  "bad": [str(x) for x in _as_list(ex.get("bad"))][:4]}

    by_req = {}
    for r in _as_list(review.get("requirements")):
        if isinstance(r, dict):
            by_req[str(r.get("requirement", "")).strip().lower()] = r
    reqs = []
    for i, fb in enumerate(fallback["requirements"]):
        r = by_req.get(fb["requirement"].lower())
        if r is None:
            ai_list = [x for x in _as_list(review.get("requirements")) if isinstance(x, dict)]
            r = ai_list[i] if i < len(ai_list) else {}
        status = str(r.get("status") or "").lower()
        reqs.append({"requirement": fb["requirement"],
                     "status": status if status in ("met", "partial", "missing") else fb["status"],
                     "evidence": [str(e) for e in _as_list(r.get("evidence"))][:4] if r else fb["evidence"],
                     "note": str(r.get("note") or r.get("comment") or "") if r else fb["note"]})
    out["requirements"] = reqs

    for key in ("red_flags", "strengths", "interviewer_questions"):
        items = [str(x) for x in _as_list(review.get(key)) if str(x).strip()]
        out[key] = items or fallback[key]
    out["interviewer_questions"] = out["interviewer_questions"][:5]
    fixes = []
    for f in _as_list(review.get("top_fixes")):
        if isinstance(f, dict) and f.get("fix"):
            p = str(f.get("priority") or "medium").lower()
            fixes.append({"priority": p if p in ("high", "medium", "low") else "medium", "fix": str(f["fix"])})
        elif isinstance(f, str) and f.strip():
            fixes.append({"priority": "medium", "fix": f})
    out["top_fixes"] = fixes[:8] or fallback["top_fixes"]

    # Deterministic facts win: committed secrets are always a red flag and cap the score.
    if signals["secrets"]:
        for s in signals["secrets"]:
            line = f"Possible secret committed: {s['type']} in {s['file']}"
            if not any(s["file"] in rf for rf in out["red_flags"]):
                out["red_flags"].insert(0, line)
        out["overall_score"] = min(out["overall_score"], 45)
        if out["verdict"] in ("hire", "lean hire"):
            out["verdict"] = "lean no"
    out["red_flags"] = [redact(x) for x in out["red_flags"]]
    return out


def _prompt(project: dict, signals: dict, data: dict, notes: str) -> list[dict]:
    rubric = "\n".join(f"- {c['criterion']} ({c.get('weight', 0)}%): {c.get('description', '')}"
                       for c in project.get("rubric", []))
    reqs = "\n".join(f"- {r}" for r in project.get("requirements", []))
    stretch = "\n".join(f"- {r}" for r in project.get("stretch", []))
    tree_list = "\n".join(t["path"] for t in data["tree"][:250])
    commits = "\n".join(f"{c['date'] or ''} {c['author']}: {(c['message'].splitlines() or [''])[0][:120]}"
                        for c in data["commits"][:50])
    files = "\n\n".join(f"===== {p} =====\n{redact(txt)}" for p, txt in data["files"].items())
    compact = {k: v for k, v in signals.items() if k not in ("largest_files",)}
    compact["commits"] = {k: v for k, v in signals["commits"].items() if k != "per_day"}
    criteria = ", ".join(json.dumps(c["criterion"]) for c in project.get("rubric", []))
    return [
        {"role": "system", "content": "You are a demanding hiring manager at a top remote talent network "
                                      "(Toptal, Turing level) reviewing a candidate's take-home repository. You "
                                      "read the actual code, judge it against the rubric and reject average work. "
                                      "Cite file paths as evidence. Never repeat secret values. Respond only "
                                      "with JSON."},
        {"role": "user", "content": (
            f"PROJECT: {project.get('title')} ({project.get('niche')}, {project.get('level')})\n"
            f"BRIEF:\n{project.get('brief', '')}\n\nREQUIREMENTS:\n{reqs}\n\nSTRETCH GOALS:\n{stretch or '(none)'}\n\n"
            f"DELIVERABLES: {'; '.join(project.get('deliverables', []))}\nSUGGESTED TECH: "
            f"{', '.join(project.get('tech', []))}\n\nRUBRIC:\n{rubric}\n\n"
            f"CANDIDATE NOTES:\n{notes or '(none)'}\n\n"
            f"REPOSITORY: {data['repo']['full_name']} - {data['repo'].get('description') or 'no description'}\n"
            f"DETERMINISTIC SIGNALS (trust these facts):\n{json.dumps(compact, default=str)}\n\n"
            f"FILE TREE ({len(data['tree'])} files, first 250):\n{tree_list}\n\n"
            f"RECENT COMMITS:\n{commits or '(none)'}\n\n"
            f"README:\n{redact((data.get('readme') or '(none)')[:README_CAP])}\n\nKEY FILES:\n{files or '(none)'}\n\n"
            "Return JSON with exactly these keys:\n"
            "overall_score (0-100, weighted by the rubric), verdict (one of 'hire', 'lean hire', 'lean no', 'no'), "
            "rationale (one line), summary (2-3 sentences to the candidate), "
            f"rubric (array of {{criterion, score 0-10, comment}} for exactly these criteria: {criteria}), "
            "structure (array of short comments on layout and architecture), "
            "tests ({comment, coverage_guess: 'none'|'low'|'moderate'|'good'}), "
            "readme ({comment, missing_sections: array}), "
            "commits ({comment, examples: {good: array, bad: array}} using real messages), "
            "requirements (array of {requirement (copied verbatim), status: 'met'|'partial'|'missing', "
            "evidence: array of file paths, note}), red_flags (array), strengths (array), "
            "top_fixes (array of {priority: 'high'|'medium'|'low', fix}), "
            "interviewer_questions (3-5 pointed follow-up questions about THIS code)."
        )},
    ]


def review_repo(project: dict, data: dict, notes: str = "") -> tuple[dict, dict, bool]:
    """Return (review, signals, used_ai)."""
    signals = compute_signals(data)
    fb = fallback_review(project, signals, data)
    raw, used_ai = ai.chat_json(_prompt(project, signals, data, notes), lambda: fb, max_tokens=4000)
    review = normalise(raw, fb, signals) if used_ai else fb
    return review, signals, used_ai
