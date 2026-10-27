"""Resume, LinkedIn and GitHub review tailored to remote hiring networks."""

import io
import re

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import ProfileReview, User
from ..services import ai
from ..services.coach import TARGETS

router = APIRouter(prefix="/api/career", tags=["career"])

MAX_UPLOAD = 5 * 1024 * 1024
MAX_TEXT = 20_000

KIND_BRIEF = {
    "cv": "resume/CV",
    "linkedin": "LinkedIn profile (headline, about, experience as pasted by the candidate)",
    "github": "public GitHub profile (bio, pinned and recent repositories, languages, activity)",
}
NETWORK_NOTES = (
    "What remote networks look for: Toptal wants measurable impact, seniority and clean English; Turing parses "
    "skills and years per stack; Lemon.io wants 4+ years and product ownership; A.Team wants product builders "
    "with outcomes and team roles; Braintrust wants a complete profile with rates and verified skills. Remote "
    "US/UK/EU recruiters scan for impact numbers, timezone overlap, async communication and ATS keywords."
)


def _extract(upload: UploadFile, data: bytes) -> str:
    name = (upload.filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(data))
            return "\n".join(page.extract_text() or "" for page in reader.pages[:10])
        except Exception as e:  # noqa: BLE001 - broken PDFs are common
            raise HTTPException(400, f"Could not read this PDF ({type(e).__name__})") from e
    if name.endswith(".docx"):
        from docx import Document

        try:
            doc = Document(io.BytesIO(data))
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, "Could not read this Word file") from e
        return "\n".join(p.text for p in doc.paragraphs)
    if name.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="ignore")
    raise HTTPException(400, "Upload a PDF, DOCX or TXT file")


def _github(username: str) -> tuple[str, dict]:
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})", username):
        raise HTTPException(400, "That doesn't look like a GitHub username")
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "programming-haven"}
    try:
        with httpx.Client(timeout=10, headers=headers) as client:
            profile = client.get(f"https://api.github.com/users/{username}")
            if profile.status_code == 404:
                raise HTTPException(404, "GitHub user not found")
            profile.raise_for_status()
            repos = client.get(f"https://api.github.com/users/{username}/repos",
                               params={"per_page": 100, "sort": "pushed"}).json()
    except httpx.HTTPError as e:
        raise HTTPException(502, "GitHub is not reachable right now (rate limit or network)") from e
    p = profile.json()
    own = [r for r in repos if isinstance(r, dict) and not r.get("fork")]
    langs: dict[str, int] = {}
    for r in own:
        if r.get("language"):
            langs[r["language"]] = langs.get(r["language"], 0) + 1
    top = sorted(own, key=lambda r: (-(r.get("stargazers_count") or 0), r.get("pushed_at") or ""))[:12]
    facts = {
        "name": p.get("name"), "bio": p.get("bio"), "company": p.get("company"), "location": p.get("location"),
        "blog": p.get("blog"), "followers": p.get("followers"), "public_repos": p.get("public_repos"),
        "created_at": p.get("created_at"), "avatar_url": p.get("avatar_url"), "html_url": p.get("html_url"),
        "own_repos": len(own), "forks": len(repos) - len(own) if isinstance(repos, list) else 0,
        "languages": dict(sorted(langs.items(), key=lambda kv: -kv[1])[:8]),
        "repos": [{"name": r["name"], "description": r.get("description"), "language": r.get("language"),
                   "stars": r.get("stargazers_count"), "pushed_at": r.get("pushed_at"),
                   "has_homepage": bool(r.get("homepage")), "topics": r.get("topics", [])[:5]} for r in top],
    }
    text = "\n".join([f"{k}: {v}" for k, v in facts.items() if k not in ("repos", "avatar_url")] +
                     [f"- {r['name']} ({r['language']}, {r['stars']} stars, last push {r['pushed_at']}): "
                      f"{r['description'] or 'NO DESCRIPTION'}" for r in facts["repos"]])
    return text, facts


