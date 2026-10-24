from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    # Repo-root .env first, backend/.env overrides it; real env vars override both.
    model_config = SettingsConfigDict(env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"), extra="ignore")

    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_fast_model: str = "openai/gpt-oss-20b"
    groq_whisper_model: str = "whisper-large-v3-turbo"
    groq_tts_model: str = "canopylabs/orpheus-v1-english"
    groq_tts_voice: str = "troy"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    # Local fallback when Groq is unavailable or rate limited. Empty URL disables it.
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5-coder:latest"

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'haven.db').as_posix()}"

    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_expire_minutes: int = 60 * 24 * 7

    cors_origins: str = "http://localhost:3000"
    # Comma-separated emails that get the admin panel on sign-up (or run `python -m app.make_admin <email>`)
    admin_emails: str = ""
    groq_vision_model: str = "qwen/qwen3.8-27b"

    # Code runner limits
    run_timeout_seconds: float = 5.0
    run_memory_mb: int = 256

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

    @property
    def ai_enabled(self) -> bool:
        return bool(self.groq_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
