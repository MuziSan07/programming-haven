from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..content import queries as q
from ..database import get_db
from ..deps import get_current_user
from ..models import QuestionAttempt, User
from ..routers.auth import user_out
from ..services import ai
from ..services.scoring import XP_QUESTION, award

router = APIRouter(prefix="/api/questions", tags=["questions"])


def _public(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in {"answer", "explanation", "model_answer"}}


@router.get("")
def list_questions(topic: str | None = None, level: str | None = None, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    items = q.questions(db)
    attempts = db.scalars(select(QuestionAttempt).where(QuestionAttempt.user_id == user.id)).all()
    best: dict[str, bool] = {}
    for a in attempts:
        best[a.question_id] = best.get(a.question_id, False) or a.correct
    topics: dict[str, dict] = {}
    for it in items:
        t = topics.setdefault(it["topic"], {"topic": it["topic"], "total": 0, "done": 0,
                                            "levels": {lv: 0 for lv in q.LEVEL_ORDER}})
        t["total"] += 1
        t["levels"][it["level"]] = t["levels"].get(it["level"], 0) + 1
        t["done"] += best.get(it["id"], False)
    filtered = [it for it in items if (not topic or it["topic"] == topic) and (not level or it["level"] == level)]
    filtered.sort(key=lambda it: q.LEVEL_ORDER.index(it["level"]) if it["level"] in q.LEVEL_ORDER else 9)
    return {
        "topics": list(topics.values()),
        "levels": q.LEVEL_ORDER,
        "questions": [{**_public(it), "status": ("correct" if best[it["id"]] else "attempted") if it["id"] in best
                       else "todo"} for it in filtered],
    }


class AnswerIn(BaseModel):
    choice: int | None = None
    text: str | None = Field(default=None, max_length=8000)


@router.post("/{qid}/answer")
def answer(qid: str, body: AnswerIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = q.question(db, qid)
    if not item:
        raise HTTPException(404, "Question not found")
    first_correct = not db.scalar(select(QuestionAttempt).where(
        QuestionAttempt.user_id == user.id, QuestionAttempt.question_id == qid, QuestionAttempt.correct.is_(True)))

    if item["type"] == "mcq":
        if body.choice is None:
            raise HTTPException(400, "Pick an option")
        correct = body.choice == item["answer"]
        result = {"correct": correct, "score": 100 if correct else 0, "answer": item["answer"],
                  "explanation": item.get("explanation", "")}
    else:
        if not (body.text or "").strip():
            raise HTTPException(400, "Write an answer first")
        messages = [
            {"role": "system", "content": "You are a strict senior interviewer grading a candidate's answer against "
                                          "a model answer. Respond only with JSON."},
            {"role": "user", "content": f"Topic: {item['topic']} ({item['level']})\nQuestion: {item['question']}\n\n"
                                        f"Model answer: {item.get('model_answer', '')}\n\nCandidate answer: {body.text}\n\n"
                                        "Return JSON: score (0-100), verdict (one short sentence), missing (array "
                                        "of key points the candidate missed), good (array of things done well)."},
        ]
        graded, _ = ai.chat_json(messages, lambda: {"score": 50, "verdict": "AI grading is offline. Compare "
                                                    "your answer with the model answer below.", "missing": [],
                                                    "good": []}, fast=True)
        score = int(graded.get("score", 0))
        correct = score >= 70
        result = {"correct": correct, "score": score, "verdict": graded.get("verdict", ""),
                  "missing": graded.get("missing", []), "good": graded.get("good", []),
                  "model_answer": item.get("model_answer", ""), "explanation": item.get("explanation", "")}

    db.add(QuestionAttempt(user_id=user.id, question_id=qid, correct=correct, score=result["score"]))
    xp = XP_QUESTION if correct and first_correct else 0
    award(user, xp)
    db.commit()
    return {**result, "xp_gained": xp, "user": user_out(user)}
