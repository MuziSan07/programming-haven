import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Hackathon, HackathonEnrollment, HackathonSubmission, Post, User
from ..routers.admin import require_admin
from ..routers.auth import user_out
from ..services import ai, moderation
from ..services.gamification import issue_certificate
from ..services.scoring import award, level_for

router = APIRouter(tags=["hackathons"])

XP_HACKATHON_SUBMIT = 75
XP_HACKATHON_PODIUM = {1: 300, 2: 200, 3: 120}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _phase(h: Hackathon) -> str:
    now = _now()
    if now < _aware(h.starts_at):
        return "upcoming"
    if now <= _aware(h.ends_at):
        return "live"
    return "ended"


def _hack_out(db: Session, h: Hackathon, viewer: User | None = None, full: bool = False) -> dict:
    enrolled = db.scalar(select(func.count()).select_from(HackathonEnrollment).where(
        HackathonEnrollment.hackathon_id == h.id))
    submitted = db.scalar(select(func.count()).select_from(HackathonSubmission).where(
        HackathonSubmission.hackathon_id == h.id))
    data = {
        "id": h.id, "slug": h.slug, "title": h.title, "tagline": h.tagline, "accent": h.accent, "tech": h.tech,
        "tracks": h.tracks, "prizes": h.prizes, "has_prize": bool(h.prizes), "max_team_size": h.max_team_size,
        "starts_at": _aware(h.starts_at).isoformat(), "ends_at": _aware(h.ends_at).isoformat(),
        "phase": _phase(h), "published": h.published, "results_published": h.results_published,
        "enrolled_count": enrolled, "submission_count": submitted,
    }
    if full:
        data.update({"description": h.description, "rules": h.rules, "criteria": h.criteria})
    if viewer is not None:
        enr = db.scalar(select(HackathonEnrollment).where(HackathonEnrollment.hackathon_id == h.id,
                                                          HackathonEnrollment.user_id == viewer.id))
        data["enrollment"] = {"team_name": enr.team_name, "track": enr.track} if enr else None
    return data


def _submission_out(s: HackathonSubmission, show_review: bool) -> dict:
    return {"id": s.id, "title": s.title, "summary": s.summary, "repo_url": s.repo_url, "demo_url": s.demo_url,
            "track": s.track, "score": s.score, "rank": s.rank,
            "author": {"id": s.user.id, "name": s.user.name, "level": level_for(s.user.xp)["level"]},
            "ai_review": s.ai_review if show_review else None,
            "created_at": _aware(s.created_at).isoformat(), "updated_at": _aware(s.updated_at).isoformat()}


def _get(db: Session, slug: str, viewer: User) -> Hackathon:
    h = db.scalar(select(Hackathon).where(Hackathon.slug == slug))
    if not h or (not h.published and not viewer.is_admin):
        raise HTTPException(404, "Hackathon not found")
    return h


# ---------------------------------------------------------------- participant API

@router.get("/api/hackathons")
def list_hackathons(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Hackathon).where(Hackathon.published.is_(True)).order_by(Hackathon.starts_at.desc())).all()
    order = {"live": 0, "upcoming": 1, "ended": 2}
    items = sorted((_hack_out(db, h, user) for h in rows), key=lambda h: (order[h["phase"]], h["starts_at"]))
    return items


