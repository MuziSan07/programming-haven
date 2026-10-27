"""Weekly leagues and weekly contests."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..content.proctoring import public_problem
from ..database import get_db
from ..deps import get_current_user
from ..models import Contest, ContestEntry, Submission, User
from ..routers.auth import user_out
from ..services import contests as cs
from ..services import leagues, polyglot, runner
from ..services.gamification import evaluate
from ..services.scoring import award

router = APIRouter(tags=["compete"])

XP_CONTEST_FINISH = 20
XP_CONTEST_POINT = 10


@router.get("/api/leagues/current")
def league(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = leagues.standings(db, user)
    db.commit()  # lazy finalisation of last week may have written outcomes
    return data


def _contest_out(db: Session, c: Contest, user: User, full: bool = False) -> dict:
    entry = db.scalar(select(ContestEntry).where(ContestEntry.contest_id == c.id, ContestEntry.user_id == user.id))
    problems = {p["slug"]: p for p in q.problems(db)}
    data = {"slug": c.slug, "title": c.title, "starts_at": cs._aware(c.starts_at).isoformat(),
            "ends_at": cs._aware(c.ends_at).isoformat(), "duration_minutes": c.duration_minutes,
            "phase": cs.phase(c), "participants": len(cs.standings(db, c)),
            "max_score": sum(p["points"] for p in c.problems),
            "entry": _entry_out(entry) if entry else None}
    # Problems stay hidden until the user starts (or the contest is over)
    if full and (entry or cs.finished(c)):
        data["problems"] = [{"slug": p["slug"], "points": p["points"],
                             "title": problems.get(p["slug"], {}).get("title", p["slug"]),
                             "difficulty": problems.get(p["slug"], {}).get("difficulty", ""),
                             "solved": bool(entry and p["slug"] in entry.solved),
                             "wrong": entry.wrong.get(p["slug"], 0) if entry else 0} for p in c.problems]
    return data


def _entry_out(e: ContestEntry) -> dict:
    return {"started_at": cs._aware(e.started_at).isoformat(), "deadline": cs._aware(e.deadline).isoformat(),
            "active": cs._now() < cs._aware(e.deadline), "score": e.score, "penalty": e.penalty_minutes,
            "solved": e.solved, "wrong": e.wrong}


def _get(db: Session, slug: str) -> Contest:
    c = db.scalar(select(Contest).where(Contest.slug == slug))
    if not c:
        raise HTTPException(404, "Contest not found")
    return c


@router.get("/api/contests")
def list_contests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cs.ensure_weekly(db)
    items = db.scalars(select(Contest).order_by(Contest.starts_at.desc()).limit(12)).all()
    return {"contests": [_contest_out(db, c, user) for c in items]}


@router.get("/api/contests/{slug}")
def get_contest(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get(db, slug)
    data = _contest_out(db, c, user, full=True)
    data["leaderboard"] = cs.standings(db, c)[:100]
    return data


@router.post("/api/contests/{slug}/start")
def start(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get(db, slug)
    if cs.phase(c) != "live":
        raise HTTPException(400, "This contest is not running")
    if db.scalar(select(ContestEntry).where(ContestEntry.contest_id == c.id, ContestEntry.user_id == user.id)):
        raise HTTPException(400, "You already started this contest")
    now = cs._now()
    deadline = min(now + timedelta(minutes=c.duration_minutes), cs._aware(c.ends_at))
    db.add(ContestEntry(contest_id=c.id, user_id=user.id, started_at=now, deadline=deadline))
    award(user, XP_CONTEST_FINISH)
    db.commit()
    return _contest_out(db, c, user, full=True)


def _entry_and_problem(db: Session, slug: str, problem_slug: str, user: User):
    c = _get(db, slug)
    entry = db.scalar(select(ContestEntry).where(ContestEntry.contest_id == c.id, ContestEntry.user_id == user.id))
    if not entry:
        raise HTTPException(400, "Start the contest first")
    if problem_slug not in {p["slug"] for p in c.problems}:
        raise HTTPException(404, "Problem is not part of this contest")
    problem = q.problem(db, problem_slug)
    if not problem:
        raise HTTPException(404, "Problem not found")
    return c, entry, problem


@router.get("/api/contests/{slug}/problems/{problem_slug}")
def contest_problem(slug: str, problem_slug: str, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    _, entry, problem = _entry_and_problem(db, slug, problem_slug, user)
    data = public_problem(problem)
    langs = list(runner.HARNESS_LANGUAGES) + polyglot.supported_languages(problem)
    data["languages"] = [{"id": k, "label": runner.LANGUAGES[k]["label"]} for k in langs if runner.language_available(k)]
    data["starter"] = {**problem["starter"], **polyglot.starters(problem)}
    data["solved"] = problem_slug in entry.solved
    # No editorial or company tags during a contest
    for k in ("companies", "hints", "editorial"):
        data.pop(k, None)
    return data


class ContestCodeIn(BaseModel):
    language: str = Field(pattern="^(python|javascript|go|java|cpp)$")
    code: str = Field(min_length=1, max_length=50_000)


@router.post("/api/contests/{slug}/problems/{problem_slug}/run")
def contest_run(slug: str, problem_slug: str, body: ContestCodeIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    _, _, problem = _entry_and_problem(db, slug, problem_slug, user)
    return runner.run_tests(problem, body.language, body.code, [t for t in problem["tests"] if not t["hidden"]])


@router.post("/api/contests/{slug}/problems/{problem_slug}/submit")
def contest_submit(slug: str, problem_slug: str, body: ContestCodeIn, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    c, entry, problem = _entry_and_problem(db, slug, problem_slug, user)
    if cs._now() > cs._aware(entry.deadline):
        raise HTTPException(400, "Your contest time is over")
    result = runner.run_tests(problem, body.language, body.code, problem["tests"])
    accepted = result["status"] == "Accepted"
    outcome = cs.record_submission(entry, c, problem_slug, accepted)
    db.add(Submission(user_id=user.id, problem_slug=problem_slug, language=body.language, code=body.code,
                      passed=result["passed"], total=result["total"], status=result["status"],
                      runtime_ms=result["time_ms"]))
    xp = XP_CONTEST_POINT * outcome["points"]
    award(user, xp)
    db.commit()
    rank = next((r["rank"] for r in cs.standings(db, c) if r["user"]["id"] == user.id), None)
    return {**result, **outcome, "xp_gained": xp, "rank": rank, "entry": _entry_out(entry),
            "badges": evaluate(db, user), "user": user_out(user)}
