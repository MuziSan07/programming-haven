"""Content integrity and runner behaviour."""

from app.content import validate
from app.content.store import load_seed_files
from app.services.runner import run_tests

SEEDS = load_seed_files()
PROBLEMS = {p["slug"]: p for p in SEEDS["problem"]}
PY = {slug: p["solutions"]["python"] for slug, p in PROBLEMS.items()}


def test_all_seed_content_is_valid():
    # Runs every lesson exercise solution and every problem reference solution
    assert validate.main([]) == 0


def test_wrong_answer_and_errors():
    problem = PROBLEMS["climbing-stairs"]
    assert run_tests(problem, "python", "def climb_stairs(n):\n    return n\n", problem["tests"])["status"] == \
        "Wrong Answer"
    assert run_tests(problem, "python", "def climb_stairs(n)\n    return n\n", problem["tests"])["status"] == \
        "Compile Error"
    assert run_tests(problem, "python", "def climb_stairs(n):\n    while True: pass\n",
                     problem["tests"])["status"] == "Time Limit Exceeded"


def test_hidden_tests_are_masked():
    problem = PROBLEMS["two-sum"]
    result = run_tests(problem, "python", PY["two-sum"], problem["tests"])
    hidden = [c for c in result["cases"] if c["hidden"]]
    assert hidden and all(c["input"] is None and c["expected"] is None for c in hidden)
