"""Validate seed content: structure, references, and that every solution really passes.

    python -m app.content.validate            # all seed files
    python -m app.content.validate --fast     # skip running code
    python -m app.content.validate seed/tracks/python.json   # only items from these files (refs still checked globally)
"""

import json
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ..services import runner
from .store import KINDS, SEED_DIR, load_seed_files, slug_of

LEVELS = {"Basic", "Intermediate", "Advanced", "Expert"}
DIFFICULTIES = {"Easy", "Medium", "Hard", "Expert"}
COMPARES = {"exact", "unordered", "nested_unordered"}
STEP_TYPES = {"concept", "mcq", "fill", "code"}


class Report:
    def __init__(self):
        self.errors: list[str] = []

    def err(self, where: str, msg: str):
        self.errors.append(f"{where}: {msg}")

    def need(self, where: str, item: dict, *fields: str):
        for f in fields:
            if item.get(f) in (None, "", []):
                self.err(where, f"missing '{f}'")


def check_mcq(r: Report, where: str, m: dict):
    r.need(where, m, "question", "options")
    opts = m.get("options") or []
    if len(opts) < 2:
        r.err(where, "mcq needs at least 2 options")
    if not isinstance(m.get("answer"), int) or not 0 <= m["answer"] < len(opts):
        r.err(where, f"answer index {m.get('answer')!r} out of range")
    if len(set(map(str, opts))) != len(opts):
        r.err(where, "duplicate options")


def validate_structure(seeds: dict[str, list[dict]], r: Report, all_problems: list[dict],
                       all_tracks: list[dict] | None = None) -> list[tuple]:
    """Return a list of code checks to run: (where, language, source, expected | problem, tests)."""
    jobs = []
    for kind, items in seeds.items():
        key = "slug" if kind == "problem" else "id"
        dupes = [s for s, n in Counter(slug_of(kind, i) for i in items if key in i).items() if n > 1]
        for d in dupes:
            r.err(kind, f"duplicate id '{d}'")

    tracks = {t["id"]: t for t in seeds["track"] if "id" in t}
    problems = {p["slug"]: p for p in all_problems if "slug" in p}

    for t in seeds["track"]:
        w = f"track {t.get('id')}"
        r.need(w, t, "id", "title", "icon", "color", "description")
        for u in t.get("units", []):
            r.need(f"{w} unit {u.get('id')}", u, "id", "title", "level")
            if u.get("level") not in LEVELS:
                r.err(f"{w} unit {u.get('id')}", f"level must be one of {sorted(LEVELS)}")

    known_tracks = list(tracks.values()) + [t for t in (all_tracks or []) if t.get("id") not in tracks]
    unit_ids = {(t["id"], u["id"]) for t in known_tracks for u in t.get("units", [])}
    for lesson in seeds["lesson"]:
        w = f"lesson {lesson.get('id')}"
        r.need(w, lesson, "id", "track_id", "unit_id", "title", "minutes", "steps")
        if (lesson.get("track_id"), lesson.get("unit_id")) not in unit_ids:
            r.err(w, f"unknown track/unit {lesson.get('track_id')}/{lesson.get('unit_id')}")
        for i, s in enumerate(lesson.get("steps", [])):
            sw = f"{w} step {i}"
            if s.get("type") not in STEP_TYPES:
                r.err(sw, f"type must be one of {sorted(STEP_TYPES)}")
                continue
            if s["type"] == "concept":
                r.need(sw, s, "title", "body")
            elif s["type"] == "mcq":
                check_mcq(r, sw, s)
                r.need(sw, s, "explanation")
            elif s["type"] == "fill":
                r.need(sw, s, "prompt", "code", "answer", "explanation")
                if "____" not in s.get("code", ""):
                    r.err(sw, "fill code must contain ____")
                if not isinstance(s.get("answer"), list):
                    r.err(sw, "fill answer must be a list of accepted strings")
            elif s["type"] == "code":
                r.need(sw, s, "prompt", "starter", "expected_output", "solution", "language")
                if s.get("language") not in runner.LANGUAGES:
                    r.err(sw, f"unsupported language {s.get('language')}")
                elif s.get("solution"):
                    jobs.append(("stdout", sw, s["language"], s["solution"], s.get("expected_output", "")))

    for p in seeds["problem"]:
        w = f"problem {p.get('slug')}"
        r.need(w, p, "slug", "title", "difficulty", "pattern", "description", "examples", "constraints",
               "function", "starter", "complexity", "hints", "tests", "solutions")
        if p.get("difficulty") not in DIFFICULTIES:
            r.err(w, f"difficulty must be one of {sorted(DIFFICULTIES)}")
        if p.get("compare", "exact") not in COMPARES:
            r.err(w, f"compare must be one of {sorted(COMPARES)}")
        if len(p.get("hints", [])) != 3:
            r.err(w, "exactly 3 hints required")
        for lang in runner.HARNESS_LANGUAGES:
            if lang not in p.get("function", {}) or lang not in p.get("starter", {}):
                r.err(w, f"function/starter missing for {lang}")
        tests = p.get("tests", [])
        if sum(not t.get("hidden") for t in tests) < 2 or sum(bool(t.get("hidden")) for t in tests) < 3:
            r.err(w, "need >= 2 visible and >= 3 hidden tests")
        for t in tests:
            if not isinstance(t.get("input"), list) or "output" not in t:
                r.err(w, "each test needs input (list of args) and output")
        if "python" not in p.get("solutions", {}):
            r.err(w, "a python reference solution is required")
        for lang, src in p.get("solutions", {}).items():
            if lang in runner.HARNESS_LANGUAGES:
                jobs.append(("problem", w, lang, src, p))

    for t in seeds["test"]:
        w = f"test {t.get('id')}"
        r.need(w, t, "id", "title", "style", "description", "duration_minutes", "pass_mark", "difficulty")
        if not t.get("mcq") and not t.get("coding"):
            r.err(w, "test needs mcq questions or coding problems")
        for i, m in enumerate(t.get("mcq", [])):
            r.need(f"{w} q{i}", m, "id")
            check_mcq(r, f"{w} q{m.get('id', i)}", m)
        ids = [m.get("id") for m in t.get("mcq", [])]
        if len(ids) != len(set(ids)):
            r.err(w, "duplicate mcq ids")
        for slug in t.get("coding", []):
            if slug not in problems:
                r.err(w, f"unknown coding problem '{slug}'")

    for q in seeds["question"]:
        w = f"question {q.get('id')}"
        r.need(w, q, "id", "topic", "level", "type", "question", "explanation")
        if q.get("level") not in LEVELS:
            r.err(w, f"level must be one of {sorted(LEVELS)}")
        if q.get("type") == "mcq":
            check_mcq(r, w, q)
        elif q.get("type") == "open":
            r.need(w, q, "model_answer")
        else:
            r.err(w, "type must be mcq or open")

    for p in seeds["project"]:
        w = f"project {p.get('id')}"
        r.need(w, p, "id", "title", "niche", "level", "hours", "summary", "brief", "requirements", "rubric",
               "deliverables", "tech")
        if p.get("level") not in LEVELS:
            r.err(w, f"level must be one of {sorted(LEVELS)}")
        weights = sum(c.get("weight", 0) for c in p.get("rubric", []))
        if p.get("rubric") and weights != 100:
            r.err(w, f"rubric weights must sum to 100 (got {weights})")

    for k in seeds["knowledge"]:
        r.need(f"knowledge {k.get('id')}", k, "id", "title", "content")
    for p in seeds["persona"]:
        r.need(f"persona {p.get('id')}", p, "id", "name", "gender", "personality", "appearance")
    return jobs


