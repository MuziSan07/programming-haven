from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import ProjectSubmission, User
from ..routers.auth import user_out
from ..services import ai
from ..services.scoring import XP_PROJECT, award

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _submission_out(s: ProjectSubmission) -> dict:
    return {"id": s.id, "repo_url": s.repo_url, "notes": s.notes, "review": s.review,
            "created_at": s.created_at.isoformat()}


@router.get("")
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subs = db.scalars(select(ProjectSubmission).where(ProjectSubmission.user_id == user.id)).all()
    best: dict[str, int] = {}
    for s in subs:
        best[s.project_id] = max(best.get(s.project_id, 0), (s.review or {}).get("overall_score", 0))
    items = q.projects(db)
    return {
        "niches": sorted({p["niche"] for p in items}),
        "levels": q.LEVEL_ORDER,
        "projects": [{k: p.get(k) for k in ("id", "title", "niche", "level", "hours", "summary", "tech", "companies")}
                     | {"best_score": best.get(p["id"])} for p in items],
    }


@router.get("/{pid}")
def get_project(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = q.project(db, pid)
    if not p:
        raise HTTPException(404, "Project not found")
    subs = db.scalars(select(ProjectSubmission).where(ProjectSubmission.user_id == user.id,
                                                      ProjectSubmission.project_id == pid)
                      .order_by(ProjectSubmission.id.desc())).all()
    return {**p, "submissions": [_submission_out(s) for s in subs]}


class SubmitIn(BaseModel):
    repo_url: str = Field(default="", max_length=500)
    notes: str = Field(default="", max_length=10_000)
    code: str = Field(default="", max_length=120_000)


@router.post("/{pid}/submit")
def submit(pid: str, body: SubmitIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = q.project(db, pid)
    if not p:
        raise HTTPException(404, "Project not found")
    if not body.code.strip() and not body.notes.strip():
        raise HTTPException(400, "Paste your key files or describe your solution so it can be reviewed")
    rubric = "\n".join(f"- {c['criterion']} ({c['weight']}%): {c.get('description', '')}" for c in p["rubric"])
    messages = [
        {"role": "system", "content": "You are a senior engineer at a top remote talent network reviewing a "
                                      "candidate's take-home project. Review strictly against the rubric, like a "
                                      "real reviewer who rejects average work. Respond only with JSON."},
        {"role": "user", "content": f"Project: {p['title']} ({p['niche']}, {p['level']})\nBrief: {p['brief']}\n"
                                    f"Requirements:\n- " + "\n- ".join(p["requirements"]) +
                                    f"\n\nRubric:\n{rubric}\n\nRepository: {body.repo_url or 'not provided'}\n"
                                    f"Candidate notes:\n{body.notes or '(none)'}\n\nCode / files:\n"
                                    f"{body.code[:60_000] or '(none)'}\n\n"
                                    "Return JSON: overall_score (0-100, weighted by the rubric), verdict "
                                    "('Hire-level', 'Close', 'Not yet'), summary (3 sentences to the candidate), "
                                    "criteria (array of {criterion, weight, score 0-100, comment}), "
                                    "requirements_met (array of {requirement, met true/false, note}), "
                                    "must_fix (array), nice_to_have (array)."},
    ]

    def fallback():
        return {"overall_score": 0, "verdict": "Not yet", "summary": "AI review is offline, so this submission "
                "was saved without a score. Use the rubric to self-review.",
                "criteria": [{"criterion": c["criterion"], "weight": c["weight"], "score": 0, "comment": ""}
                             for c in p["rubric"]], "requirements_met": [], "must_fix": [], "nice_to_have": []}

    review, used_ai = ai.chat_json(messages, fallback, max_tokens=4000)
    review["ai"] = used_ai
    sub = ProjectSubmission(user_id=user.id, project_id=pid, repo_url=body.repo_url, notes=body.notes,
                            code=body.code, review=review)
    db.add(sub)
    xp = XP_PROJECT if used_ai and review.get("overall_score", 0) >= 70 else 10
    award(user, xp)
    db.commit()
    return {**_submission_out(sub), "xp_gained": xp, "user": user_out(user)}
