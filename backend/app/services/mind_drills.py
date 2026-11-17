"""Mind drills: generators and graders.

Every drill is built on the server from a seeded random generator, the expected answers stay on the server, and
the grade is computed here. Levels run 1 (gentle) to 5 (brutal) and adapt after every run.
"""

import contextlib
import io
import json
import math
import random
import re
from functools import lru_cache
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parents[1] / "content" / "mind"
MAX_LEVEL = 5

DRILLS = [
    {"id": "number-span", "title": "Number Span", "category": "memory", "minutes": 5,
     "summary": "Digits flash one at a time. Type them back in order. The sequence grows each round.",
     "skill": "Working memory: holding constraints, indexes and edge cases in your head while you code."},
    {"id": "variable-trace", "title": "State Tracker", "category": "memory", "minutes": 6,
     "summary": "Assignments appear one line at a time and vanish. Keep every variable's value in your head.",
     "skill": "Tracing state through code without a debugger, the core of live coding rounds."},
    {"id": "schulte", "title": "Focus Grid", "category": "focus", "minutes": 3,
     "summary": "Click the numbers from 1 upward as fast as you can. Wrong clicks cost points.",
     "skill": "Visual attention and calm, steady speed under a visible clock."},
    {"id": "mental-math", "title": "Engineer's Arithmetic", "category": "speed", "minutes": 3,
     "summary": "Twenty quick questions in two minutes: powers of two, hex, binary, modulo, percentages.",
     "skill": "Fast numeric fluency for complexity estimates, bit tricks and capacity maths."},
    {"id": "code-trace", "title": "Predict the Output", "category": "logic", "minutes": 8,
     "summary": "Read a short Python snippet and type exactly what it prints. No running it.",
     "skill": "Reading code precisely: slicing, aliasing, recursion, ordering and off-by-one traps."},
    {"id": "sequence", "title": "Pattern Finder", "category": "logic", "minutes": 6,
     "summary": "Find the next number. Patterns get layered as you level up.",
     "skill": "Spotting structure fast, the same muscle that finds the pattern behind a DSA problem."},
    {"id": "logic", "title": "Logic Puzzles", "category": "logic", "minutes": 10,
     "summary": "Five hard puzzles of the kind used in screening calls. One answer each, explained after.",
     "skill": "Careful reasoning under pressure without jumping to the first plausible answer."},
    {"id": "estimation", "title": "Back of the Envelope", "category": "speed", "minutes": 8,
     "summary": "Estimate capacity and scale numbers. Scored on how many times off you are.",
     "skill": "System design sizing: requests per second, storage, bandwidth and memory."},
]
DRILL_BY_ID = {d["id"]: d for d in DRILLS}
TIME_LIMITS = {"mental-math": 120}  # seconds; others are untimed or timed by the client


def _clamp(v: float, lo: float = 0, hi: float = 100) -> int:
    return int(round(max(lo, min(hi, v))))


@lru_cache
def content(name: str) -> list[dict]:
    return json.loads((CONTENT_DIR / f"{name}.json").read_text(encoding="utf-8"))


def norm(text) -> str:
    return re.sub(r"\s+", " ", str(text if text is not None else "")).strip()


def to_number(text) -> float | None:
    """Parse '1.5k', '2e6', '3,000', '40 million' style answers."""
    s = str(text if text is not None else "").strip().lower().replace(",", "").replace("_", "")
    if not s:
        return None
    mult = 1.0
    for word, m in (("thousand", 1e3), ("million", 1e6), ("billion", 1e9), ("trillion", 1e12)):
        if s.endswith(word):
            s, mult = s[: -len(word)].strip(), m
            break
    else:
        if s[-1:] in ("k", "m", "b", "t") and s[:-1].replace(".", "", 1).replace("-", "", 1).isdigit():
            s, mult = s[:-1], {"k": 1e3, "m": 1e6, "b": 1e9, "t": 1e12}[s[-1]]
    try:
        return float(s) * mult
    except ValueError:
        return None


def to_int(text) -> int | None:
    n = to_number(text)
    return int(n) if n is not None and float(n).is_integer() else None


