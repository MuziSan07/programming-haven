# Programming Haven

> **Get vetted. Get hired.** AI-powered preparation for the screening pipelines of Toptal, Turing,
> Lemon.io, A.Team, Braintrust and remote jobs in the US, UK and Europe.

Programming Haven trains developers for **every stage** of a remote-talent vetting pipeline in one
place, and tells them when they're ready to apply.

| Module | What it does |
|---|---|
| **Language Paths** | 152 Duolingo-style lessons across Python, JavaScript, TypeScript, Java, C++ and Go, Basic → Expert: concepts, interview-style questions, fill-in-the-blanks and real code exercises run in each language, with an AI tutor beside every step |
| **Question Bank** | 362 interview questions over 24 topics (languages, CS fundamentals, system design, web, cloud, ML, behavioral…), MCQs with explanations and open questions graded by AI against model answers |
| **DSA Track** | 78 problems (Easy → Expert, company-tagged), Monaco editor, Python/JavaScript execution against hidden tests, AI hints, AI code review, and a playful **AI coding companion** that pops in with analogies and mind games |
| **Proctored Mock Tests** | 20 timed assessments, most Hard/Expert and company-style (Google, Amazon, Microsoft, Meta, Toptal, Turing, Codility…), with face detection, tab/paste monitoring and an Integrity Report |
| **Take-Home Projects** | 40 realistic take-homes across 13 niches with rubrics; submissions are reviewed by AI criterion by criterion |
| **AI Interviews** | Animated interviewer personas (Aria / Alex): technical, **1:1 live coding with camera + screen share**, HR, English and system design, by voice, with a scored hiring-panel report. The interviewer can see you through the camera |
| **Test Your Interviewer** | Camera check: ask the interviewer about your outfit, lighting, background and framing before the real interview |
| **Focus time tracking** | Active time per lesson/problem/interview; the clock pauses when you switch tabs |
| **Admin console** | Edit every lesson, problem, test, question, project, persona and the interviewer knowledge base in the browser, with validation that runs the code |
| **Company Prep Paths** | Stage-by-stage paths mirroring how Toptal, Turing, Lemon.io, A.Team, Braintrust and remote US/UK/EU companies screen |
| **Readiness Score** | One number built from lessons, problems, tests and interviews |

Docs: [Product spec](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md)

## Tech stack

- **Frontend:** Next.js 16 (App Router, JavaScript), Tailwind CSS 4, Monaco, MediaPipe face detection, PWA
- **Backend:** FastAPI, SQLAlchemy 2, SQLite (dev) / PostgreSQL (Docker)
- **AI:** Groq (`openai/gpt-oss-120b`, `gpt-oss-20b`, Whisper, Orpheus TTS) → local Ollama fallback → scripted offline mode

## Quick start (local development)

Prerequisites: Python 3.12+, Node.js 20+, and optionally Ollama.

**1. Configure:** copy `.env.example` to `.env` in the repo root and add your Groq key.

**2. Backend** (http://localhost:8000, API docs at `/docs`):

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

**3. Frontend** (http://localhost:3000):

```bash
cd frontend
npm install
npm run dev
```

**4. Tests:**

```bash
cd backend && pytest
```

## Content & admin

All content lives in the database and is seeded from JSON bundles in
`backend/app/content/seed/` (format: [SCHEMA.md](backend/app/content/seed/SCHEMA.md)). Edits made
in the admin console are kept; seed updates never overwrite them.

```bash
cd backend
python -m app.content.validate          # checks every item and runs every code solution
python -m app.make_admin you@example.com
```

Or set `ADMIN_EMAILS=you@example.com` in `.env` so that account becomes admin on sign-up. Admins
see **Admin** in the sidebar.

Lesson exercises can run Python, JavaScript, Java, C++ and Go when those toolchains are installed
on the server (the Docker image currently ships Python and Node.js).

## Run everything with Docker

```bash
docker compose up --build
```

This starts PostgreSQL, the API and the web app on the same ports as above. The backend reads your
Groq key from the root `.env`, and reaches Ollama on the host as a fallback.

## Investor demo script (≈8 minutes)

1. **Landing page:** the problem (multi-stage vetting) and the pitch.
2. **Register:** pick a target role, land on the dashboard and its Readiness Score.
3. **Language Path:** do one Python lesson; get an answer wrong and click **Ask Haven** to show the AI tutor.
4. **DSA:** open *Two Sum*, run the starter code (Wrong Answer), get a **Nudge** hint, solve it,
   **Submit** (Accepted, XP), then **Review my code**.
5. **Mock test:** start the *Python Developer Assessment*, enable the camera and go fullscreen, switch tabs
   once to trigger a flag, submit, and show the **Integrity Report**.
6. **AI interview:** run an English or Technical round by voice, then **End & get report**.
7. **Company Paths:** open *Toptal* to show how every stage maps to practice, and how the Readiness Score moved.

> Proctoring and voice need camera/microphone permission. Use Chrome or Edge on `localhost`.

## AI configuration

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | — | Enables live AI. Without it the app runs in offline demo mode |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Interviewer, grading, tutor, code review |
| `GROQ_FAST_MODEL` | `openai/gpt-oss-20b` | Fast DSA hints |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | Speech-to-text for voice answers |
| `GROQ_TTS_MODEL` / `GROQ_TTS_VOICE` | `canopylabs/orpheus-v1-english` / `troy` | Neural interviewer voice (falls back to the browser voice) |
| `GROQ_VISION_MODEL` | `qwen/qwen3.8-27b` | Lets the interviewer see camera and screen frames |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `qwen2.5-coder:latest` | Local fallback when Groq is unavailable |

> The Orpheus voice requires accepting its terms once in the Groq console playground.

## Project structure

```
backend/   FastAPI app: routers, services (AI, code runner, scoring), content, tests
frontend/  Next.js app: (app) pages, components, hooks (proctoring, voice)
docs/      Product spec, architecture, roadmap
```

## Security notes

- Code execution is demo-grade (subprocess + time/memory limits, unprivileged container user).
  Production moves it to an isolate-based sandbox (Judge0) on separate workers. See the roadmap.
- MCQ answers and hidden test cases never leave the server.
- Set a strong `JWT_SECRET` before deploying anywhere shared.
