# Seed content schema

Every `*.json` file under `backend/app/content/seed/` is a **bundle**: an object whose keys are
kind names (plural) mapping to lists of items. A bundle may hold several kinds.

```json
{ "lessons": [ ... ], "problems": [ ... ], "tests": [ ... ] }
```

Keys: `tracks`, `lessons`, `problems`, `tests`, `questions`, `projects`, `knowledge`, `personas`.
Items are ordered by file path, then position in the file. IDs must be unique per kind across
**all** files. Use lowercase-kebab-case IDs with a prefix that matches your area (e.g. `py-`, `js-`).

**Validate after every edit** (from `backend/`):

```bash
.venv/Scripts/python.exe -m app.content.validate seed/path/to/your-file.json
```

Paths are relative to `backend/app/content/` or absolute. The validator checks structure and
**runs every code solution**; content is only done when it prints `All content valid.`

Writing rules for all content:

- Original wording only. Don't copy text from LeetCode, HackerRank, books or company tests.
  You may cover the same classic topics and algorithms.
- `companies` tags mean "this topic or problem type is widely reported in this company's interviews".
  Use well-known names (Google, Microsoft, Amazon, Meta, Apple, Netflix, Uber, Bloomberg, Adobe,
  Oracle, Toptal, Turing). Never claim a question is an actual leaked company question.
- Interview-realistic, technically correct, no trick questions with ambiguous answers.
- Use Markdown-style inline code with backticks in text fields. Code fields are plain code.

---

## track

```json
{"id": "python", "title": "Python", "icon": "🐍", "color": "#3b82f6", "available": true,
 "description": "One sentence.",
 "units": [{"id": "py-u1", "title": "Foundations", "description": "Short", "level": "Basic"}]}
```

`level` ∈ `Basic | Intermediate | Advanced | Expert`. Lessons attach to units via `unit_id`.

## lesson

```json
{"id": "py-variables", "track_id": "python", "unit_id": "py-u1", "title": "Variables & Types",
 "minutes": 5, "steps": [ ...steps... ]}
```

Step types (5–8 steps per lesson; every lesson should have ≥ 1 `concept`, ≥ 2 `mcq`, and a `code`
step whenever the track language is runnable):

```json
{"type": "concept", "title": "Heading", "body": "Explanation with `inline code`.", "code": "optional example"}
{"type": "mcq", "question": "What does this print?", "code": "optional snippet",
 "options": ["A", "B", "C", "D"], "answer": 1, "explanation": "Why B is right (and why the others are wrong)."}
{"type": "fill", "prompt": "Instruction", "code": "x = ____(\"42\")", "answer": ["int"], "explanation": "..."}
{"type": "code", "language": "python", "prompt": "Task description", "starter": "# starter code\n",
 "solution": "print(42)\n", "expected_output": "42", "hint": "optional"}
```

- `answer` for mcq is the 0-based index. `fill.answer` is a list of accepted exact strings.
- `code` steps are graded by comparing **stdout** (trimmed) with `expected_output`. The `solution`
  must print exactly that. Runnable languages: `python`, `javascript`, `java`, `cpp`, `go`.
  - Java: the class must be `public class Main` with `main`.
  - Go: `package main` with `func main()`. No external modules.
  - C++: standard library only, C++17.
- Do not read stdin in lesson code steps.

## problem (DSA)

Function-call problems graded by a harness in Python and JavaScript.

```json
{"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy", "pattern": "Arrays & Hashing",
 "companies": ["Google", "Amazon"],
 "description": "Paragraphs separated by \\n\\n. Use `backticks` for identifiers.",
 "examples": [{"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "optional"}],
 "constraints": ["2 <= nums.length <= 10^4"],
 "function": {"python": "two_sum", "javascript": "twoSum"},
 "starter": {"python": "def two_sum(nums, target):\n    # Write your solution here\n    pass\n",
             "javascript": "function twoSum(nums, target) {\n  // Write your solution here\n}\n"},
 "compare": "exact",
 "complexity": "O(n) time, O(n) space",
 "hints": ["gentle nudge", "name the technique", "step-by-step outline"],
 "tests": [{"input": [[2,7,11,15], 9], "output": [0,1]},
           {"input": [[3,3], 6], "output": [0,1], "hidden": true}],
 "solutions": {"python": "def two_sum(nums, target):\n    ...\n", "javascript": "function twoSum(nums, target) {...}\n"}}
```

