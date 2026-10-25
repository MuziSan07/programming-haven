from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..content.proctoring import public_problem
from ..database import get_db
from ..deps import get_current_user
from ..models import Submission, User
from ..routers.auth import user_out
from ..services import ai, polyglot, runner
from ..services.scoring import XP_PROBLEM, award, solved_slugs

router = APIRouter(prefix="/api/dsa", tags=["dsa"])


def _problem(db: Session, slug: str) -> dict:
    problem = q.problem(db, slug)
    if not problem:
        raise HTTPException(404, "Problem not found")
    return problem


@router.get("/problems")
def list_problems(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    solved = solved_slugs(db, user.id)
    attempted = set(db.scalars(select(Submission.problem_slug).where(Submission.user_id == user.id)))
    problems = q.problems(db)
    return {
        "patterns": q.patterns(db),
        "companies": sorted({c for p in problems for c in p.get("companies", [])}),
        "problems": [
            {"slug": p["slug"], "title": p["title"], "difficulty": p["difficulty"], "pattern": p["pattern"],
             "companies": p.get("companies", []),
             "status": "solved" if p["slug"] in solved else "attempted" if p["slug"] in attempted else "todo"}
            for p in problems if not p["slug"].startswith("oa-")
        ],
    }


@router.get("/problems/{slug}")
def get_problem(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = public_problem(_problem(db, slug))
    problem = _problem(db, slug)
    langs = list(runner.HARNESS_LANGUAGES) + polyglot.supported_languages(problem)
    data["languages"] = [{"id": k, "label": runner.LANGUAGES[k]["label"]} for k in langs if runner.language_available(k)]
    data["starter"] = {**problem["starter"], **polyglot.starters(problem)}
    data["solved"] = slug in solved_slugs(db, user.id)
    last = db.scalars(select(Submission).where(Submission.user_id == user.id, Submission.problem_slug == slug)
                      .order_by(Submission.id.desc()).limit(10)).all()
    data["submissions"] = [{"id": s.id, "status": s.status, "language": s.language, "passed": s.passed,
                            "total": s.total, "runtime_ms": s.runtime_ms, "created_at": s.created_at.isoformat(),
                            "code": s.code} for s in last]
    return data


class CodeIn(BaseModel):
    slug: str
    language: str = Field(pattern="^(python|javascript|go|java|cpp)$")
    code: str = Field(min_length=1, max_length=50_000)


@router.post("/run")
def run(body: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    problem = _problem(db, body.slug)
    samples = [t for t in problem["tests"] if not t["hidden"]]
    return runner.run_tests(problem, body.language, body.code, samples)


@router.post("/submit")
def submit(body: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    problem = _problem(db, body.slug)
    first_solve = body.slug not in solved_slugs(db, user.id)
    result = runner.run_tests(problem, body.language, body.code, problem["tests"])
    db.add(Submission(user_id=user.id, problem_slug=body.slug, language=body.language, code=body.code,
                      passed=result["passed"], total=result["total"], status=result["status"],
                      runtime_ms=result["time_ms"]))
    xp = 0
    if result["status"] == "Accepted":
        xp = XP_PROBLEM.get(problem["difficulty"], 30) if first_solve else 0
        award(user, xp)
    db.commit()
    return {**result, "xp_gained": xp, "first_solve": first_solve and xp > 0, "user": user_out(user)}


class HintIn(CodeIn):
    level: int = Field(ge=1, le=3)


HINT_STYLE = {
    1: "a gentle nudge: one guiding question about the key insight. Do not name the algorithm.",
    2: "a stronger hint: name the technique or data structure and why it fits. No code.",
    3: "a near-solution: describe the algorithm step by step in plain English (max 5 steps). No code.",
}


@router.post("/hint")
def hint(body: HintIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    problem = _problem(db, body.slug)
    messages = [
        {"role": "system", "content": "You are a senior interviewer coaching a candidate on a coding problem. "
                                      "Never write the solution code. Reply in at most 80 words, Markdown."},
        {"role": "user", "content": f"Problem: {problem['title']}\n{problem['description']}\n\n"
                                    f"Candidate's current {body.language} code:\n```\n{body.code}\n```\n\n"
                                    f"Give {HINT_STYLE[body.level]} If their code has a clear bug, point at it."},
    ]
    text, used_ai = ai.chat(messages, lambda: problem["hints"][body.level - 1], temperature=0.4, max_tokens=800,
                            fast=True)
    return {"hint": text, "level": body.level, "ai": used_ai}


@router.post("/review")
def review(body: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    problem = _problem(db, body.slug)
    messages = [
        {"role": "system", "content": "You are a senior engineer reviewing interview code the way Toptal or "
                                      "Turing reviewers do. Be specific and constructive. Respond only with JSON."},
        {"role": "user", "content": f"Problem: {problem['title']}\n{problem['description']}\n"
                                    f"Optimal complexity: {problem['complexity']}\n\n"
                                    f"Candidate {body.language} code:\n```\n{body.code}\n```\n\n"
                                    "Return JSON with keys: score (0-100 interview-readiness of this code), "
                                    "time_complexity (string), space_complexity (string), "
                                    "is_optimal (bool), summary (2 sentences), strengths (array of short "
                                    "strings), improvements (array of short strings), "
                                    "interviewer_follow_up (one question an interviewer would ask next)."},
    ]

    def fallback():
        return {
            "score": 60, "time_complexity": "Unknown (offline)", "space_complexity": "Unknown (offline)",
            "is_optimal": False,
            "summary": "AI review is offline, so this is a generic checklist. Target complexity: "
                       f"{problem['complexity']}.",
            "strengths": ["Submitted a working attempt"],
            "improvements": ["Name variables descriptively", "Handle empty and single-element inputs",
                             "State the time and space complexity out loud"],
            "interviewer_follow_up": "How would your solution change if the input didn't fit in memory?",
        }

    data, used_ai = ai.chat_json(messages, fallback)
    return {**data, "ai": used_ai}


COMPANION_EVENTS = {
    "open": "The candidate just opened the problem. Greet them in character with a playful one-liner and a "
            "thought-provoking question or mini riddle about the core idea (no technique names yet).",
    "idle": "The candidate has been quiet and stuck for a while. Pop in with a playful real-life analogy or a mind "
            "game that points toward the key insight without naming the algorithm outright.",
    "run_failed": "Their last run failed ({status}). React playfully but usefully: point at WHERE to look (an edge "
                  "case, an off-by-one, a wrong assumption) through a question, not a fix.",
    "accepted": "They just got Accepted. Celebrate briefly, then raise the bar like a real interviewer: a follow-up "
                "constraint (less memory, streaming input, sorted input, concurrency...).",
    "tab_return": "They switched away from the tab and came back. Tease them lightly: real interviewers notice "
                  "wandering eyes. Then refocus them with a question about their current code.",
    "chat": "Answer the candidate's message in character.",
}


class CompanionMsg(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class CompanionIn(BaseModel):
    slug: str
    language: str = Field(default="python", max_length=20)
    code: str = Field(default="", max_length=50_000)
    event: str = Field(pattern="^(open|idle|run_failed|accepted|tab_return|chat)$")
    message: str = Field(default="", max_length=4000)
    status: str = Field(default="", max_length=60)
    history: list[CompanionMsg] = Field(default_factory=list, max_length=20)


@router.post("/companion")
def companion(body: CompanionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    problem = _problem(db, body.slug)
    persona = q.persona(db, user.persona_id)
    kb = q.relevant_knowledge(db, "hinting analogies socratic playful", limit=2)
    kb_text = "\n\n".join(d["content"] for d in kb)
    system = (
        f"You are {persona['name']}, {persona.get('title', 'an interviewer')}, sitting beside a candidate who is "
        f"solving a coding problem. Personality: {persona.get('personality', '')}\n"
        "Style: playful, witty, a little teasing, like a sharp mentor who plays mind games. Use vivid real-life "
        "analogies (e.g. 'a kid who needs help asks a parent, so maybe call the parent class'; 'a librarian never "
        "reads every book, she uses the index'). Never write solution code, never state the full algorithm. "
        "Max 45 words. One question at the end when it fits. Plain text, no Markdown headings.\n\n"
        f"Problem: {problem['title']} ({problem['difficulty']}, {problem['pattern']})\n{problem['description']}\n"
        f"Target complexity (secret, don't reveal unless they ask after solving): {problem['complexity']}\n"
        + (f"\nAnalogy library:\n{kb_text}" if kb_text else "")
    )
    event = COMPANION_EVENTS[body.event].format(status=body.status or "wrong answer")
    messages = [{"role": "system", "content": system}] + [m.model_dump() for m in body.history[-10:]]
    messages.append({"role": "user", "content": f"[{event}]\nTheir current {body.language} code:\n{body.code[:6000]}"
                                                + (f"\n\nCandidate says: {body.message}" if body.message else "")})
    fallbacks = {
        "open": f"I'm {persona['name']}. Before you type a single line: what's the dumbest possible solution? "
                "Say it out loud, then tell me why it's slow.",
        "idle": "Stuck? Picture a librarian. She never reads every book to find one. What's your 'index' here?",
        "run_failed": "Close, but no cookie. Which input would make your code sweat: empty, one element, or duplicates?",
        "accepted": "Accepted! Now the interviewer smiles and says: 'Nice. Can you do it with less memory?'",
        "tab_return": "Welcome back. In a real interview, wandering eyes get noticed. Where were we in your loop?",
        "chat": "Good question. What do you think happens if you trace your code with the first example?",
    }
    text, used_ai = ai.chat(messages, lambda: problem["hints"][0] if body.event == "idle" and not body.history
                            else fallbacks[body.event], temperature=0.85, max_tokens=500, fast=body.event != "chat")
    return {"message": text.strip(), "persona": persona["name"], "ai": used_ai}
