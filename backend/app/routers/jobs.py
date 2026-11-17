"""Job board (public), Job Seeker profiles and applications, and admin job management."""

from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Job, JobApplication, SeekerProfile, User
from ..routers.admin import require_admin
from ..routers.career import _extract
from ..services import jobs as js
from ..services import vetting as v

router = APIRouter(tags=["jobs"])


def require_seeker(user: User = Depends(get_current_user)) -> User:
    if user.account_type != "seeker":
        raise HTTPException(403, "Job applications need a Job Seeker account. Sign up as a Job Seeker to apply.")
    return user


def _open_jobs(db: Session):
    today = date.today()
    jobs = db.scalars(select(Job).where(Job.status == "open").order_by(Job.published_at.desc(), Job.id.desc())).all()
    return [j for j in jobs if not j.closes_on or j.closes_on >= today]


# ---------------------------------------------------------------- public board

@router.get("/api/jobs")
def list_jobs(db: Session = Depends(get_db)):
    return {"jobs": [js.job_public(db, j) for j in _open_jobs(db)]}


@router.get("/api/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job or job.status == "draft":
        raise HTTPException(404, "Job not found")
    out = js.job_public(db, job)
    out["accepting"] = job in _open_jobs(db)
    return out


# ---------------------------------------------------------------- seeker profile + resume

class LinksIn(BaseModel):
    github: str = Field(default="", max_length=200)
    linkedin: str = Field(default="", max_length=200)
    portfolio: str = Field(default="", max_length=200)


class ProfileIn(BaseModel):
    headline: str = Field(default="", max_length=160)
    location: str = Field(default="", max_length=120)
    timezone: str = Field(default="", max_length=60)
    primary_role: str = Field(default="", max_length=80)
    years_experience: int | None = Field(default=None, ge=0, le=50)
    skills: list[str] = Field(default_factory=list, max_length=30)
    english_level: str = Field(default="", max_length=20)
    availability: str = Field(default="", max_length=40)
    expected_rate: str = Field(default="", max_length=80)
    summary: str = Field(default="", max_length=3000)
    phone: str = Field(default="", max_length=40)
    links: LinksIn = Field(default_factory=LinksIn)


@router.get("/api/seeker/profile")
def get_profile(user: User = Depends(require_seeker), db: Session = Depends(get_db)):
    return js.profile_out(db.get(SeekerProfile, user.id))


@router.put("/api/seeker/profile")
def save_profile(body: ProfileIn, user: User = Depends(require_seeker), db: Session = Depends(get_db)):
    profile = db.get(SeekerProfile, user.id) or SeekerProfile(user_id=user.id)
    data = body.model_dump()
    data["skills"] = list(dict.fromkeys(s.strip()[:40] for s in data["skills"] if s.strip()))
    for key, value in data.items():
        setattr(profile, key, value.strip() if isinstance(value, str) else value)
    db.add(profile)
    db.commit()
    return js.profile_out(profile)


@router.post("/api/seeker/resume")
async def upload_resume(file: UploadFile = File(...), user: User = Depends(require_seeker),
                        db: Session = Depends(get_db)):
    data = await file.read()
    if len(data) > get_settings().max_resume_mb * 1024 * 1024:
        raise HTTPException(413, f"Keep the resume under {get_settings().max_resume_mb} MB")
    text = _extract(file, data)
    if len(text.strip()) < 100:
        raise HTTPException(400, "We couldn't read enough text from this file. Upload a text-based PDF or DOCX, "
                                 "not a scanned image.")
    return js.profile_out(js.store_resume(db, user, file.filename or "resume.pdf", data, text))


def _resume_response(profile: SeekerProfile | None):
    if not profile or not profile.resume_file or not (js.resumes_dir() / profile.resume_file).exists():
        raise HTTPException(404, "No resume uploaded")
    name = profile.resume_name or profile.resume_file
    media = {".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    return FileResponse(js.resumes_dir() / profile.resume_file, filename=name, content_disposition_type="inline",
                        media_type=media.get(js.Path(profile.resume_file).suffix.lower(), "text/plain"))


@router.get("/api/seeker/resume")
def my_resume(user: User = Depends(require_seeker), db: Session = Depends(get_db)):
    return _resume_response(db.get(SeekerProfile, user.id))


# ---------------------------------------------------------------- applications

class ApplyIn(BaseModel):
    cover_note: str = Field(default="", max_length=3000)


def _own_app(db: Session, app_id: int, user: User) -> JobApplication:
    app = db.get(JobApplication, app_id)
    if not app or app.user_id != user.id:
        raise HTTPException(404, "Application not found")
    return app


def _synced(db: Session, app: JobApplication) -> JobApplication:
    if js.advance(db, app):
        db.commit()
    return app


@router.post("/api/jobs/{job_id}/apply")
def apply(job_id: int, body: ApplyIn, user: User = Depends(require_seeker), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job or job not in _open_jobs(db):
        raise HTTPException(400, "This job isn't accepting applications")
    if db.scalar(select(JobApplication).where(JobApplication.job_id == job.id, JobApplication.user_id == user.id)):
        raise HTTPException(409, "You've already applied for this job")
    profile = js.profile_out(db.get(SeekerProfile, user.id))
    if not profile["complete"]:
        raise HTTPException(400, f"Complete your profile before applying. Missing: {', '.join(profile['missing'])}.")
    app = JobApplication(job_id=job.id, user_id=user.id, cover_note=body.cover_note.strip(), status="vetting",
                         stages=js.new_stage_state(job))
    db.add(app)
    db.flush()
    db.refresh(app)
    js.advance(db, app)  # an AI resume screen at the start runs straight away
    db.commit()
    return js.application_out(db, app)


@router.get("/api/applications")
def my_applications(user: User = Depends(require_seeker), db: Session = Depends(get_db)):
    apps = js.applications_for(db, user)
    for app in apps:
        js.advance(db, app)
    db.commit()
    return {"applications": [js.application_out(db, a) for a in apps]}


@router.get("/api/applications/{app_id}")
def get_application(app_id: int, user: User = Depends(require_seeker), db: Session = Depends(get_db)):
    return js.application_out(db, _synced(db, _own_app(db, app_id, user)))


@router.post("/api/applications/{app_id}/stages/{index}/begin")
def begin_stage(app_id: int, index: int, user: User = Depends(require_seeker), db: Session = Depends(get_db)):
    app = _own_app(db, app_id, user)
    href = js.begin(db, app, index, user)
    return {**js.application_out(db, app), "href": href}


@router.post("/api/applications/{app_id}/withdraw")
def withdraw(app_id: int, user: User = Depends(require_seeker), db: Session = Depends(get_db)):
    app = _own_app(db, app_id, user)
    if app.status not in ("vetting", "vetted", "shortlisted"):
        raise HTTPException(400, "This application can't be withdrawn now")
    app.status = "withdrawn"
    for st in app.stages:
        if st["status"] in ("ready", "locked", "active"):
            st["status"] = "skipped"
    js.flag_modified(app, "stages")
    db.commit()
    return js.application_out(db, app)


# ---------------------------------------------------------------- admin

class StageIn(BaseModel):
    type: str
    kind: str | None = None
    test: str | None = None
    project: str | None = None
    days: int | None = None
    pass_: int | None = Field(default=None, alias="pass")

    model_config = {"populate_by_name": True}


class JobIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    client_name: str = Field(default="", max_length=160)
    show_client: bool = False
    location: str = Field(default="Remote", max_length=120)
    employment_type: str = "Full-time"
    seniority: str = "Mid-level"
    salary: str = Field(default="", max_length=120)
    skills: list[str] = Field(default_factory=list, max_length=25)
    summary: str = Field(default="", max_length=400)
    description: str = Field(min_length=20, max_length=20000)
    role: str = Field(default="Full Stack Developer", max_length=80)
    language: str = Field(default="python", pattern="^(python|javascript)$")
    stages: list[StageIn] = Field(default_factory=list)
    status: str = "draft"
    openings: int = Field(default=1, ge=1, le=500)
    closes_on: date | None = None


def _apply_job(db: Session, job: Job, body: JobIn) -> None:
    if body.employment_type not in js.EMPLOYMENT_TYPES:
        raise HTTPException(400, "Unknown employment type")
    if body.seniority not in js.SENIORITY:
        raise HTTPException(400, "Unknown seniority")
    if body.status not in js.JOB_STATUSES:
        raise HTTPException(400, "Unknown status")
    stages = js.normalize_stages(db, [{**s.model_dump(exclude={"pass_"}), "pass": s.pass_} for s in body.stages])
    data = body.model_dump(exclude={"stages"})
    data["skills"] = list(dict.fromkeys(s.strip()[:40] for s in data["skills"] if s.strip()))
    for key, value in data.items():
        setattr(job, key, value.strip() if isinstance(value, str) else value)
    job.stages = stages
    if job.status == "open" and not job.published_at:
        job.published_at = v.now()


def _counts(db: Session) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for job_id, status, n in db.execute(select(JobApplication.job_id, JobApplication.status, func.count())
                                        .group_by(JobApplication.job_id, JobApplication.status)):
        out.setdefault(job_id, {"total": 0})
        out[job_id][status] = n
        out[job_id]["total"] += n
    return out


@router.get("/api/admin/jobs")
def admin_jobs(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    counts = _counts(db)
    jobs = db.scalars(select(Job).order_by(Job.id.desc())).all()
    return {"jobs": [js.job_admin(db, j, counts.get(j.id, {"total": 0})) for j in jobs],
            "blocks": js.blocks(db), "default_stages": js.default_stages(),
            "options": {"employment_types": js.EMPLOYMENT_TYPES, "seniority": js.SENIORITY,
                        "statuses": js.JOB_STATUSES, "roles": list(v.ROLE_NICHE)}}


@router.post("/api/admin/jobs")
def create_job(body: JobIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    job = Job(created_by=admin.id)
    _apply_job(db, job, body)
    db.add(job)
    db.commit()
    return js.job_admin(db, job)


@router.put("/api/admin/jobs/{job_id}")
def update_job(job_id: int, body: JobIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    has_apps = db.scalar(select(func.count()).select_from(JobApplication).where(JobApplication.job_id == job.id))
    old_stages = job.stages
    _apply_job(db, job, body)
    if has_apps and job.stages != old_stages:
        job.stages = old_stages
        db.rollback()
        raise HTTPException(400, "Candidates have already applied, so the vetting stages can't change. "
                                 "Close this job and post a new one to use a different pipeline.")
    db.commit()
    return js.job_admin(db, job, _counts(db).get(job.id, {"total": 0}))


@router.delete("/api/admin/jobs/{job_id}")
def delete_job(job_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if db.scalar(select(func.count()).select_from(JobApplication).where(JobApplication.job_id == job.id)):
        raise HTTPException(400, "This job has applications. Close it instead of deleting it.")
    db.delete(job)
    db.commit()
    return {"ok": True}


@router.get("/api/admin/jobs/{job_id}/applications")
def job_applications(job_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    apps = db.scalars(select(JobApplication).where(JobApplication.job_id == job.id)).all()
    changed = False
    for app in apps:
        changed |= js.advance(db, app)
    if changed:
        db.commit()
    apps = sorted(apps, key=lambda a: (js.RANK.get(a.status, 9), -(a.score or 0), a.id))
    return {"job": js.job_admin(db, job, _counts(db).get(job.id, {"total": 0})),
            "applications": [js.application_out(db, a, admin=True) for a in apps]}


class AppPatch(BaseModel):
    status: str | None = None
    admin_note: str | None = Field(default=None, max_length=5000)
    feedback: str | None = Field(default=None, max_length=2000)


@router.get("/api/admin/applications/{app_id}")
def admin_application(app_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    app = db.get(JobApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    return js.application_out(db, _synced(db, app), admin=True)


@router.patch("/api/admin/applications/{app_id}")
def update_application(app_id: int, body: AppPatch, admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    app = db.get(JobApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if body.status is not None:
        if body.status not in js.ADMIN_STATUSES:
            raise HTTPException(400, "Unknown status")
        if app.status in ("vetting", "withdrawn") and body.status != "rejected":
            raise HTTPException(400, "Wait until vetting is complete before moving this candidate forward")
        app.status = body.status
    if body.admin_note is not None:
        app.admin_note = body.admin_note.strip()
    if body.feedback is not None:
        app.feedback = body.feedback.strip()
    db.commit()
    return js.application_out(db, app, admin=True)


@router.get("/api/admin/applications/{app_id}/resume")
def admin_resume(app_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    app = db.get(JobApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    return _resume_response(db.get(SeekerProfile, app.user_id))
