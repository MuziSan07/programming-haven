"""Scoring constants for proctored tests and helpers that strip answers before sending content."""

MCQ_POINTS = 1
CODING_POINTS = 3

# Integrity penalties per proctoring event type
VIOLATION_WEIGHTS = {
    "tab_switch": 10,
    "window_blur": 5,
    "fullscreen_exit": 8,
    "paste": 8,
    "copy": 3,
    "no_face": 6,
    "multiple_faces": 15,
    "camera_off": 20,
    "right_click": 2,
}

VIOLATION_LABELS = {
    "tab_switch": "Switched tab or minimised window",
    "window_blur": "Left the test window",
    "fullscreen_exit": "Exited fullscreen",
    "paste": "Pasted content",
    "copy": "Copied content",
    "no_face": "No face detected",
    "multiple_faces": "Multiple people detected",
    "camera_off": "Camera turned off",
    "right_click": "Opened context menu",
}


def public_problem(p: dict) -> dict:
    """Problem as sent to the browser: no hidden tests, hints or reference solutions."""
    data = {k: v for k, v in p.items() if k not in {"tests", "hints", "solutions"}}
    data["sample_tests"] = [x for x in p["tests"] if not x.get("hidden")]
    data["hidden_count"] = sum(bool(x.get("hidden")) for x in p["tests"])
    return data


def public_test(test: dict) -> dict:
    data = {k: v for k, v in test.items() if k != "mcq"}
    data["mcq"] = [{k: v for k, v in m.items() if k not in {"answer", "explanation"}} for m in test.get("mcq", [])]
    data["question_count"] = len(test.get("mcq", [])) + len(test.get("coding", []))
    return data