def run_job(job):
    if job[0] == "stdout":
        _, where, lang, src, expected = job
        res = runner.execute(lang, src)
        if res.timed_out or res.stdout.strip() != str(expected).strip():
            return f"{where}: solution output {res.stdout.strip()[:120]!r} != expected {str(expected)[:120]!r}" \
                   f"{' | ' + res.stderr.strip()[:200] if res.stderr.strip() else ''}"
    else:
        _, where, lang, src, problem = job
        res = runner.run_tests(problem, lang, src, problem["tests"])
        if res["status"] != "Accepted":
            failing = [c for c in res["cases"] if not c["passed"]][:2]
            return f"{where}: {lang} reference got {res['status']} ({res['passed']}/{res['total']}) " \
                   f"{res.get('stderr', '')[:200]} {json.dumps(failing, default=str)[:300]}"
    return None


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    fast = "--fast" in argv
    content_dir = Path(__file__).parent
    only = [Path(a) if Path(a).exists() else content_dir / a for a in argv if not a.startswith("--")]
    seeds = load_seed_files()
    all_problems, all_tracks = seeds["problem"], seeds["track"]
    if only:
        # Check only items from the given files; references still resolve against all content
        seeds = {k: [] for k in KINDS.values()}
        for path in only:
            for key, items in json.loads(path.read_text(encoding="utf-8")).items():
                seeds[KINDS[key]].extend(items)
    r = Report()
    jobs = validate_structure(seeds, r, all_problems, all_tracks)
    if not fast and jobs:
        with ThreadPoolExecutor(max_workers=6) as pool:
            r.errors += [e for e in pool.map(run_job, jobs) if e]
    print("Items:", ", ".join(f"{k}={len(v)}" for k, v in seeds.items() if v))
    print(f"Code checks run: {0 if fast else len(jobs)}")
    if r.errors:
        print(f"\n{len(r.errors)} problem(s):")
        for e in r.errors:
            print(" -", e)
        return 1
    print("All content valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
