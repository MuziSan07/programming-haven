"""Debugging rounds: run a small multi-file codebase against its test file.

A debug challenge ships buggy source files plus a test file. Python tests live in `tests.py` as
`def test_*()` functions; JavaScript tests live in `tests.js` as `module.exports = { "name": () => {...} }`
(functions may be async). A generic driver discovers and runs every test and reports JSON results.
"""

import json

from . import runner

MARKER = "<<<HAVEN_TESTS>>>"
TEST_FILE = {"python": "tests.py", "javascript": "tests.js"}
RESERVED = {"main.py", "main.js"}

PY_DRIVER = r'''
import importlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
results = []
try:
    mod = importlib.import_module("tests")
except Exception as e:
    print("\n<<<HAVEN_TESTS>>>" + json.dumps({"error": f"{type(e).__name__}: {e}", "results": []}))
    raise SystemExit(0)
names = [n for n in dir(mod) if n.startswith("test_") and callable(getattr(mod, n))]
names.sort(key=lambda n: getattr(getattr(mod, n), "__code__", None).co_firstlineno if hasattr(getattr(mod, n), "__code__") else 0)
for n in names:
    try:
        getattr(mod, n)()
        results.append({"name": n, "passed": True})
    except AssertionError as e:
        results.append({"name": n, "passed": False, "error": str(e) or "assertion failed"})
    except Exception as e:
        results.append({"name": n, "passed": False, "error": f"{type(e).__name__}: {e}"})
print("\n<<<HAVEN_TESTS>>>" + json.dumps({"results": results}))
'''

JS_DRIVER = r'''
(async () => {
  const results = [];
  let tests;
  try {
    tests = require("./tests.js");
  } catch (e) {
    process.stdout.write("\n<<<HAVEN_TESTS>>>" + JSON.stringify({ error: String(e), results: [] }));
    return;
  }
  for (const [name, fn] of Object.entries(tests)) {
    if (typeof fn !== "function") continue;
    try {
      await fn();
      results.push({ name, passed: true });
    } catch (e) {
      results.push({ name, passed: false, error: (e && e.message) || String(e) });
    }
  }
  process.stdout.write("\n<<<HAVEN_TESTS>>>" + JSON.stringify({ results }));
})();
'''


def run_challenge(language: str, files: dict[str, str], test_source: str) -> dict:
    """Run the given source files against the test file. Returns {status, passed, total, results, stdout, stderr}."""
    if language not in TEST_FILE:
        return {"status": "Not Supported", "passed": 0, "total": 0, "results": [], "stdout": "",
                "stderr": f"Debugging rounds support Python and JavaScript, not {language}"}
    bad = [name for name in files if name in RESERVED or "/" in name or "\\" in name or name.startswith(".")]
    if bad:
        return {"status": "Error", "passed": 0, "total": 0, "results": [], "stdout": "",
                "stderr": f"Invalid file name(s): {', '.join(bad)}"}
    extra = {**files, TEST_FILE[language]: test_source}
    driver = PY_DRIVER if language == "python" else JS_DRIVER
    result = runner.execute(language, driver, "", max_output=runner.HARNESS_MAX_OUTPUT, extra_files=extra)
    stdout, _, payload = result.stdout.partition(MARKER)
    base = {"time_ms": round(result.time_ms, 1), "stdout": stdout.strip()[:runner.MAX_OUTPUT]}
    if result.timed_out:
        return {**base, "status": "Time Limit Exceeded", "passed": 0, "total": 0, "results": [], "stderr": ""}
    if not payload:
        return {**base, "status": "Runtime Error", "passed": 0, "total": 0, "results": [],
                "stderr": result.stderr.strip()[-3000:]}
    data = json.loads(payload)
    results = data.get("results", [])
    passed = sum(r["passed"] for r in results)
    status = "Error" if data.get("error") else "All tests pass" if results and passed == len(results) else "Tests failing"
    return {**base, "status": status, "passed": passed, "total": len(results), "results": results,
            "stderr": (data.get("error") or result.stderr.strip())[-3000:]}
