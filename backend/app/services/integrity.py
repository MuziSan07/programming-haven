"""Interview anti-cheating: strikes within a session, and escalating bans across sessions.

Policy: the first strike in an interview is a warning; the second ends the interview and bans the user
from AI interviews. Each counted offense escalates the ban: 1 hour, 24 hours, 3 days, 1 week, 1 month,
then permanent (the user must contact support). Bans lifted by an admin don't count as offenses.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import InterviewBan, InterviewSession, InterviewStrike, User
from . import ai

LADDER = [timedelta(hours=1), timedelta(hours=24), timedelta(days=3), timedelta(days=7), timedelta(days=30), None]
STRIKES_TO_TERMINATE = 2

STRIKE_TEXT = {
    "left_tab": "you left the interview window",
    "paste": "you pasted text into your answer",
    "ai_tool_on_screen": "an AI assistant was visible on your screen",
    "another_person": "someone else appeared to be helping you",
    "phone": "you appeared to be reading from another device",
    "other": "suspicious activity was detected",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def human_duration(delta: timedelta | None) -> str:
    if delta is None:
        return "permanently"
    hours = round(delta.total_seconds() / 3600)
    if hours <= 24:
        return f"{hours} hour{'s' if hours != 1 else ''}"
    days = round(hours / 24)
    if days == 7:
        return "1 week"
    if days == 30:
        return "1 month"
    return f"{days} day{'s' if days != 1 else ''}"


def ban_out(ban: InterviewBan | None) -> dict | None:
    if ban is None:
        return None
    ends = _aware(ban.ends_at)
    return {"id": ban.id, "offense": ban.offense, "reason": ban.reason, "permanent": ends is None,
            "starts_at": _aware(ban.starts_at).isoformat(), "ends_at": ends.isoformat() if ends else None,
            "lifted": ban.lifted_at is not None,
            "length": human_duration(None if ends is None else ends - _aware(ban.starts_at))}


def active_ban(db: Session, user_id: int) -> InterviewBan | None:
    now = _now()
    bans = db.scalars(select(InterviewBan).where(InterviewBan.user_id == user_id, InterviewBan.lifted_at.is_(None))
                      .order_by(InterviewBan.id.desc()))
    for ban in bans:
        ends = _aware(ban.ends_at)
        if ends is None or ends > now:
            return ban
    return None


def _next_ban(db: Session, user_id: int) -> tuple[int, timedelta | None]:
    offenses = db.scalar(select(func.count()).select_from(InterviewBan).where(
        InterviewBan.user_id == user_id, InterviewBan.lifted_at.is_(None))) or 0
    offense = offenses + 1
    return offense, LADDER[min(offense, len(LADDER)) - 1]


def record_strike(db: Session, s: InterviewSession, user: User, kind: str, detail: str = "") -> dict:
    """Record a strike and apply the policy. Returns {action, message, ban}."""
    kind = kind if kind in STRIKE_TEXT else "other"
    prior = db.scalar(select(func.count()).select_from(InterviewStrike).where(InterviewStrike.session_id == s.id)) or 0
    terminate = prior + 1 >= STRIKES_TO_TERMINATE
    db.add(InterviewStrike(user_id=user.id, session_id=s.id, kind=kind, detail=detail[:400],
                           action="terminated" if terminate else "warning"))
    first = user.name.split()[0]
    if not terminate:
        db.commit()
        message = (f"{first}, I noticed {STRIKE_TEXT[kind]}. In a real interview that counts as cheating. "
                   "This is your only warning: if it happens again, this interview ends and you'll be locked out "
                   "of interviews for a while.")
        return {"action": "warning", "message": message, "ban": None}

    offense, length = _next_ban(db, user.id)
    now = _now()
    ban = InterviewBan(user_id=user.id, session_id=s.id, offense=offense,
                       reason=f"Interview #{s.id} ended: {STRIKE_TEXT[kind]}", starts_at=now,
                       ends_at=None if length is None else now + length)
    db.add(ban)
    s.ended_at = now
    s.context = {**s.context, "terminated": True, "terminated_reason": STRIKE_TEXT[kind]}
    s.feedback = {
        "overall_score": 0, "verdict": "Terminated", "terminated": True, "ai": False,
        "summary": f"This interview was ended because {STRIKE_TEXT[kind]} after a warning. Real hiring panels "
                   "reject candidates who use outside help, so we treat it the same way.",
        "scores": {}, "strengths": [],
        "improvements": ["Practise without outside tools: that's what the real screen expects"],
        "question_feedback": [],
    }
    db.commit()
    lockout = ("You can't start another interview until you contact support." if length is None
               else f"You can't start another interview for {human_duration(length)}.")
    message = f"{first}, {STRIKE_TEXT[kind]} again after a warning, so I'm ending this interview. {lockout}"
    return {"action": "terminated", "message": message, "ban": ban_out(ban)}


VISION_PROMPT = (
    "Is there clear evidence of cheating in these interview frames? Look for: an AI assistant or chatbot window "
    "on the screen (ChatGPT, Claude, Gemini, Copilot chat, Perplexity and similar) or a search engine showing an "
    "answer; another person helping; the candidate reading from a phone or second device. A code editor, the "
    "interview page itself, or the candidate briefly looking away are NOT cheating. Return JSON with keys: "
    "cheating (true or false), kind (one of ai_tool_on_screen, another_person, phone, none), evidence (one short "
    "sentence), confidence (0 to 1)."
)


def vision_check(images: list[str]) -> dict | None:
    """Look at camera/screen frames for outside help. Returns {kind, evidence} when something is found."""
    if not images:
        return None
    messages = [
        {"role": "system", "content": "You are an exam proctor reviewing live frames from a remote technical "
                                      "interview: the candidate's camera and/or shared screen. Respond only with "
                                      "JSON."},
        ai.with_images(VISION_PROMPT, images),
    ]
    text, used_ai = ai.vision_chat(messages, lambda: "", temperature=0.0, max_tokens=300)
    if not used_ai or not text:
        return None
    try:
        data = ai.parse_json(text)
    except ValueError:
        return None
    confident = float(data.get("confidence", 0) or 0) >= 0.75
    if data.get("cheating") is True and confident and data.get("kind") in STRIKE_TEXT:
        return {"kind": data["kind"], "evidence": str(data.get("evidence", ""))[:300]}
    return None