- `difficulty` ∈ `Easy | Medium | Hard | Expert`.
- `tests[].input` is the **list of positional arguments**. JSON values only (lists, numbers, strings,
  booleans, null). ≥ 2 visible and ≥ 3 hidden tests; include edge cases and at least one larger input.
- `compare`: `exact` (default), `unordered` (top-level list order ignored), `nested_unordered`
  (order ignored at both levels, e.g. grouping problems).
- Trees, linked lists and graphs are passed as plain JSON (level-order arrays with `null`, arrays,
  edge lists or adjacency lists). Describe the encoding in the description; the function converts
  internally if needed.
- Return values must be JSON-serialisable. Python and JS must produce identical JSON for the same
  answer (e.g. return lists, not tuples or sets; use `null`/`None` consistently).
- `solutions.python` is required; `solutions.javascript` strongly encouraged. Both are run on all tests.
- Python solutions may use the standard library (`collections`, `heapq`, `bisect`, `functools`...).

## test (mock assessment)

```json
{"id": "google-style-oa", "title": "Google-style Online Assessment", "style": "Google-style",
 "difficulty": "Hard", "description": "One or two sentences.", "duration_minutes": 90, "pass_mark": 70,
 "languages": ["python", "javascript"],
 "mcq": [{"id": "g1", "question": "...", "code": "optional", "options": ["...", "..."], "answer": 0,
          "explanation": "shown after submission"}],
 "coding": ["problem-slug-1", "problem-slug-2"]}
```

- `mcq[].id` unique within the test. `coding` lists problem slugs that exist in any seed file.
- `languages` is `[]` for MCQ-only tests.

## question (interview question bank)

```json
{"id": "q-py-gil-1", "topic": "Python", "level": "Advanced", "type": "mcq",
 "question": "...", "code": "optional", "options": ["...", "..."], "answer": 2,
 "explanation": "Why.", "tags": ["concurrency"], "companies": ["Google"]}
{"id": "q-sd-rate-limiter", "topic": "System Design", "level": "Expert", "type": "open",
 "question": "How would you design a distributed rate limiter?",
 "model_answer": "A strong, structured answer (5-12 sentences or bullet-style lines).",
 "explanation": "What interviewers look for / common pitfalls.", "tags": ["scalability"], "companies": ["Stripe"]}
```

`type` ∈ `mcq | open`. `level` ∈ `Basic | Intermediate | Advanced | Expert`.

## project (take-home)

```json
{"id": "proj-fe-dashboard", "title": "Real-time Crypto Dashboard", "niche": "Frontend",
 "level": "Intermediate", "hours": 8, "summary": "One sentence.",
 "brief": "The scenario as a client/company would write it (2-4 paragraphs, \\n\\n separated).",
 "requirements": ["Must-have 1", "..."], "stretch": ["Nice-to-have"],
 "deliverables": ["Public Git repo", "README with setup and decisions"],
 "tech": ["React", "TypeScript"],
 "rubric": [{"criterion": "Correctness", "weight": 30, "description": "What graders check"}],
 "companies": ["Toptal"]}
```

Rubric weights must sum to 100.

## knowledge (interviewer knowledge base)

```json
{"id": "kb-star-method", "title": "STAR method", "tags": ["behavioral"], "content": "Plain text the AI interviewer can use."}
```

## persona (AI interviewer)

```json
{"id": "aria", "name": "Aria", "gender": "female", "title": "Senior Engineering Manager", "voice": "autumn",
 "browser_voice": "female", "personality": "...",
 "appearance": {"skin": "#f1c7a3", "hair": "#3b2416", "hair_style": "long", "outfit": "#7c5cff", "accent": "#22d3ee", "lips": "#c45a6a"}}
```