# ---------------------------------------------------------------- number span

def gen_number_span(rng: random.Random, level: int) -> dict:
    start = 3 + level  # 4 .. 8 digits
    seqs = []
    for i in range(8):
        length = start + i // 2
        digits = [str(rng.randint(0, 9))]
        while len(digits) < length:
            d = str(rng.randint(0, 9))
            if d != digits[-1]:  # no immediate repeats; they read as a glitch
                digits.append(d)
        seqs.append("".join(digits))
    shown_ms = max(450, 1000 - (level - 1) * 125)
    return {"public": {"rounds": [{"length": len(s), "digits": s} for s in seqs], "shown_ms": shown_ms},
            "answers": seqs}


def grade_number_span(items: list, answers: list) -> dict:
    review, span, correct = [], 0, 0
    for i, expected in enumerate(items):
        given = re.sub(r"\D", "", str(answers[i])) if i < len(answers) and answers[i] is not None else None
        ok = given == expected
        correct += ok
        if ok:
            span = max(span, len(expected))
        review.append({"expected": expected, "given": given, "correct": ok})
        if given is None:
            break
    score = _clamp((span - 3) / 9 * 100) if span else 0
    return {"score": score, "correct": correct, "total": len(items), "review": review,
            "headline": f"Longest sequence: {span} digits" if span else "No sequence recalled yet"}


# ---------------------------------------------------------------- variable trace

