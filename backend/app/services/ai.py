"""AI service with a provider chain: Groq → local Ollama → scripted fallback.

Groq and Ollama both speak the OpenAI chat-completions format, so adding or swapping a
provider is a config change. Every call takes a `fallback` so the product keeps working
offline or when the free tier is rate limited — important for live demos.
"""

import json
import logging
import re
from typing import Callable

import httpx

from ..config import get_settings

log = logging.getLogger("haven.ai")


class AIUnavailable(Exception):
    pass


def _providers(fast: bool) -> list[tuple[str, str, dict, str]]:
    """(name, base_url, headers, model) in priority order."""
    s = get_settings()
    providers = []
    if s.groq_api_key:
        providers.append(("groq", s.groq_base_url, {"Authorization": f"Bearer {s.groq_api_key}"},
                          s.groq_fast_model if fast else s.groq_model))
    if s.ollama_url:
        providers.append(("ollama", f"{s.ollama_url.rstrip('/')}/v1", {}, s.ollama_model))
    return providers


def _chat_raw(messages: list[dict], *, json_mode: bool, temperature: float, max_tokens: int, fast: bool) -> str:
    for name, base_url, headers, model in _providers(fast):
        body = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if name == "groq" and model.startswith("openai/gpt-oss"):
            # Keep reasoning short so answers stay fast and inside max_tokens
            body["reasoning_effort"] = "low"
        try:
            resp = httpx.post(f"{base_url}/chat/completions", headers=headers, json=body,
                              timeout=45 if name == "groq" else 120)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"].get("content") or ""
            if content.strip():
                return content
            log.warning("%s returned an empty answer", name)
        except (httpx.HTTPError, KeyError, IndexError) as exc:
            log.warning("%s chat failed: %s", name, exc)
    raise AIUnavailable("No AI provider available")


def chat(
    messages: list[dict],
    fallback: Callable[[], str],
    *,
    temperature: float = 0.5,
    max_tokens: int = 1500,
    fast: bool = False,
) -> tuple[str, bool]:
    """Return (text, used_ai)."""
    try:
        return _chat_raw(messages, json_mode=False, temperature=temperature, max_tokens=max_tokens, fast=fast), True
    except AIUnavailable:
        return fallback(), False


def chat_json(
    messages: list[dict],
    fallback: Callable[[], dict],
    *,
    temperature: float = 0.3,
    max_tokens: int = 2500,
    fast: bool = False,
) -> tuple[dict, bool]:
    """Return (parsed JSON object, used_ai). The prompt must ask for JSON."""
    try:
        text = _chat_raw(messages, json_mode=True, temperature=temperature, max_tokens=max_tokens, fast=fast)
        return _parse_json(text), True
    except (AIUnavailable, ValueError) as exc:
        log.info("Using JSON fallback: %s", exc)
        return fallback(), False


def with_images(text: str, images: list[str]) -> dict:
    """Build a user message carrying JPEG/PNG data URLs (or bare base64 JPEG) for the vision model."""
    parts: list[dict] = [{"type": "text", "text": text}]
    for img in images:
        url = img if img.startswith("data:") else f"data:image/jpeg;base64,{img}"
        parts.append({"type": "image_url", "image_url": {"url": url}})
    return {"role": "user", "content": parts}


def vision_chat(messages: list[dict], fallback: Callable[[], str], *, temperature: float = 0.6,
                max_tokens: int = 700) -> tuple[str, bool]:
    """Chat with a vision-capable model. Messages may contain image parts (see `with_images`)."""
    s = get_settings()
    if not s.groq_api_key:
        return fallback(), False
    try:
        resp = httpx.post(
            f"{s.groq_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {s.groq_api_key}"},
            json={"model": s.groq_vision_model, "messages": messages, "temperature": temperature,
                  "max_tokens": max_tokens},
            timeout=60,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"].get("content") or ""
        # Some reasoning models wrap their thinking in <think> tags
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        if content:
            return content, True
    except (httpx.HTTPError, KeyError, IndexError) as exc:
        log.warning("Vision chat failed: %s", exc)
    return fallback(), False


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("Model did not return JSON")
        return json.loads(match.group(0))


def transcribe(audio: bytes, filename: str, content_type: str) -> str:
    s = get_settings()
    if not s.groq_api_key:
        raise AIUnavailable("No GROQ_API_KEY configured")
    try:
        resp = httpx.post(
            f"{s.groq_base_url}/audio/transcriptions",
            headers={"Authorization": f"Bearer {s.groq_api_key}"},
            files={"file": (filename, audio, content_type)},
            data={"model": s.groq_whisper_model, "language": "en", "response_format": "json"},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("text", "").strip()
    except httpx.HTTPError as exc:
        log.warning("Groq transcription failed: %s", exc)
        raise AIUnavailable(str(exc)) from exc


def speak(text: str, voice: str | None = None) -> bytes:
    """Text-to-speech via Groq (Orpheus). Returns WAV bytes."""
    s = get_settings()
    if not s.groq_api_key:
        raise AIUnavailable("No GROQ_API_KEY configured")
    try:
        resp = httpx.post(
            f"{s.groq_base_url}/audio/speech",
            headers={"Authorization": f"Bearer {s.groq_api_key}"},
            json={"model": s.groq_tts_model, "voice": voice or s.groq_tts_voice, "input": text[:1000],
                  "response_format": "wav"},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.content
    except httpx.HTTPError as exc:
        log.warning("Groq TTS failed: %s", exc)
        raise AIUnavailable(str(exc)) from exc
