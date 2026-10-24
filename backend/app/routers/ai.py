from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import get_settings
from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..services import ai

router = APIRouter(prefix="/api/ai", tags=["ai"])

TUTOR_SYSTEM = (
    "You are Haven, a friendly, encouraging programming tutor inside Programming Haven, a platform that "
    "prepares developers for technical screenings at remote talent networks. Explain concepts simply, use "
    "short code examples, and keep answers under 180 words unless asked for more. If the learner is working "
    "on an exercise, guide them toward the answer with questions and hints instead of giving the full "
    "solution. Use Markdown with fenced code blocks."
)


@router.get("/status")
def status():
    settings = get_settings()
    return {"enabled": settings.ai_enabled, "model": settings.groq_model if settings.ai_enabled else "offline-demo"}


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=8000)


class TutorIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    context: str = Field(default="", max_length=6000)


@router.post("/tutor")
def tutor(body: TutorIn, user: User = Depends(get_current_user)):
    messages = [{"role": "system", "content": TUTOR_SYSTEM}]
    if body.context:
        messages.append({"role": "system", "content": f"Current learning context:\n{body.context}"})
    messages += [m.model_dump() for m in body.history[-10:]]
    messages.append({"role": "user", "content": body.message})

    def fallback():
        return ("I'm running in **offline demo mode** right now, so I can't give a personalised answer. "
                "Here's a tip: break the problem into the smallest step you can test, run it, and build up "
                "from there. Add a `GROQ_API_KEY` to the backend `.env` to switch on the live AI tutor.")

    reply, used_ai = ai.chat(messages, fallback, temperature=0.6, max_tokens=700)
    return {"reply": reply, "ai": used_ai}


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    voice: str | None = Field(default=None, max_length=40)


@router.post("/speak")
def speak(body: SpeakIn, user: User = Depends(get_current_user)):
    try:
        audio = ai.speak(body.text, body.voice)
    except ai.AIUnavailable:
        # The browser falls back to its built-in speech synthesis
        raise HTTPException(503, "Neural voice unavailable")
    return Response(content=audio, media_type="audio/wav")


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    audio = await file.read()
    if len(audio) > 20 * 1024 * 1024:
        raise HTTPException(413, "Audio too large")
    try:
        text = ai.transcribe(audio, file.filename or "answer.webm", file.content_type or "audio/webm")
    except ai.AIUnavailable:
        raise HTTPException(503, "Speech recognition unavailable — type your answer instead")
    return {"text": text}


class MirrorIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    image: str | None = Field(default=None, max_length=1_500_000)  # current camera frame as a JPEG data URL
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)


@router.post("/mirror")
def mirror(body: MirrorIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """'Test your interviewer': the persona looks through the camera and answers questions about appearance,
    background, lighting and interview readiness."""
    persona = q.persona(db, user.persona_id)
    kb = q.relevant_knowledge(db, "video interview dress code professional lighting background camera", limit=2)
    kb_text = "\n\n".join(d["content"] for d in kb)
    system = (
        f"You are {persona['name']}, {persona.get('title', 'an interviewer')}, on a pre-interview video check with "
        f"a candidate. Personality: {persona.get('personality', '')}\n"
        "You can see the candidate through their camera (attached image). Answer what they ask: their outfit and "
        "colours, whether it looks professional for a remote tech interview, background, lighting, framing, "
        "posture, eye contact. Be honest but kind and specific, and give concrete fixes. Describe only what is "
        "actually visible; if the image is unclear or missing, say so. Don't comment on body shape, attractiveness "
        "or anything unrelated to interview presentation. Max 90 words, conversational, no Markdown."
        + (f"\n\nGuidance:\n{kb_text}" if kb_text else "")
    )
    messages = [{"role": "system", "content": system}] + [m.model_dump() for m in body.history[-8:]]
    if body.image:
        messages.append(ai.with_images(body.message, [body.image]))
    else:
        messages.append({"role": "user", "content": body.message + "\n(No camera frame was attached.)"})

    def fallback():
        return ("I can't see you right now because the vision AI is offline. Quick checklist: solid, muted colours, "
                "light facing you, camera at eye level, tidy background.")

    reply, used_ai = ai.vision_chat(messages, fallback)
    return {"reply": reply, "persona": persona["name"], "ai": used_ai}