def _trace_lines(rng: random.Random, names: list[str], count: int, level: int) -> tuple[list[str], dict]:
    env = {n: rng.randint(1, 9) for n in names}
    lines = [f"{n} = {env[n]}" for n in names]
    while len(lines) < count:
        a = rng.choice(names)
        b = rng.choice([n for n in names if n != a])
        k = rng.randint(2, 9)
        options = [
            (f"{a} = {a} + {k}", lambda: env.update({a: env[a] + k})),
            (f"{a} = {b}", lambda: env.update({a: env[b]})),
            (f"{a} = {a} - {b}", lambda: env.update({a: env[a] - env[b]})),
            (f"{a} += {b}", lambda: env.update({a: env[a] + env[b]})),
        ]
        if level >= 2:
            options.append((f"{a} = {a} * 2", lambda: env.update({a: env[a] * 2})))
            options.append((f"{a}, {b} = {b}, {a}", lambda: env.update({a: env[b], b: env[a]})))
        if level >= 4:
            options.append((f"{a} = {b} % {k}", lambda: env.update({a: env[b] % k})))
            options.append((f"{a} = {a} // 2", lambda: env.update({a: env[a] // 2})))
        text, apply = rng.choice(options)
        if abs(env[a]) > 400:  # keep the numbers in mental range
            text, apply = f"{a} = {k}", (lambda: env.update({a: k}))
        apply()
        lines.append(text)
    return lines, env


def gen_variable_trace(rng: random.Random, level: int) -> dict:
    public, answers = [], []
    pool = ["a", "b", "c", "d"]
    n_vars = 2 if level == 1 else 3 if level <= 3 else 4
    for r in range(6):
        names = pool[:n_vars]
        lines, env = _trace_lines(rng, names, n_vars + 2 + level + r // 2, level)
        ask = rng.choice(names)
        public.append({"lines": lines, "ask": ask})
        answers.append(env[ask])
    shown_ms = max(1400, 3000 - (level - 1) * 400)
    return {"public": {"rounds": public, "shown_ms": shown_ms}, "answers": answers}


def grade_exact_ints(items: list, answers: list, prompts: list[str] | None = None) -> dict:
    review, correct = [], 0
    for i, expected in enumerate(items):
        raw = answers[i] if i < len(answers) else None
        given = to_number(raw)
        ok = given is not None and abs(given - expected) < 1e-9
        correct += ok
        review.append({"expected": expected, "given": raw, "correct": ok,
                       **({"prompt": prompts[i]} if prompts else {})})
    score = _clamp(correct / max(1, len(items)) * 100)
    return {"score": score, "correct": correct, "total": len(items), "review": review,
            "headline": f"{correct} of {len(items)} correct"}


# ---------------------------------------------------------------- focus grid

def gen_schulte(rng: random.Random, level: int) -> dict:
    size = 4 if level == 1 else 5 if level <= 3 else 6
    cells = list(range(1, size * size + 1))
    rng.shuffle(cells)
    return {"public": {"size": size, "cells": cells}, "answers": cells}


def grade_schulte(cells: list, answer: dict, elapsed_ms: int) -> dict:
    """`answer` = {clicks: [cell index, ...], time_ms}. Only clicks on the next expected number advance."""
    clicks = answer.get("clicks") if isinstance(answer, dict) else None
    clicks = clicks if isinstance(clicks, list) else []
    expected, mistakes = 1, 0
    for idx in clicks:
        if not isinstance(idx, int) or not 0 <= idx < len(cells):
            mistakes += 1
            continue
        if cells[idx] == expected:
            expected += 1
        else:
            mistakes += 1
    found = expected - 1
    n = len(cells)
    client_ms = answer.get("time_ms") if isinstance(answer, dict) else None
    time_ms = int(client_ms) if isinstance(client_ms, (int, float)) and client_ms > 0 else elapsed_ms
    time_ms = max(time_ms, n * 150)  # nobody clicks faster than ~150ms per cell
    if found < n:
        score = _clamp(found / n * 40 - mistakes * 3)
    else:
        per_cell = time_ms / 1000 / n
        score = _clamp((3.0 - per_cell) / (3.0 - 0.75) * 100 - mistakes * 3)
    return {"score": score, "correct": found, "total": n, "time_ms": time_ms, "mistakes": mistakes, "review": [],
            "headline": f"{found}/{n} found in {time_ms / 1000:.1f}s, {mistakes} wrong click{'s' * (mistakes != 1)}"}


# ---------------------------------------------------------------- mental math

def _math_question(rng: random.Random, level: int) -> tuple[str, float]:
    kinds = ["mul", "pow2", "mod", "pct", "sub"]
    if level >= 2:
        kinds += ["bin", "hex", "div"]
    if level >= 3:
        kinds += ["log2", "and", "xor", "mul2"]
    if level >= 4:
        kinds += ["shift", "hex2", "sq"]
    kind = rng.choice(kinds)
    if kind == "mul":
        a, b = rng.randint(12, 19 + level * 10), rng.randint(3, 9)
        return f"{a} × {b}", a * b
    if kind == "mul2":
        a, b = rng.randint(11, 39), rng.randint(11, 29)
        return f"{a} × {b}", a * b
    if kind == "sub":
        a = rng.randint(200, 900 + level * 300)
        b = rng.randint(57, a - 1)
        return f"{a} − {b}", a - b
    if kind == "pow2":
        n = rng.randint(5, 10 + level * 2)
        return f"2^{n}", 2 ** n
    if kind == "log2":
        n = rng.randint(6, 20)
        return f"log₂({2 ** n:,})", n
    if kind == "mod":
        a, m = rng.randint(50, 200 + level * 150), rng.randint(3, 13)
        return f"{a} mod {m}", a % m
    if kind == "div":
        b = rng.randint(3, 12)
        a = b * rng.randint(11, 60) + rng.randint(0, b - 1)
        return f"{a} // {b}", a // b
    if kind == "pct":
        p = rng.choice([5, 10, 15, 20, 25, 30, 40, 60, 75, 120])
        base = rng.choice([40, 80, 120, 160, 240, 360, 480, 640, 900, 1200])
        return f"{p}% of {base}", p * base / 100
    if kind == "bin":
        n = rng.randint(5, 31 if level < 4 else 255)
        return f"0b{n:b} in decimal", n
    if kind == "hex":
        n = rng.randint(16, 255)
        return f"0x{n:X} in decimal", n
    if kind == "hex2":
        n = rng.randint(256, 4095)
        return f"0x{n:X} in decimal", n
    if kind == "and":
        a, b = rng.randint(4, 31), rng.randint(4, 31)
        return f"{a} & {b}", a & b
    if kind == "xor":
        a, b = rng.randint(4, 31), rng.randint(4, 31)
        return f"{a} ^ {b}", a ^ b
    if kind == "shift":
        a, s = rng.randint(3, 25), rng.randint(2, 5)
        return (f"{a} << {s}", a << s) if rng.random() < 0.5 else (f"{a * 2 ** s + rng.randint(0, 2 ** s - 1)} >> {s}",
                                                                   None)
    a = rng.randint(13, 32 + level * 6)
    return f"{a}²", a * a


def gen_mental_math(rng: random.Random, level: int) -> dict:
    prompts, answers = [], []
    while len(prompts) < 20:
        q, a = _math_question(rng, level)
        if a is None:  # right shift: work the answer out from the prompt
            left, s = q.split(" >> ")
            a = int(left) >> int(s)
        if q in prompts:
            continue
        prompts.append(q)
        answers.append(int(a) if float(a).is_integer() else a)
    return {"public": {"questions": prompts, "time_limit": TIME_LIMITS["mental-math"]}, "answers": answers,
            "prompts": prompts}


def grade_mental_math(items: list, answers: list, prompts: list[str], elapsed_ms: int) -> dict:
    result = grade_exact_ints(items, answers, prompts)
    # Answers sent long after the clock ran out don't count (a little slack for the network)
    if elapsed_ms > (TIME_LIMITS["mental-math"] + 15) * 1000:
        result["score"] = _clamp(result["score"] * TIME_LIMITS["mental-math"] * 1000 / elapsed_ms)
        result["late"] = True
    return result


# ---------------------------------------------------------------- predict the output

def _snippet(rng: random.Random, level: int) -> str:
    r = rng.randint
    words = ["queue", "stack", "heap", "graph", "node", "tree", "array", "cache", "token", "index", "table", "query"]
    templates = [
        lambda: f"total = 0\nfor i in range({r(1, 4)}, {r(10, 20)}, {r(2, 4)}):\n    total += i\nprint(total)",
        lambda: f"nums = {[r(1, 30) for _ in range(7)]}\nprint(nums[{r(1, 2)}:{r(5, 7)}:{r(2, 3)}])",
        lambda: f"s = \"{rng.choice(words)}\"\nprint(s[::-1][:{r(2, 4)}] + s[{r(0, 3)}])",
        lambda: f"print([x * x for x in range({r(6, 12)}) if x % {r(2, 3)} == {r(0, 1)}])",
        lambda: f"words = \"{' '.join(rng.sample(words, 4))}\".split()\nprint(\"-\".join(w[{r(0, 2)}] for w in words))",
        lambda: f"a = [{r(1, 9)}, {r(1, 9)}]\nb = a\nb.append({r(1, 9)})\na = a + [{r(1, 9)}]\nprint(len(a), len(b), a[-1] == b[-1])",
    ]
    if level >= 2:
        templates += [
            lambda: f"count = 0\nfor i in range({r(3, 6)}):\n    for j in range(i, {r(4, 7)}):\n        count += 1\nprint(count)",
            lambda: f"vals = {[r(1, 9) for _ in range(5)]}\nprint(sum(i * v for i, v in enumerate(vals)))",
            lambda: (f"counts = {{}}\nfor ch in \"{''.join(rng.choice('abcab') for _ in range(r(6, 9)))}\":\n"
                     f"    counts[ch] = counts.get(ch, 0) + 1\nprint(max(counts, key=counts.get), len(counts))"),
            lambda: f"x = {r(10, 40)}\nwhile x > {r(1, 5)}:\n    x = x // 2 if x % 2 == 0 else x - 3\nprint(x)",
        ]
    if level >= 3:
        templates += [
            lambda: f"def f(n):\n    return n if n < 2 else f(n - 1) + f(n - 2)\nprint(f({r(5, 9)}))",
            lambda: (f"words = {rng.sample(words, 5)}\n"
                     f"print(sorted(words, key=lambda w: (len(w), w[-1]))[{r(0, 2)}])"),
            lambda: f"def add(x, items=[]):\n    items.append(x)\n    return items\nadd({r(1, 5)})\nprint(add({r(6, 9)}))",
            lambda: f"n = {r(6, 12)}\nsteps = 0\nwhile n != 1:\n    n = n // 2 if n % 2 == 0 else 3 * n + 1\n    steps += 1\nprint(steps)",
        ]
    if level >= 4:
        templates += [
            lambda: f"grid = [[0] * 3] * 3\ngrid[0][{r(0, 2)}] = {r(1, 9)}\nprint(sum(map(sum, grid)))",
            lambda: f"fs = [lambda: i for i in range({r(3, 6)})]\nprint([f() for f in fs][{r(0, 2)}])",
            lambda: f"d = {{i: i * i for i in range({r(4, 7)})}}\nprint(sum(k for k in d if d[k] % 2), list(d)[-1])",
            lambda: f"t = ({r(1, 9)}, [{r(1, 9)}, {r(1, 9)}])\nt[1].append({r(1, 9)})\nprint(len(t[1]), t[1][-1] * t[0])",
        ]
    if level >= 5:
        templates += [
            lambda: f"x = {r(2, 5)}\ndef g():\n    x = {r(6, 9)}\n    def h():\n        return x * 2\n    return h()\nprint(g() + x)",
            lambda: f"print(sorted([{', '.join(str(r(-9, 9)) for _ in range(6))}], key=abs)[:3])",
            lambda: f"s = \"{rng.choice(words)}{rng.choice(words)}\"\nprint(s.find(\"{rng.choice('aeiou')}\"), s.count(\"e\"))",
        ]
    return rng.choice(templates)()


def run_snippet(code: str) -> str:
    """Run generated code (never user input) and capture what it prints."""
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        exec(compile(code, "<snippet>", "exec"), {"__builtins__": __builtins__})  # noqa: S102 - generated code only
    return out.getvalue().strip()


def gen_code_trace(rng: random.Random, level: int) -> dict:
    snippets, outputs = [], []
    while len(snippets) < 6:
        code = _snippet(rng, level)
        if code in snippets:
            continue
        snippets.append(code)
        outputs.append(run_snippet(code))
    return {"public": {"snippets": snippets}, "answers": outputs}


def _same_output(given, expected: str) -> bool:
    g, e = norm(given), norm(expected)
    if g == e:
        return True
    # Forgive quote style and spacing after commas: ['a', 'b'] == ["a","b"]
    loose = lambda s: s.replace('"', "'").replace(", ", ",")  # noqa: E731
    return loose(g) == loose(e)


def grade_code_trace(items: list, answers: list, snippets: list[str]) -> dict:
    review, correct = [], 0
    for i, expected in enumerate(items):
        given = answers[i] if i < len(answers) else None
        ok = given is not None and _same_output(given, expected)
        correct += ok
        review.append({"prompt": snippets[i], "expected": expected, "given": given, "correct": ok})
    return {"score": _clamp(correct / len(items) * 100), "correct": correct, "total": len(items), "review": review,
            "headline": f"{correct} of {len(items)} outputs exact"}


# ---------------------------------------------------------------- pattern finder

def _sequence(rng: random.Random, level: int) -> tuple[list[int], int, str]:
    r = rng.randint
    kinds = ["arith", "geom", "squares"]
    if level >= 2:
        kinds += ["fib", "alt", "diff"]
    if level >= 3:
        kinds += ["tri", "pow_minus", "interleave", "mul_add"]
    if level >= 4:
        kinds += ["second_diff", "primes", "cube"]
    kind = rng.choice(kinds)
    if kind == "arith":
        a, d = r(-20, 40), rng.choice([-7, -3, 4, 6, 9, 11, 13])
        s = [a + d * i for i in range(6)]
        return s[:5], s[5], f"Add {d} each time."
    if kind == "geom":
        a, k = r(1, 5), rng.choice([2, 3, -2])
        s = [a * k ** i for i in range(6)]
        return s[:5], s[5], f"Multiply by {k} each time."
    if kind == "squares":
        c, o = r(-3, 5), r(1, 4)
        s = [(i + o) ** 2 + c for i in range(6)]
        return s[:5], s[5], f"(n + {o})² {'+' if c >= 0 else '-'} {abs(c)}."
    if kind == "fib":
        a, b = r(1, 5), r(2, 7)
        s = [a, b]
        while len(s) < 6:
            s.append(s[-1] + s[-2])
        return s[:5], s[5], "Each term is the sum of the two before it."
    if kind == "alt":
        a, d1, d2 = r(1, 20), r(2, 9), -r(1, 5)
        s = [a]
        for i in range(5):
            s.append(s[-1] + (d1 if i % 2 == 0 else d2))
        return s[:5], s[5], f"Alternate +{d1} and {d2}."
    if kind == "diff":
        a, d = r(1, 10), r(1, 4)
        s = [a]
        for i in range(5):
            s.append(s[-1] + d * (i + 1))
        return s[:5], s[5], f"The gap grows by {d} each step."
    if kind == "tri":
        o = r(1, 5)
        s = [(i + o) * (i + o + 1) // 2 for i in range(6)]
        return s[:5], s[5], "Triangular numbers: n(n+1)/2."
    if kind == "pow_minus":
        c = rng.choice([1, -1, 3])
        s = [2 ** (i + 1) - c for i in range(6)]
        return s[:5], s[5], f"2^n {'-' if c > 0 else '+'} {abs(c)}."
    if kind == "interleave":
        a, b, d1, d2 = r(1, 9), r(20, 40), r(2, 5), -r(2, 5)
        s = [a + d1 * (i // 2) if i % 2 == 0 else b + d2 * (i // 2) for i in range(7)]
        return s[:6], s[6], f"Two sequences interleaved: +{d1} on odd positions, {d2} on even ones."
    if kind == "mul_add":
        a, k, c = r(1, 4), 2, r(1, 3)
        s = [a]
        for _ in range(5):
            s.append(s[-1] * k + c)
        return s[:5], s[5], f"Double it, then add {c}."
    if kind == "second_diff":
        a, b, c = r(1, 3), r(-2, 4), r(0, 9)
        s = [a * i * i + b * i + c for i in range(6)]
        return s[:5], s[5], f"The gaps themselves grow by {2 * a} (a quadratic)."
    if kind == "primes":
        primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]
        o, c = r(0, 5), r(0, 3)
        s = [p + c for p in primes[o:o + 6]]
        return s[:5], s[5], f"Consecutive primes{f' plus {c}' if c else ''}."
    o = r(1, 3)
    s = [(i + o) ** 3 for i in range(6)]
    return s[:5], s[5], "Cubes."


def gen_sequence(rng: random.Random, level: int) -> dict:
    public, answers, explain = [], [], []
    while len(public) < 10:
        shown, nxt, why = _sequence(rng, level)
        if shown in public:
            continue
        public.append(shown)
        answers.append(nxt)
        explain.append(why)
    return {"public": {"sequences": public}, "answers": answers, "explain": explain}


# ---------------------------------------------------------------- logic puzzles + estimation (written content)

def gen_logic(rng: random.Random, level: int, recent: set[str]) -> dict:
    pool = content("logic")
    fresh = [p for p in pool if p["id"] not in recent] or pool
    # Harder puzzles appear more as the level rises
    weighted = sorted(fresh, key=lambda p: abs(p.get("difficulty", 3) - level) + rng.random() * 1.5)
    chosen = weighted[:5]
    rng.shuffle(chosen)
    return {"public": {"puzzles": [{"id": p["id"], "title": p["title"], "prompt": p["prompt"],
                                    "options": p["options"]} for p in chosen]},
            "answers": [p["answer"] for p in chosen], "ids": [p["id"] for p in chosen]}


def grade_logic(items: list, answers: list, ids: list[str]) -> dict:
    by_id = {p["id"]: p for p in content("logic")}
    review, correct = [], 0
    for i, expected in enumerate(items):
        given = answers[i] if i < len(answers) else None
        ok = given == expected
        correct += ok
        p = by_id[ids[i]]
        review.append({"prompt": p["title"], "expected": p["options"][expected],
                       "given": p["options"][given] if isinstance(given, int) and 0 <= given < len(p["options"]) else None,
                       "correct": ok, "why": p["why"]})
    return {"score": _clamp(correct / len(items) * 100), "correct": correct, "total": len(items), "review": review,
            "headline": f"{correct} of {len(items)} solved"}


def gen_estimation(rng: random.Random, level: int, recent: set[str]) -> dict:
    pool = content("estimation")
    fresh = [p for p in pool if p["id"] not in recent] or pool
    chosen = rng.sample(fresh, min(5, len(fresh)))
    return {"public": {"questions": [{"id": p["id"], "prompt": p["prompt"], "unit": p["unit"]} for p in chosen]},
            "answers": [p["answer"] for p in chosen], "ids": [p["id"] for p in chosen]}


def estimate_points(given: float | None, true: float) -> int:
    """100 for exact, about 85 within 2x, 50 at 10x off, 0 at 100x off."""
    if given is None or given <= 0 or true <= 0:
        return 0
    return _clamp(100 - 50 * abs(math.log10(given / true)))


def grade_estimation(items: list, answers: list, ids: list[str]) -> dict:
    by_id = {p["id"]: p for p in content("estimation")}
    review, points = [], []
    for i, true in enumerate(items):
        raw = answers[i] if i < len(answers) else None
        pts = estimate_points(to_number(raw), true)
        points.append(pts)
        p = by_id[ids[i]]
        review.append({"prompt": p["prompt"], "expected": f"{true:,.6g} {p['unit']}", "given": raw,
                       "correct": pts >= 70, "points": pts, "why": p["why"]})
    score = _clamp(sum(points) / len(points))
    return {"score": score, "correct": sum(p >= 70 for p in points), "total": len(points), "review": review,
            "headline": f"Average accuracy {score}/100"}


# ---------------------------------------------------------------- dispatch

def generate(drill: str, seed: str, level: int, recent: set[str] | None = None) -> dict:
    rng = random.Random(seed)
    level = max(1, min(MAX_LEVEL, level))
    recent = recent or set()
    return {
        "number-span": lambda: gen_number_span(rng, level),
        "variable-trace": lambda: gen_variable_trace(rng, level),
        "schulte": lambda: gen_schulte(rng, level),
        "mental-math": lambda: gen_mental_math(rng, level),
        "code-trace": lambda: gen_code_trace(rng, level),
        "sequence": lambda: gen_sequence(rng, level),
        "logic": lambda: gen_logic(rng, level, recent),
        "estimation": lambda: gen_estimation(rng, level, recent),
    }[drill]()


def grade(drill: str, stored: dict, answer, elapsed_ms: int) -> dict:
    """`stored` is what generate() returned (kept on the session). `answer` is the client's payload."""
    answers = answer if isinstance(answer, list) else []
    items = stored["answers"]
    if drill == "number-span":
        return grade_number_span(items, answers)
    if drill == "variable-trace":
        prompts = [f"{chr(10).join(r['lines'])}\n\n{r['ask']} = ?" for r in stored["public"]["rounds"]]
        return grade_exact_ints(items, answers, prompts)
    if drill == "schulte":
        return grade_schulte(items, answer if isinstance(answer, dict) else {}, elapsed_ms)
    if drill == "mental-math":
        return grade_mental_math(items, answers, stored["prompts"], elapsed_ms)
    if drill == "code-trace":
        return grade_code_trace(items, answers, stored["public"]["snippets"])
    if drill == "sequence":
        result = grade_exact_ints(items, answers, [", ".join(map(str, s)) + ", ?" for s in stored["public"]["sequences"]])
        for row, why in zip(result["review"], stored["explain"]):
            row["why"] = why
        return result
    if drill == "logic":
        return grade_logic(items, answers, stored["ids"])
    return grade_estimation(items, answers, stored["ids"])


def next_level(level: int, score: int) -> int:
    if score >= 80:
        return min(MAX_LEVEL, level + 1)
    if score < 40:
        return max(1, level - 1)
    return level