def _fallback(kind: str, text: str) -> dict:
    words = len(text.split())
    numbers = len(re.findall(r"\d+%|\$\d|\d+x|\d{2,}", text))
    score = max(20, min(80, 40 + numbers * 4 + (10 if 250 < words < 900 else 0)))
    return {
        "score": score,
        "verdict": "AI review is offline, so this is a quick automated check only.",
        "sections": [{"name": "Impact", "score": min(100, numbers * 12),
                      "feedback": f"Found {numbers} measurable results. Strong profiles have one per bullet."},
                     {"name": "Length", "score": 80 if 250 < words < 900 else 45,
                      "feedback": f"{words} words. Aim for 400-800 for a resume."}],
        "strengths": [], "fixes": [{"priority": "high", "issue": "Add numbers to every achievement",
                                    "example": "Cut checkout latency 42% (900ms to 520ms) by caching price rules"}],
        "rewrites": [], "keywords_missing": [], "red_flags": [],
    }


def _review(kind: str, target: str, text: str, user: User) -> dict:
    label = TARGETS.get(target, TARGETS["remote"])["label"]
    messages = [
        {"role": "system", "content": "You are a senior technical recruiter who screens engineers for elite remote "
                                      "networks. Be specific and honest; quote the candidate's own lines when you "
                                      "criticise them. Respond only with JSON."},
        {"role": "user", "content": f"Review this {KIND_BRIEF[kind]} for a {user.target_role} applying to {label}.\n"
                                    f"{NETWORK_NOTES}\n\n\"\"\"\n{text[:MAX_TEXT]}\n\"\"\"\n\n"
                                    "Return JSON: score (0-100 likelihood of passing the profile screen), verdict "
                                    "(one sentence), sections (array of {name, score 0-100, feedback}; 4-6 sections "
                                    "suited to this kind of profile), strengths (array of short strings), fixes "
                                    "(array of {priority high|medium|low, issue, example}; most important first, "
                                    "5-8 items), rewrites (array of {before, after}: 2-4 of their weakest lines "
                                    "rewritten with impact), keywords_missing (array of ATS/skill keywords for the "
                                    "role), red_flags (array of things that would get them rejected)."},
    ]
    result, used_ai = ai.chat_json(messages, lambda: _fallback(kind, text), max_tokens=2500)
    result["score"] = max(0, min(100, int(result.get("score", 0) or 0)))
    result["ai"] = used_ai
    return result


def _save(db: Session, user: User, kind: str, target: str, source: str, result: dict) -> dict:
    row = ProfileReview(user_id=user.id, kind=kind, target=target, source=source[:200], result=result)
    db.add(row)
    db.commit()
    return _out(row)


def _out(r: ProfileReview) -> dict:
    return {"id": r.id, "kind": r.kind, "target": r.target, "source": r.source, "created_at": r.created_at.isoformat(),
            **r.result}


@router.post("/review/cv")
async def review_cv(file: UploadFile = File(...), target: str = Form("remote"), user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(400, "File is larger than 5 MB")
    text = _extract(file, data).strip()
    if len(text.split()) < 40:
        raise HTTPException(400, "Couldn't find enough text. Scanned PDFs (images) can't be read; export as text PDF.")
    return _save(db, user, "cv", target, file.filename or "resume", _review("cv", target, text, user))


class LinkedInIn(BaseModel):
    text: str = Field(min_length=80, max_length=MAX_TEXT)
    target: str = "remote"


@router.post("/review/linkedin")
def review_linkedin(body: LinkedInIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    first_line = body.text.strip().splitlines()[0][:80]
    return _save(db, user, "linkedin", body.target, first_line, _review("linkedin", body.target, body.text, user))


class GitHubIn(BaseModel):
    username: str = Field(min_length=1, max_length=39)
    target: str = "remote"


@router.post("/review/github")
def review_github(body: GitHubIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    username = body.username.strip().lstrip("@").removeprefix("https://github.com/").strip("/")
    text, facts = _github(username)
    result = _review("github", body.target, text, user)
    result["github"] = facts
    return _save(db, user, "github", body.target, username, result)


@router.get("/reviews")
def reviews(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(ProfileReview).where(ProfileReview.user_id == user.id)
                      .order_by(ProfileReview.id.desc()).limit(30)).all()
    return {"reviews": [_out(r) for r in rows]}


@router.get("/reviews/{rid}")
def get_review(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(ProfileReview, rid)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Review not found")
    return _out(row)
