import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .config import get_settings
from .content import store
from .database import SessionLocal
from .migrate import upgrade
from .routers import (activity, admin, ai, auth, badges, career, coach, community, compete, dashboard, dsa, flashcards,
                      groups, hackathons, interviews, learn, paths, projects, questions, rounds, tests)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

settings = get_settings()
upgrade()
with SessionLocal() as _db:
    store.seed(_db)

app = FastAPI(
    title="Programming Haven API",
    description="AI-powered preparation for remote developer screening pipelines.",
    version="0.2.0",
)

# Large JSON (question bank, problem lists) compresses ~10x
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, dashboard, learn, dsa, tests, interviews, paths, ai, questions, projects, activity, admin,
               community, hackathons, flashcards, badges, rounds, compete, coach, career, groups):
    app.include_router(module.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "ai": settings.ai_enabled}