@router.get("/api/hackathons/{slug}")
def get_hackathon(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _get(db, slug, user)
    data = _hack_out(db, h, user, full=True)
    mine = db.scalar(select(HackathonSubmission).where(HackathonSubmission.hackathon_id == h.id,
                                                       HackathonSubmission.user_id == user.id))
    data["my_submission"] = _submission_out(mine, show_review=h.results_published) if mine else None
    if h.results_published:
        subs = db.scalars(select(HackathonSubmission).where(HackathonSubmission.hackathon_id == h.id)).all()
        ranked = sorted(subs, key=lambda s: (s.rank is None, s.rank or 0, -(s.score or 0)))
        data["leaderboard"] = [_submission_out(s, show_review=False) for s in ranked]
    elif data["phase"] == "ended":
        data["gallery"] = [_submission_out(s, show_review=False) for s in db.scalars(
            select(HackathonSubmission).where(HackathonSubmission.hackathon_id == h.id)
            .order_by(HackathonSubmission.created_at))]
    data["discussion_count"] = db.scalar(select(func.count()).select_from(Post).where(
        Post.hackathon_id == h.id, Post.status == "published"))
    return data


class EnrollIn(BaseModel):
    team_name: str = Field(default="", max_length=80)
    track: str = Field(default="", max_length=80)


@router.post("/api/hackathons/{slug}/enroll")
def enroll(slug: str, body: EnrollIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _get(db, slug, user)
    if _phase(h) == "ended":
        raise HTTPException(409, "This hackathon has ended")
    if body.track and h.tracks and body.track not in h.tracks:
        raise HTTPException(400, "Unknown track")
    enr = db.scalar(select(HackathonEnrollment).where(HackathonEnrollment.hackathon_id == h.id,
                                                      HackathonEnrollment.user_id == user.id))
    if enr is None:
        enr = HackathonEnrollment(hackathon_id=h.id, user_id=user.id)
        db.add(enr)
    enr.team_name = body.team_name.strip()
    enr.track = body.track
    db.commit()
    return _hack_out(db, h, user, full=True)


@router.delete("/api/hackathons/{slug}/enroll")
def leave(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _get(db, slug, user)
    if db.scalar(select(HackathonSubmission).where(HackathonSubmission.hackathon_id == h.id,
                                                   HackathonSubmission.user_id == user.id)):
        raise HTTPException(409, "You've already submitted a project")
    enr = db.scalar(select(HackathonEnrollment).where(HackathonEnrollment.hackathon_id == h.id,
                                                      HackathonEnrollment.user_id == user.id))
    if enr:
        db.delete(enr)
        db.commit()
    return _hack_out(db, h, user, full=True)


class SubmitIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    summary: str = Field(min_length=30, max_length=8000)
    repo_url: str = Field(min_length=8, max_length=500)
    demo_url: str = Field(default="", max_length=500)
    track: str = Field(default="", max_length=80)


@router.post("/api/hackathons/{slug}/submit")
def submit(slug: str, body: SubmitIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    h = _get(db, slug, user)
    if _phase(h) != "live":
        raise HTTPException(409, "Submissions are only open while the hackathon is live")
    if not db.scalar(select(HackathonEnrollment).where(HackathonEnrollment.hackathon_id == h.id,
                                                       HackathonEnrollment.user_id == user.id)):
        raise HTTPException(403, "Enroll before submitting")
    if not re.match(r"^https?://", body.repo_url):
        raise HTTPException(400, "The repository link must start with http:// or https://")
    verdict = moderation.moderate("submission", f"Hackathon: {h.title}\nProject: {body.title}\n{body.summary}")
    if verdict["verdict"] == moderation.REJECTED:
        raise HTTPException(422, f"Our AI moderator couldn't accept this submission: {verdict['reason']}")
    sub = db.scalar(select(HackathonSubmission).where(HackathonSubmission.hackathon_id == h.id,
                                                      HackathonSubmission.user_id == user.id))
    first = sub is None
    if first:
        sub = HackathonSubmission(hackathon_id=h.id, user_id=user.id)
        db.add(sub)
    sub.title, sub.summary, sub.repo_url, sub.demo_url, sub.track = (
        body.title.strip(), body.summary.strip(), body.repo_url.strip(), body.demo_url.strip(), body.track)
    sub.ai_review, sub.score = None, None  # re-judge after edits
    if first:
        award(user, XP_HACKATHON_SUBMIT)
    db.commit()
    db.refresh(sub)
    return {"submission": _submission_out(sub, show_review=False), "user": user_out(user), "first": first}


# ---------------------------------------------------------------- admin

class HackathonIn(BaseModel):
    slug: str = Field(min_length=3, max_length=120, pattern=r"^[a-z0-9][a-z0-9-]*$")
    title: str = Field(min_length=3, max_length=160)
    tagline: str = Field(default="", max_length=240)
    description: str = Field(default="", max_length=20_000)
    rules: str = Field(default="", max_length=20_000)
    tracks: list[str] = Field(default_factory=list, max_length=12)
    tech: list[str] = Field(default_factory=list, max_length=20)
    criteria: list[dict] = Field(default_factory=list, max_length=10)
    prizes: list[dict] = Field(default_factory=list, max_length=10)
    max_team_size: int = Field(default=1, ge=1, le=10)
    starts_at: datetime
    ends_at: datetime
    accent: str = Field(default="#7c5cff", pattern=r"^#[0-9a-fA-F]{6}$")
    published: bool = False


def _validate(body: HackathonIn):
    if _aware(body.ends_at) <= _aware(body.starts_at):
        raise HTTPException(400, "The end time must be after the start time")
    if body.criteria and sum(int(c.get("weight", 0)) for c in body.criteria) != 100:
        raise HTTPException(400, "Judging criteria weights must sum to 100")
    for c in body.criteria:
        if not c.get("criterion"):
            raise HTTPException(400, "Every judging criterion needs a name")
    for p in body.prizes:
        if not p.get("place") or not p.get("reward"):
            raise HTTPException(400, "Every prize needs a place and a reward")


@router.get("/api/admin/hackathons")
def admin_list(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [_hack_out(db, h, full=True) for h in db.scalars(select(Hackathon).order_by(Hackathon.starts_at.desc()))]


@router.post("/api/admin/hackathons")
def admin_create(body: HackathonIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _validate(body)
    if db.scalar(select(Hackathon).where(Hackathon.slug == body.slug)):
        raise HTTPException(409, "A hackathon with this slug already exists")
    h = Hackathon(**body.model_dump(), created_by=admin.id)
    db.add(h)
    db.commit()
    return _hack_out(db, h, full=True)


@router.put("/api/admin/hackathons/{hid}")
def admin_update(hid: int, body: HackathonIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    h = db.get(Hackathon, hid)
    if not h:
        raise HTTPException(404, "Hackathon not found")
    _validate(body)
    clash = db.scalar(select(Hackathon).where(Hackathon.slug == body.slug, Hackathon.id != hid))
    if clash:
        raise HTTPException(409, "A hackathon with this slug already exists")
    for k, v in body.model_dump().items():
        setattr(h, k, v)
    db.commit()
    return _hack_out(db, h, full=True)


@router.delete("/api/admin/hackathons/{hid}")
def admin_delete(hid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    h = db.get(Hackathon, hid)
    if not h:
        raise HTTPException(404, "Hackathon not found")
    db.delete(h)
    db.commit()
    return {"ok": True}


@router.get("/api/admin/hackathons/{hid}/participants")
def admin_participants(hid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    h = db.get(Hackathon, hid)
    if not h:
        raise HTTPException(404, "Hackathon not found")
    enrollments = db.scalars(select(HackathonEnrollment).where(HackathonEnrollment.hackathon_id == hid)
                             .order_by(HackathonEnrollment.created_at)).all()
    subs = db.scalars(select(HackathonSubmission).where(HackathonSubmission.hackathon_id == hid)).all()
    return {
        "hackathon": _hack_out(db, h, full=True),
        "enrollments": [{"user": {"id": e.user.id, "name": e.user.name, "email": e.user.email},
                         "team_name": e.team_name, "track": e.track, "created_at": _aware(e.created_at).isoformat()}
                        for e in enrollments],
        "submissions": [_submission_out(s, show_review=True) for s in
                        sorted(subs, key=lambda s: (s.rank is None, s.rank or 0, -(s.score or 0)))],
    }


def _judge(h: Hackathon, s: HackathonSubmission) -> dict:
    criteria = h.criteria or [{"criterion": "Overall quality", "weight": 100, "description": ""}]
    rubric = "\n".join(f"- {c['criterion']} ({c['weight']}%): {c.get('description', '')}" for c in criteria)
    messages = [
        {"role": "system", "content": "You are a fair, experienced hackathon judge. Score strictly against the "
                                      "rubric using only the information given. Respond only with JSON."},
        {"role": "user", "content": f"Hackathon: {h.title}\n{h.description[:2500]}\n\nRubric:\n{rubric}\n\n"
                                    f"Submission: {s.title} (track: {s.track or 'n/a'})\nRepo: {s.repo_url}\n"
                                    f"Demo: {s.demo_url or 'n/a'}\nDescription:\n{s.summary[:5000]}\n\n"
                                    "Return JSON: overall_score (0-100, weighted by the rubric), criteria (array of "
                                    "{criterion, score 0-100, comment}), strengths (array), weaknesses (array), "
                                    "summary (2 sentences). Note that the repo itself was not inspected."},
    ]
    review, used_ai = ai.chat_json(messages, lambda: {"overall_score": None, "criteria": [], "strengths": [],
                                                      "weaknesses": [], "summary": "AI judging is offline."},
                                   max_tokens=2500)
    review["ai"] = used_ai
    return review


@router.post("/api/admin/hackathons/{hid}/judge")
def admin_judge(hid: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    h = db.get(Hackathon, hid)
    if not h:
        raise HTTPException(404, "Hackathon not found")
    judged = 0
    for s in db.scalars(select(HackathonSubmission).where(HackathonSubmission.hackathon_id == hid)):
        review = _judge(h, s)
        s.ai_review = review
        if review.get("overall_score") is not None:
            s.score = float(review["overall_score"])
            judged += 1
    db.commit()
    return {"judged": judged}


class ScoreIn(BaseModel):
    score: float | None = Field(default=None, ge=0, le=100)
    rank: int | None = Field(default=None, ge=1, le=1000)


@router.patch("/api/admin/hackathons/submissions/{sid}")
def admin_score(sid: int, body: ScoreIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(HackathonSubmission, sid)
    if not s:
        raise HTTPException(404, "Submission not found")
    s.score, s.rank = body.score, body.rank
    db.commit()
    return _submission_out(s, show_review=True)


@router.post("/api/admin/hackathons/{hid}/results")
def admin_publish_results(hid: int, publish: bool = True, admin: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    h = db.get(Hackathon, hid)
    if not h:
        raise HTTPException(404, "Hackathon not found")
    subs = db.scalars(select(HackathonSubmission).where(HackathonSubmission.hackathon_id == hid)).all()
    if publish:
        # Fill missing ranks from scores, keeping any ranks the admin set by hand
        taken = {s.rank for s in subs if s.rank}
        next_rank = 1
        for s in sorted([s for s in subs if not s.rank], key=lambda s: -(s.score or 0)):
            while next_rank in taken:
                next_rank += 1
            s.rank = next_rank
            taken.add(next_rank)
        if not h.results_published:
            for s in subs:
                if s.rank in XP_HACKATHON_PODIUM:
                    award(s.user, XP_HACKATHON_PODIUM[s.rank])
                    place = {1: "1st", 2: "2nd", 3: "3rd"}[s.rank]
                    issue_certificate(db, s.user, "hackathon", h.slug, f"{h.title}: {place} place", score=s.score,
                                      meta={"rank": s.rank, "project": s.title})
    h.results_published = publish
    db.commit()
    return _hack_out(db, h, full=True)
