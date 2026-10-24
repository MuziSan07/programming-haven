# Programming Haven — Product Spec

> **Get vetted. Get hired.** The AI-powered platform that prepares developers for the
> screening pipelines of elite remote-talent networks (Toptal, Turing, Lemon.io, A.Team,
> Braintrust) and remote jobs at US, UK and European companies.

---

## 1. The problem

Elite remote networks accept only a small fraction of applicants. Their vetting is a
multi-stage pipeline, and most developers fail at a stage they never practised for:

| Stage | What it tests | Where people prepare today |
|---|---|---|
| English proficiency | Spoken & written communication | Generic language apps |
| DSA / timed coding test | Algorithms under time pressure (Codility, HackerRank style) | LeetCode, NeetCode |
| Skill-based task | Depth in a stack (frontend, backend, AI, mobile…) | Scattered courses |
| Take-home project | Real-world code quality | Nothing structured |
| Live 1:1 coding | Thinking aloud with an engineer watching | Pramp, friends |
| Technical interview | Architecture, trade-offs, experience | YouTube |
| HR / culture round | Soft skills, remote readiness | Nothing |

Candidates juggle 6–8 tools, none of which reflects the real pipeline end to end, and none
of which tells them **"you are ready to apply."**

## 2. The solution

One platform that covers **every stage of the pipeline**, with an AI coach at each step and
a **Readiness Score** that tells candidates when to apply.

### Core modules

1. **Language Paths** — Duolingo-style bite-sized lessons (Python, JavaScript, …) from basics
   to advanced, with XP, streaks and an AI tutor that explains every mistake.
2. **DSA Track** — pattern-based roadmap (arrays, two pointers, sliding window, trees,
   graphs, DP…), in-browser editor, real code execution against hidden tests, and
   **progressive AI hints** that guide without spoiling.
3. **Skill Tracks** — Full Stack, Frontend, Backend, Mobile, AI/ML, Data Science: milestone
   roadmaps with hands-on projects.
4. **English Proficiency** — AI voice interviews that score fluency, grammar and clarity.
5. **Proctored Mock Tests** — timed, Codility-style assessments with webcam face detection,
   tab-switch / paste / fullscreen monitoring and an **Integrity Report**.
6. **Take-Home Projects** — realistic assignments reviewed by AI against a senior-engineer
   rubric.
7. **AI Mock Interviews** — a talking AI avatar runs technical, HR and English rounds by
   voice, then produces a scored feedback report.
8. **Company Prep Paths** — "Prepare for Turing", "Prepare for Toptal"…: a guided path that
   mirrors each network's typical screening stages and links each stage to the right module.

### The differentiator

Competitors cover one stage. Programming Haven covers **the entire vetting pipeline**, and
its Company Prep Paths turn "learn to code" into "get accepted at a specific network."

## 3. Target users

- **Primary:** mid-level developers in emerging tech markets (South Asia, LATAM, Africa,
  Eastern Europe) targeting remote USD/GBP/EUR income.
- **Secondary:** junior developers and bootcamp grads; senior developers rusty at interviews.
- **Future B2B:** talent networks and agencies using our proctored assessments to pre-screen.

## 4. Business model

| Tier | Price (indicative) | Includes |
|---|---|---|
| Free | $0 | Language Paths, limited DSA, 1 mock interview / month |
| Pro | $15–25 / month | Unlimited DSA + AI hints, proctored tests, Company Paths, 10 interviews / month |
| Premium | $40–60 / month | Video avatar interviews, take-home reviews, priority AI |
| B2B | Per assessment | White-label proctored assessments for recruiters & networks |

## 5. MVP scope (investor demo)

Built on a $0 budget: Groq free API + local machine, packaged with Docker so it can be deployed
to any cloud on day one.

- [x] Accounts, dashboard, XP, streaks, Readiness Score
- [x] Language Path (Python) with lesson player + AI tutor
- [x] DSA Track with Monaco editor, code execution (Python, JavaScript), AI hints & review
- [x] Proctored mock test with webcam face detection & Integrity Report
- [x] AI Mock Interview: talking avatar, voice in (Whisper) / voice out, feedback report
- [x] Company Prep Paths (Turing, Toptal, Lemon.io, A.Team, Braintrust, Remote US/UK/EU)

See [ROADMAP.md](ROADMAP.md) for what comes after funding and [ARCHITECTURE.md](ARCHITECTURE.md)
for the technical design.

## 6. Success metrics

- Activation: % of signups completing first lesson or problem in 24h
- Weekly active learners, streak retention (D7 / D30)
- Mock interviews and tests completed per user
- **Outcome metric:** users reporting acceptance at a network or remote offer
