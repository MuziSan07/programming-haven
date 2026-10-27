"""Debugging rounds (fix a small codebase until the tests pass) and code review rounds (review a PR)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import store
from ..database import get_db
from ..deps import get_current_user
from ..models import RoundAttempt, User
from ..routers.auth import user_out
from ..services import ai
from ..services.gamification import evaluate
from ..services.rounds import run_challenge
from ..services.scoring import award

router = APIRouter(prefix="/api/rounds", tags=["rounds"])

XP_ROUND = {"Easy": 25, "Medium": 45, "Hard": 70, "Expert": 100}
SEVERITY_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}
REVIEW_PASS = 70
KIND = {"debug": "debug", "review": "review"}


def _item(db: Session, kind: str, rid: str) -> dict:
    if kind not in KIND:
        raise HTTPException(404, "Unknown round type")
    item = store.get_item(db, KIND[kind], rid)
    if not item:
        raise HTTPException(404, "Round not found")
    return item


def _best(db: Session, user_id: int, kind: str) -> dict[str, RoundAttempt]:
    best: dict[str, RoundAttempt] = {}
    for a in db.scalars(select(RoundAttempt).where(RoundAttempt.user_id == user_id, RoundAttempt.kind == kind,
                                                   RoundAttempt.submitted_at.is_not(None))):
        cur = best.get(a.round_id)
        if cur is None or (a.score or 0) > (cur.score or 0):
            best[a.round_id] = a
    return best


@router.get("")
def list_rounds(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = {}
    for kind in KIND:
        best = _best(db, user.id, kind)
        out[kind] = [{
            "id": it["id"], "title": it["title"], "language": it["language"], "difficulty": it["difficulty"],
            "time_minutes": it.get("time_minutes", 20), "tags": it.get("tags", []),
            "companies": it.get("companies", []),
            "bug_count": it.get("bug_count") if kind == "debug" else None,
            "issue_count": len(it.get("issues", [])) if kind == "review" else None,
            "files": len(it["files"]),
            "status": ("passed" if best[it["id"]].passed else "attempted") if it["id"] in best else "todo",
            "best_score": best[it["id"]].score if it["id"] in best else None,
        } for it in store.all_items(db, KIND[kind])]
    return out


@router.get("/{kind}/{rid}")
def get_round(kind: str, rid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = _item(db, kind, rid)
    hidden = {"solution", "explanation", "issues", "hints"}
    data = {k: v for k, v in item.items() if k not in hidden}
    if kind == "debug":
        data["test_file"] = "tests.py" if item["language"] == "python" else "tests.js"
        data["hint_count"] = len(item.get("hints", []))
    else:
        data["issue_count"] = len(item["issues"])
    best = _best(db, user.id, kind).get(rid)
    data["best"] = {"score": best.score, "passed": best.passed} if best else None
    return data


class DebugIn(BaseModel):
    files: dict[str, str] = Field(max_length=20)


def _check_files(item: dict, files: dict[str, str]) -> dict[str, str]:
    # Only the round's own source files may be edited; the tests stay fixed
    merged = dict(item["files"])
    for name, content in files.items():
        if name not in merged:
            raise HTTPException(400, f"Unknown file: {name}")
        if len(content) > 100_000:
            raise HTTPException(400, "File too large")
        merged[name] = content
    return merged


@router.post("/debug/{rid}/run")
def run_debug(rid: str, body: DebugIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = _item(db, "debug", rid)
    return run_challenge(item["language"], _check_files(item, body.files), item["tests"])


class HintIn(BaseModel):
    level: int = Field(ge=1, le=5)


@router.post("/debug/{rid}/hint")
def hint(rid: str, body: HintIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hints = _item(db, "debug", rid).get("hints", [])
    if body.level > len(hints):
        raise HTTPException(400, "No more hints")
    return {"level": body.level, "hint": hints[body.level - 1], "total": len(hints)}


class SubmitDebugIn(DebugIn):
    started_at: datetime | None = None
    hints_used: int = Field(default=0, ge=0, le=5)


@router.post("/debug/{rid}/submit")
def submit_debug(rid: str, body: SubmitDebugIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = _item(db, "debug", rid)
    files = _check_files(item, body.files)
    result = run_challenge(item["language"], files, item["tests"])
    passed = result["status"] == "All tests pass"
    # Each hint costs 15%; partial credit for partially passing tests
    ratio = result["passed"] / result["total"] if result["total"] else 0
    score = round(max(0.0, ratio * 100 - (15 * body.hints_used if passed else 0)), 1)
    first_pass = passed and rid not in {k for k, a in _best(db, user.id, "debug").items() if a.passed}
    now = datetime.now(timezone.utc)
    db.add(RoundAttempt(user_id=user.id, kind="debug", round_id=rid, started_at=body.started_at or now,
                        submitted_at=now, score=score, passed=passed,
                        submission={"files": body.files, "hints_used": body.hints_used},
                        result={k: result[k] for k in ("status", "passed", "total", "results")}))
    xp = XP_ROUND.get(item["difficulty"], 40) if first_pass else 0
    award(user, xp)
    db.commit()
    reveal = {"explanation": item.get("explanation", ""), "solution": item.get("solution", {})} if passed else {}
    return {**result, "score": score, "passed_round": passed, "xp_gained": xp, **reveal,
            "badges": evaluate(db, user), "user": user_out(user)}


class ReviewComment(BaseModel):
    file: str
    line: int = Field(ge=1)
    body: str = Field(min_length=1, max_length=2000)
    severity: str | None = None


class SubmitReviewIn(BaseModel):
    comments: list[ReviewComment] = Field(max_length=60)
    summary: str = Field(default="", max_length=4000)
    verdict: str = Field(default="request_changes", pattern="^(approve|request_changes|comment)$")
    started_at: datetime | None = None


def _heuristic_grade(issues: list[dict], comments: list[ReviewComment]) -> dict:
    found = []
    for issue in issues:
        match = [i for i, c in enumerate(comments)
                 if c.file == issue["file"] and abs(c.line - issue["line"]) <= 2 and len(c.body.split()) >= 4]
        found.append({"id": issue["id"], "found": bool(match), "quality": 0.6 if match else 0, "comments": match,
                      "feedback": "Comment placed on the right line (AI grading offline, so wording was not checked)."
                      if match else ""})
    return {"issues": found, "summary_feedback": "AI grading is offline; matching was done by line position only.",
            "false_positives": []}


@router.post("/review/{rid}/submit")
def submit_review(rid: str, body: SubmitReviewIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    item = _item(db, "review", rid)
    issues = item["issues"]
    if not body.comments:
        raise HTTPException(400, "Leave at least one review comment")
    numbered = "\n".join(f"[{i}] {c.file}:{c.line}: {c.body}" for i, c in enumerate(body.comments))
    key = "\n".join(f"{x['id']} ({x['severity']} {x['category']}) {x['file']}:{x['line']}: {x['description']}"
                    for x in issues)
    messages = [
        {"role": "system", "content": "You grade code reviews like a principal engineer. A planted issue counts as "
                                      "found only if a comment identifies the actual problem, not just its line. "
                                      "Respond only with JSON."},
        {"role": "user", "content": f"PR: {item['title']}\n\nAnswer key (planted issues):\n{key}\n\n"
                                    f"Candidate comments:\n{numbered}\n\nCandidate summary: {body.summary or '(none)'}\n\n"
                                    "Return JSON: issues (array, one per key issue: id, found (bool), quality (0-1, how "
                                    "well the comment explains impact and fix), comments (array of comment indexes that "
                                    "match), feedback (one sentence)), false_positives (array of {index, reason} for "
                                    "comments that are wrong or nitpicks presented as serious), summary_feedback (2-3 "
                                    "sentences on the review overall)."},
    ]
    graded, _ = ai.chat_json(messages, lambda: _heuristic_grade(issues, body.comments), fast=False)
    by_id = {g.get("id"): g for g in graded.get("issues", []) if isinstance(g, dict)}

    total_weight = sum(SEVERITY_WEIGHT.get(x["severity"], 1) for x in issues)
    earned = 0.0
    breakdown = []
    for x in issues:
        g = by_id.get(x["id"], {})
        found = bool(g.get("found"))
        quality = max(0.0, min(1.0, float(g.get("quality", 0) or 0)))
        weight = SEVERITY_WEIGHT.get(x["severity"], 1)
        earned += weight * (0.6 + 0.4 * quality) if found else 0
        breakdown.append({**x, "found": found, "quality": round(quality, 2), "comments": g.get("comments", []),
                          "feedback": g.get("feedback", "")})
    false_positives = graded.get("false_positives", []) or []
    score = max(0.0, 100 * earned / max(1, total_weight) - 3 * min(len(false_positives), 5))
    # Approving a PR with a critical issue is a classic red flag in real interviews
    critical_missed = any(b["severity"] == "critical" and not b["found"] for b in breakdown)
    if body.verdict == "approve" and any(x["severity"] in ("critical", "high") for x in issues):
        score -= 10
    score = round(max(0.0, min(100.0, score)), 1)
    passed = score >= REVIEW_PASS and not critical_missed
    first_pass = passed and not any(a.passed for k, a in _best(db, user.id, "review").items() if k == rid)
    now = datetime.now(timezone.utc)
    db.add(RoundAttempt(user_id=user.id, kind="review", round_id=rid, started_at=body.started_at or now,
                        submitted_at=now, score=score, passed=passed, submission=body.model_dump(mode="json"),
                        result={"breakdown": breakdown, "false_positives": false_positives}))
    xp = XP_ROUND.get(item["difficulty"], 40) if first_pass else 0
    award(user, xp)
    db.commit()
    return {"score": score, "passed": passed, "critical_missed": critical_missed,
            "found": sum(b["found"] for b in breakdown), "total": len(breakdown), "issues": breakdown,
            "false_positives": false_positives, "summary_feedback": graded.get("summary_feedback", ""),
            "explanation": item.get("explanation", ""), "xp_gained": xp, "badges": evaluate(db, user),
            "user": user_out(user)}
