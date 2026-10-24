# Programming Haven — Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────────┐
│  Frontend  (Next.js, JS)     │  REST  │  Backend  (FastAPI, Python)      │
│  - App Router + Tailwind     │ ─────► │  - Auth (JWT)                    │
│  - Monaco code editor        │  JSON  │  - Learn / DSA / Tests /         │
│  - MediaPipe face detection  │        │    Interviews / Paths APIs       │
│  - Web Speech TTS + avatar   │        │  - Code runner (sandboxed)       │
│  - PWA: phone, tablet, desk  │        │  - AI service (Groq)             │
└──────────────────────────────┘        └───────┬───────────────┬──────────┘
                                                │               │
                                     ┌──────────▼───┐   ┌───────▼─────────┐
                                     │ PostgreSQL / │   │ Groq API        │
                                     │ SQLite (dev) │   │ LLM + Whisper   │
                                     └──────────────┘   └─────────────────┘
```

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router, JavaScript), Tailwind CSS | Responsive, installable PWA |
| Editor | Monaco (`@monaco-editor/react`) | Same editor as VS Code |
| Proctoring | MediaPipe Face Detector (in browser) | Runs on the candidate's device; no video leaves it |
| Voice | Groq Whisper (speech-to-text), Web Speech API (text-to-speech) | Free |
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2 | Python 3.12+ |
| Database | SQLite locally, PostgreSQL in Docker / production | Set by `DATABASE_URL` |
| AI | Groq (OpenAI-compatible API) | Model set by `GROQ_MODEL`; offline demo fallback when no key |
| Code execution | Subprocess runner with time & memory limits | Swap for Judge0 / isolate in production |
| Packaging | Docker Compose | `docker compose up` runs everything |

## Backend layout

```
backend/app/
  main.py            FastAPI app, CORS, routers
  config.py          Settings from environment
  database.py        Engine + session
  models.py          SQLAlchemy models
  security.py        Password hashing, JWT
  deps.py            Auth dependency
  routers/           auth, dashboard, learn, dsa, tests, interviews, paths, ai
  services/
    ai.py            Groq client with offline fallback
    runner.py        Code execution + test harness
    scoring.py       XP, streaks, Readiness Score
  content/           Seed content: lessons, problems, tests, company paths
```

## Key design decisions

- **Content as code.** Lessons, problems and tests live in versioned Python modules so the demo
  needs no CMS. Moves to the database + an admin panel in Phase 1.
- **Answers never reach the browser.** MCQ answers and hidden test cases stay server-side;
  scoring happens on the backend.
- **AI is optional at runtime.** Without a `GROQ_API_KEY` the AI service returns scripted demo
  responses, so a live investor demo never breaks on a rate limit.
- **Provider-agnostic AI.** Groq uses the OpenAI-compatible API, so switching to another
  provider is a config change.
- **Sandbox honesty.** The demo runner limits time and memory and runs inside the backend
  container. Production will use an isolate-based sandbox (Judge0) on separate workers.
