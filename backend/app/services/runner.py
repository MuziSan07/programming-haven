"""Code execution and test harness.

Demo-grade sandbox: each run is a fresh subprocess in a temp directory with a wall-clock
timeout, and on Linux (Docker) CPU / memory rlimits. Production should move execution to an
isolate-based sandbox such as Judge0 on separate workers (see docs/ARCHITECTURE.md).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from ..config import get_settings
from . import polyglot

RESULT_MARKER = "<<<HAVEN_RESULT>>>"
MAX_OUTPUT = 20_000
HARNESS_MAX_OUTPUT = 5_000_000

LANGUAGES = {
    "python": {"label": "Python 3", "file": "main.py", "monaco": "python"},
    "javascript": {"label": "JavaScript (Node.js)", "file": "main.js", "monaco": "javascript"},
    "java": {"label": "Java", "file": "Main.java", "monaco": "java"},
    "cpp": {"label": "C++17", "file": "main.cpp", "monaco": "cpp"},
    "go": {"label": "Go", "file": "main.go", "monaco": "go"},
}
# Languages the DSA test harness supports (function-call problems)
HARNESS_LANGUAGES = ("python", "javascript")
COMPILE_TIMEOUT = 60  # first Go build fills its cache
GO_CACHE = Path(__file__).resolve().parents[2] / ".cache" / "go-build"

_TOOLS = {"javascript": ["node"], "java": ["javac", "java"], "cpp": ["g++"], "go": ["go"]}


def language_available(language: str) -> bool:
    return language in LANGUAGES and all(shutil.which(t) for t in _TOOLS.get(language, []))


def available_languages() -> list[str]:
    return [lang for lang in LANGUAGES if language_available(lang)]


@dataclass
class RunResult:
    stdout: str
    stderr: str
    exit_code: int
    time_ms: float
    timed_out: bool


def _compile_command(language: str, paths: list[str], workdir: str) -> list[str] | None:
    if language == "java":
        return [shutil.which("javac"), "-encoding", "UTF-8", *paths]
    if language == "cpp":
        return [shutil.which("g++"), "-O2", "-std=c++17", *[p for p in paths if p.endswith(".cpp")], "-o",
                os.path.join(workdir, "main.exe")]
    if language == "go":
        return [shutil.which("go"), "build", "-o", os.path.join(workdir, "main.exe"), *paths]
    return None


def _command(language: str, path: str, workdir: str) -> list[str]:
    settings = get_settings()
    if language == "python":
        return [sys.executable, "-I", "-X", "utf8", path]
    if language == "javascript":
        return [shutil.which("node"), f"--max-old-space-size={settings.run_memory_mb}", path]
    if language == "java":
        return [shutil.which("java"), f"-Xmx{settings.run_memory_mb}m", "-cp", workdir, "Main"]
    if language in ("cpp", "go"):
        return [os.path.join(workdir, "main.exe")]
    raise ValueError(f"Unsupported language: {language}")


def _limits(language: str):
    if os.name != "posix":
        return None
    import resource

    settings = get_settings()

    def apply():
        cpu = int(settings.run_timeout_seconds) + 1
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
        resource.setrlimit(resource.RLIMIT_FSIZE, (1 << 20, 1 << 20))
        # V8 reserves a large virtual address space, so only cap Python's.
        if language == "python":
            mem = settings.run_memory_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (mem, mem))

    return apply


def _env(workdir: str) -> dict:
    env = {"PATH": os.environ.get("PATH", ""), "PYTHONIOENCODING": "utf-8", "HOME": workdir,
           "TEMP": workdir, "TMP": workdir, "GOCACHE": str(GO_CACHE), "GOPATH": os.path.join(workdir, "gopath"),
           "GOFLAGS": "-mod=mod", "GO111MODULE": "off"}
    if os.name == "nt":
        env["SYSTEMROOT"] = os.environ.get("SYSTEMROOT", "")
        env["LOCALAPPDATA"] = workdir
    return env


def execute(language: str, source: str, stdin: str = "", max_output: int = MAX_OUTPUT,
            extra_files: dict[str, str] | None = None) -> RunResult:
    settings = get_settings()
    if not language_available(language):
        return RunResult("", f"{LANGUAGES.get(language, {}).get('label', language)} is not installed on this server",
                         -1, 0, False)
    with tempfile.TemporaryDirectory(prefix="haven-run-") as workdir:
        path = os.path.join(workdir, LANGUAGES[language]["file"])
        with open(path, "w", encoding="utf-8") as f:
            f.write(source)
        paths = [path]
        for name, content in (extra_files or {}).items():
            extra = os.path.join(workdir, name)
            with open(extra, "w", encoding="utf-8") as f:
                f.write(content)
            paths.append(extra)
        env = _env(workdir)
        compile_cmd = _compile_command(language, paths, workdir)
        if compile_cmd:
            GO_CACHE.mkdir(parents=True, exist_ok=True)
            try:
                comp = subprocess.run(compile_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                      cwd=workdir, env=env, timeout=COMPILE_TIMEOUT)
            except subprocess.TimeoutExpired:
                return RunResult("", "Compilation timed out", -1, 0, True)
            if comp.returncode != 0:
                return RunResult("", (comp.stderr or comp.stdout).replace(workdir, "")[:MAX_OUTPUT], comp.returncode,
                                 0, False)
        start = time.perf_counter()
        try:
            proc = subprocess.run(
                _command(language, path, workdir),
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                cwd=workdir,
                env=env,
                timeout=settings.run_timeout_seconds,
                preexec_fn=_limits(language),
            )
            elapsed = (time.perf_counter() - start) * 1000
            return RunResult(proc.stdout[:max_output], proc.stderr[:MAX_OUTPUT], proc.returncode, elapsed, False)
        except subprocess.TimeoutExpired as exc:
            elapsed = (time.perf_counter() - start) * 1000
            out = exc.stdout.decode(errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            return RunResult(out[:MAX_OUTPUT], "Time limit exceeded", -1, elapsed, True)


# ---------------------------------------------------------------- test harness

def _python_driver(fn: str) -> str:
    return f"""

