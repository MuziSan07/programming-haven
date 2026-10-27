from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..content.proctoring import (CODING_POINTS, MCQ_POINTS, VIOLATION_LABELS, VIOLATION_WEIGHTS, public_problem,
                                  public_test)
from ..database import get_db
from ..deps import get_current_user
from ..models import TestAttempt, User
from ..routers.auth import user_out
from ..services import runner
from ..services.gamification import cert_out, evaluate, issue_certificate
from ..services.scoring import XP_TEST, award

router = APIRouter(prefix="/api/tests", tags=["tests"])

GRACE = timedelta(seconds=60)


def _test(db: Session, test_id: str) -> dict:
    test = q.test(db, test_id)
    if not test:
        raise HTTPException(404, "Test not found")
    return test


@router.get("")
def list_tests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attempts = db.scalars(select(TestAttempt).where(TestAttempt.user_id == user.id,
                                                    TestAttempt.finished_at.is_not(None))).all()
    out = []
    for test in q.tests(db):
        mine = [a for a in attempts if a.test_id == test["id"]]
        best = max(mine, key=lambda a: a.score or 0, default=None)
        out.append({**{k: test[k] for k in ("id", "title", "style", "description", "duration_minutes", "pass_mark")},
                    "difficulty": test.get("difficulty", "Medium"),
                    "mcq_count": len(test.get("mcq", [])), "coding_count": len(test.get("coding", [])),
                    "attempts": len(mine), "best_score": best.score if best else None,
                    "best_attempt_id": best.id if best else None})
    return out


@router.get("/attempts/history")
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attempts = db.scalars(select(TestAttempt).where(TestAttempt.user_id == user.id)
                          .order_by(TestAttempt.id.desc()).limit(20)).all()
    return [{"id": a.id, "test_id": a.test_id, "title": (q.test(db, a.test_id) or {}).get("title", a.test_id),
             "score": a.score, "integrity_score": a.integrity_score,
             "finished_at": a.finished_at.isoformat() if a.finished_at else None} for a in attempts]


@router.get("/{test_id}")
def get_test(test_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return public_test(_test(db, test_id))


@router.post("/{test_id}/start")
def start(test_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    test = _test(db, test_id)
    attempt = TestAttempt(user_id=user.id, test_id=test_id, violations=[], result={})
    db.add(attempt)
    db.commit()
    data = public_test(test)
    data["problems"] = [public_problem(q.problem(db, s)) for s in test.get("coding", []) if q.problem(db, s)]
    return {"attempt_id": attempt.id, "started_at": attempt.started_at.isoformat(), "test": data}


class CodeAnswer(BaseModel):
    language: str = Field(pattern="^(python|javascript)$")
    code: str = Field(max_length=50_000)


class Violation(BaseModel):
    type: str = Field(max_length=40)
    at: float  # seconds since test start
    detail: str = Field(default="", max_length=200)


class SubmitIn(BaseModel):
    answers: dict[str, int] = Field(default_factory=dict)
    code: dict[str, CodeAnswer] = Field(default_factory=dict)
    violations: list[Violation] = Field(default_factory=list, max_length=500)


def _integrity(violations: list[dict]) -> tuple[float, list[dict]]:
    summary: dict[str, dict] = {}
    for v in violations:
        if v["type"] not in VIOLATION_WEIGHTS:
            continue
        item = summary.setdefault(v["type"], {"type": v["type"], "label": VIOLATION_LABELS[v["type"]],
                                              "count": 0, "penalty": 0})
        item["count"] += 1
        item["penalty"] += VIOLATION_WEIGHTS[v["type"]]
    score = max(0.0, 100.0 - sum(i["penalty"] for i in summary.values()))
    return score, sorted(summary.values(), key=lambda i: -i["penalty"])


@router.post("/attempts/{attempt_id}/submit")
def submit(attempt_id: int, body: SubmitIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attempt = db.get(TestAttempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        raise HTTPException(404, "Attempt not found")
    if attempt.finished_at:
        raise HTTPException(409, "This attempt was already submitted")
    test = _test(db, attempt.test_id)
    now = datetime.now(timezone.utc)
    late = now - _aware(attempt.started_at) > timedelta(minutes=test["duration_minutes"]) + GRACE

    points, max_points = 0.0, 0.0
    mcq_results = []
    for m in test.get("mcq", []):
        chosen = body.answers.get(m["id"])
        correct = chosen == m["answer"]
        points += MCQ_POINTS if correct else 0
        max_points += MCQ_POINTS
        mcq_results.append({"id": m["id"], "question": m["question"], "code": m.get("code"), "chosen": chosen,
                            "answer": m["answer"], "options": m["options"], "correct": correct,
                            "explanation": m.get("explanation", "")})

    coding_results = []
    for slug in test.get("coding", []):
        problem = q.problem(db, slug)
        if not problem:
            continue
        answer = body.code.get(slug)
        max_points += CODING_POINTS
        if not answer or not answer.code.strip() or answer.code.strip() == problem["starter"][answer.language].strip():
            coding_results.append({"slug": slug, "title": problem["title"], "status": "Not attempted", "passed": 0,
                                   "total": len(problem["tests"])})
            continue
        result = runner.run_tests(problem, answer.language, answer.code, problem["tests"])
        points += CODING_POINTS * result["passed"] / result["total"]
        coding_results.append({"slug": slug, "title": problem["title"], "status": result["status"],
                               "passed": result["passed"], "total": result["total"], "language": answer.language})

    score = round(100 * points / max_points, 1) if max_points else 0
    violations = [v.model_dump() for v in body.violations]
    integrity, integrity_summary = _integrity(violations)
    passed = score >= test["pass_mark"] and integrity >= 60 and not late

    attempt.finished_at = now
    attempt.score = score
    attempt.integrity_score = integrity
    attempt.violations = violations
    attempt.result = {"mcq": mcq_results, "coding": coding_results, "integrity": integrity_summary,
                      "passed": passed, "late": late, "pass_mark": test["pass_mark"]}
    xp = XP_TEST if passed else 10
    award(user, xp)
    certificate = None
    if passed and integrity >= 80:
        certificate = issue_certificate(db, user, "test", attempt.test_id, test["title"], score=score,
                                        integrity=integrity, meta={"style": test.get("style", "")})
    db.commit()
    return {**_attempt_out(db, attempt), "xp_gained": xp, "badges": evaluate(db, user),
            "certificate": cert_out(certificate) if certificate else None, "user": user_out(user)}


def _aware(dt: datetime) -> datetime:
    # SQLite drops tzinfo; values are always stored in UTC
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _attempt_out(db: Session, a: TestAttempt) -> dict:
    test = q.test(db, a.test_id) or {"title": a.test_id, "style": ""}
    duration = (_aware(a.finished_at) - _aware(a.started_at)).total_seconds() if a.finished_at else None
    return {"id": a.id, "test_id": a.test_id, "title": test["title"], "style": test["style"], "score": a.score,
            "integrity_score": a.integrity_score, "duration_seconds": duration, **a.result}


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attempt = db.get(TestAttempt, attempt_id)
    if not attempt or attempt.user_id != user.id or not attempt.finished_at:
        raise HTTPException(404, "Attempt not found")
    return _attempt_out(db, attempt)
