"""AI moderation for community content.

Policy: the community is for technology. Genuine technical questions, problems, discussions, debates,
learning progress and career achievements in tech are allowed. Off-topic/personal chatter, spam and
self-promotion, harassment, hate, sexual content, scams, cheating requests (e.g. live help during a real
proctored test) and low-effort garbage are not.

Verdicts: approved -> published, rejected -> hidden (author sees why), review -> held for an admin.
When no AI provider is reachable, a conservative heuristic decides and anything unclear goes to review.
"""

import re

from . import ai

APPROVED, REJECTED, REVIEW = "approved", "rejected", "review"
STATUS_FOR = {APPROVED: "published", REJECTED: "rejected", REVIEW: "pending"}

CATEGORIES = ["off_topic", "spam", "self_promotion", "harassment", "hate", "sexual", "violence", "scam",
              "cheating", "personal_info", "low_effort", "other"]

POLICY = (
    "You moderate the community of Programming Haven, a platform where developers prepare for technical "
    "interviews and remote jobs. ALLOW: genuine technical questions, bugs and problems, code, technical "
    "debates and opinions (even heated, if respectful), system design, career questions about tech jobs, "
    "interview experiences, learning progress, achievements (solved problems, offers, certifications, "
    "shipped projects), hackathon discussion, and short replies that make sense inside a technical thread "
    "(e.g. 'that fixed it, thanks', 'I disagree because...'). REJECT: off-topic personal chatter or life "
    "posts unrelated to tech, politics/religion, spam, ads, referral links, self-promotion without technical "
    "value, harassment or insults, hate, sexual content, violence, scams, sharing others' personal data, "
    "requests to cheat on real exams/interviews, and gibberish or zero-effort posts. Use REVIEW only when "
    "genuinely unsure. Be fair: imperfect English is fine."
)

TECH_WORDS = re.compile(
    r"\b(code|coding|bug|error|exception|api|python|java(script)?|typescript|react|node|sql|database|algorithm|"
    r"dsa|leetcode|function|class|array|string|server|backend|frontend|deploy|docker|kubernetes|aws|git|"
    r"interview|offer|job|remote|toptal|turing|compile|runtime|complexity|o\(|recursion|debug|framework|"
    r"library|test|hackathon|project|program|stack|queue|graph|tree|cache|http|css|html|linux|cloud|ml|ai|"
    r"model|data|c\+\+|golang|rust|kotlin|swift|flutter|android|ios|system design|thanks|agree|disagree)\b",
    re.IGNORECASE,
)
BAD_WORDS = re.compile(
    r"\b(viagra|casino|crypto ?giveaway|onlyfans|xxx|porn|nude|telegram me|whatsapp me|dm me for|buy followers|"
    r"click here|earn \$|make money fast|idiot|stupid|moron|kill yourself|kys)\b",
    re.IGNORECASE,
)


def _heuristic(text: str) -> dict:
    if BAD_WORDS.search(text):
        return {"verdict": REJECTED, "reason": "This looks like spam or abusive content.", "categories": ["spam"],
                "confidence": 0.7}
    words = re.findall(r"[A-Za-z]{2,}", text)
    if len(words) < 3 and not TECH_WORDS.search(text):
        return {"verdict": REVIEW, "reason": "Too short to tell if this is technical.", "categories": ["low_effort"],
                "confidence": 0.4}
    if TECH_WORDS.search(text):
        return {"verdict": APPROVED, "reason": "Technical content.", "categories": [], "confidence": 0.6}
    return {"verdict": REVIEW, "reason": "Couldn't confirm this is about tech.", "categories": ["off_topic"],
            "confidence": 0.4}


def moderate(kind: str, text: str, context: str = "") -> dict:
    """Return {verdict, reason, categories, confidence, ai}. `kind` is post | comment | submission."""
    messages = [
        {"role": "system", "content": POLICY + " Respond only with JSON."},
        {"role": "user", "content": f"Content type: {kind}\n"
                                    + (f"Thread context (for judging relevance):\n{context[:1500]}\n\n" if context else "")
                                    + f"Content to moderate:\n\"\"\"\n{text[:6000]}\n\"\"\"\n\n"
                                    "Return JSON: verdict ('approved' | 'rejected' | 'review'), reason (one short "
                                    "sentence addressed to the author, explaining the decision), categories (array "
                                    f"from {CATEGORIES}, empty when approved), confidence (0-1)."},
    ]
    result, used_ai = ai.chat_json(messages, lambda: _heuristic(f"{context}\n{text}" if kind == "comment" else text),
                                   temperature=0.0, max_tokens=600, fast=True)
    verdict = result.get("verdict") if result.get("verdict") in STATUS_FOR else REVIEW
    return {
        "verdict": verdict,
        "reason": str(result.get("reason", ""))[:300],
        "categories": [c for c in result.get("categories", []) if c in CATEGORIES],
        "confidence": float(result.get("confidence", 0.5) or 0.5),
        "ai": used_ai,
    }