import json as __json, sys as __sys
__tests = __json.loads(__sys.stdin.read())
__out = []
for __args in __tests:
    try:
        __out.append({{"ok": True, "value": {fn}(*__args)}})
    except Exception as __e:
        __out.append({{"ok": False, "error": f"{{type(__e).__name__}}: {{__e}}"}})
print("\\n{RESULT_MARKER}" + __json.dumps(__out, default=str))
"""


def _js_driver(fn: str) -> str:
    return f"""

;(() => {{
  const __tests = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const __out = [];
  for (const __args of __tests) {{
    try {{
      const __v = {fn}(...__args);
      __out.push({{ ok: true, value: __v === undefined ? null : __v }});
    }} catch (__e) {{
      __out.push({{ ok: false, error: String(__e) }});
    }}
  }}
  process.stdout.write("\\n{RESULT_MARKER}" + JSON.stringify(__out));
}})();
"""


def _normalize(value, compare: str):
    if compare == "unordered" and isinstance(value, list):
        return sorted(value, key=lambda v: json.dumps(v, sort_keys=True))
    if compare == "nested_unordered" and isinstance(value, list):
        inner = [sorted(v, key=str) if isinstance(v, list) else v for v in value]
        return sorted(inner, key=lambda v: json.dumps(v, sort_keys=True))
    return value


def run_tests(problem: dict, language: str, code: str, tests: list[dict]) -> dict:
    """Run `code` against `tests` and return a structured verdict."""
    stdin = json.dumps([t["input"] for t in tests])
    if language in polyglot.TYPED_LANGUAGES:
        built = polyglot.build(language, problem, code)
        if built is None:
            return {"time_ms": 0, "total": len(tests), "status": "Not Supported", "passed": 0, "cases": [], "stdout": "",
                    "stderr": f"{LANGUAGES[language]['label']} isn't available for this problem yet. Use Python or JavaScript."}
        source, extra = built
        result = execute(language, source, stdin, max_output=HARNESS_MAX_OUTPUT, extra_files=extra)
    else:
        fn = problem["function"][language]
        driver = _python_driver(fn) if language == "python" else _js_driver(fn)
        # The result payload can be large; only the learner's own prints are trimmed below
        result = execute(language, code + driver, stdin, max_output=HARNESS_MAX_OUTPUT)

    base = {"time_ms": round(result.time_ms, 1), "total": len(tests)}
    if result.timed_out:
        return {**base, "status": "Time Limit Exceeded", "passed": 0, "cases": [], "stdout": result.stdout[:MAX_OUTPUT], "stderr": ""}

    stdout, _, payload = result.stdout.partition(RESULT_MARKER)
    if not payload:
        status = "Compile Error" if result.exit_code != 0 else "Runtime Error"
        return {**base, "status": status, "passed": 0, "cases": [], "stdout": stdout[:MAX_OUTPUT], "stderr": result.stderr.strip()}

    outputs = json.loads(payload)
    compare = problem.get("compare", "exact")
    cases, passed = [], 0
    for test, out in zip(tests, outputs):
        ok = out["ok"] and _normalize(out["value"], compare) == _normalize(test["output"], compare)
        passed += ok
        cases.append({
            "input": test["input"] if not test.get("hidden") else None,
            "expected": test["output"] if not test.get("hidden") else None,
            "actual": out.get("value") if not test.get("hidden") else None,
            "error": out.get("error"),
            "passed": ok,
            "hidden": bool(test.get("hidden")),
        })
    status = "Accepted" if passed == len(tests) else "Wrong Answer"
    if any(c["error"] for c in cases) and passed < len(tests):
        status = "Runtime Error"
    return {**base, "status": status, "passed": passed, "cases": cases, "stdout": stdout.strip()[:MAX_OUTPUT],
            "stderr": result.stderr.strip()}
