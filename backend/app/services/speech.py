"""Speech analytics for interview answers: words, pace, filler words, think time, and rule-based coaching tips."""

import re

LONG_PAUSE_MS = 8000

# Each filler and the pattern that finds it used as a filler. "like" only counts in filler positions
# (", like", "like,", or at the start of a sentence), so "I like Python" is not flagged.
FILLER_PATTERNS: dict[str, str] = {
    "um": r"\bu+m+\b",
    "uh": r"\bu+h+\b",
    "erm": r"\ber+m+\b",
    "like": r"(?:,\s*like\b|\blike\s*,|(?:^|[.!?]\s+)like\b)",
    "you know": r"\byou know\b",
    "basically": r"\bbasically\b",
    "actually": r"\bactually\b",
    "sort of": r"\bsort of\b",
    "kind of": r"\bkind of\b",
    "i mean": r"\bi mean\b",
    "literally": r"\bliterally\b",
    "so yeah": r"\bso,? yeah\b",
}
_COMPILED = {word: re.compile(p, re.IGNORECASE | re.MULTILINE) for word, p in FILLER_PATTERNS.items()}
_WORD = re.compile(r"[A-Za-z0-9']+")


def strip_code(content: str) -> str:
    """The spoken/typed part of a stored candidate turn (live coding appends the editor contents)."""
    return content.split("\n\n[Code at this moment")[0].strip()


def filler_spans(text: str) -> list[dict]:
    """Character spans of filler words, for highlighting: [{start, end, word}], sorted, non-overlapping."""
    spans = []
    for word, rx in _COMPILED.items():
        for m in rx.finditer(text):
            start, end = m.start(), m.end()
            if word == "like":  # highlight just the word, not the punctuation around it
                start += m.group(0).lower().index("like")
                end = start + 4
            spans.append({"start": start, "end": end, "word": word})
    spans.sort(key=lambda s: (s["start"], -s["end"]))
    out, last_end = [], -1
    for s in spans:
        if s["start"] >= last_end:
            out.append(s)
            last_end = s["end"]
    return out


def count_fillers(text: str) -> dict:
    by_word: dict[str, int] = {}
    for s in filler_spans(text):
        by_word[s["word"]] = by_word.get(s["word"], 0) + 1
    return {"total": sum(by_word.values()), "by_word": by_word}


def answer_metrics(text: str, meta: dict | None = None) -> dict:
    """Metrics for one answer. `meta` comes from the browser: answer_ms, think_ms, speaking_ms, input."""
    meta = meta or {}
    words = len(_WORD.findall(text))
    speaking_ms = meta.get("speaking_ms") or None
    think_ms = meta.get("think_ms")
    out = {
        "words": words,
        "fillers": count_fillers(text),
        "think_ms": think_ms,
        "long_pause": bool(think_ms is not None and think_ms > LONG_PAUSE_MS),
        "answer_ms": meta.get("answer_ms"),
        "input": meta.get("input"),
    }
    if speaking_ms and speaking_ms >= 1000:
        out["speaking_ms"] = speaking_ms
        out["wpm"] = round(words / (speaking_ms / 60000))
    return out


def _tip(type_: str, severity: str, text: str) -> dict:
    return {"type": type_, "severity": severity, "text": text}


def rule_tips(question: str, answer: str, m: dict, english: bool = False) -> list[dict]:
    """Deterministic coaching tips for one answer, most important first (1-3 tips)."""
    tips: list[dict] = []
    words = m.get("words", 0)
    fillers = m.get("fillers", {}) or {}
    total_fillers = fillers.get("total", 0)
    if words < 25:
        tips.append(_tip("content", "high", f"Only {words} words. Real panels read short answers as shallow: aim "
                                           "for 60 to 120 seconds with one concrete example."))
    if not re.search(r"\d", answer) and not re.search(r"\b(for example|for instance|e\.g\.|when i|at my|we had|"
                                                       r"in my last|once)\b", answer, re.IGNORECASE):
        tips.append(_tip("content", "medium", "This answer had no concrete example or number. Name the project, "
                                              "what you did and a measurable result."))
    if total_fillers >= 3:
        top = max(fillers.get("by_word", {}).items(), key=lambda kv: kv[1], default=(None, 0))
        detail = f" You said '{top[0]}' {top[1]} times." if top[0] and top[1] >= 2 else ""
        tips.append(_tip("english" if english else "delivery", "high" if total_fillers >= 6 else "medium",
                         f"{total_fillers} filler words in one answer.{detail} Pause silently instead; a short "
                         "pause sounds more confident than a filler."))
    wpm = m.get("wpm")
    if wpm is not None and wpm < 110:
        tips.append(_tip("delivery", "medium", f"You spoke at {wpm} words per minute, which sounds hesitant. Aim "
                                               "for 130 to 160 by outlining your answer before you start."))
    elif wpm is not None and wpm > 170:
        tips.append(_tip("delivery", "medium", f"You spoke at {wpm} words per minute. Slow down to around 150 so "
                                               "the interviewer can follow, especially on a video call."))
    if m.get("long_pause"):
        secs = round((m.get("think_ms") or 0) / 1000)
        tips.append(_tip("delivery", "low", f"You took {secs} s to start. Buy time naturally by restating the "
                                            "question or saying how you'll structure the answer."))
    if words >= 25 and not re.search(r"\b(first|then|finally|because|so that|result|which meant)\b", answer,
                                     re.IGNORECASE):
        tips.append(_tip("structure", "low", "The answer had no clear structure. Try situation, action, result, "
                                             "or 'first, then, finally' for technical walk-throughs."))
    if not tips:
        tips.append(_tip("structure", "low", "Solid answer. To make it stand out, end with the impact or the "
                                             "trade-off you would revisit."))
    order = {"high": 0, "medium": 1, "low": 2}
    return sorted(tips, key=lambda t: order[t["severity"]])[:3]


def clean_tips(raw, fallback: list[dict]) -> list[dict]:
    """Validate AI tips; fall back to rule tips when the model returned nothing usable."""
    tips = []
    for t in raw if isinstance(raw, list) else []:
        if not isinstance(t, dict) or not str(t.get("text", "")).strip():
            continue
        tips.append({
            "type": t.get("type") if t.get("type") in ("content", "delivery", "structure", "english") else "content",
            "severity": t.get("severity") if t.get("severity") in ("low", "medium", "high") else "medium",
            "text": str(t["text"]).strip()[:400],
        })
    return tips[:3] or fallback


def totals(turns: list[dict]) -> dict:
    """Header numbers for the replay page."""
    metrics = [t["metrics"] for t in turns]
    wpms = [m["wpm"] for m in metrics if m.get("wpm")]
    thinks = [m["think_ms"] for m in metrics if m.get("think_ms") is not None]
    by_word: dict[str, int] = {}
    for m in metrics:
        for w, c in (m.get("fillers", {}) or {}).get("by_word", {}).items():
            by_word[w] = by_word.get(w, 0) + c
    top = sorted(by_word.items(), key=lambda kv: -kv[1])[:3]
    return {
        "answers": len(turns),
        "avg_wpm": round(sum(wpms) / len(wpms)) if wpms else None,
        "total_fillers": sum(by_word.values()),
        "top_fillers": [{"word": w, "count": c} for w, c in top],
        "avg_think_ms": round(sum(thinks) / len(thinks)) if thinks else None,
        "longest_pause_ms": max(thinks) if thinks else None,
        "total_words": sum(m.get("words", 0) for m in metrics),
    }
