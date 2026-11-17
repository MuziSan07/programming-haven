"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Clock, SkipForward } from "lucide-react";
import { Button, Card, Progress, cx } from "@/components/ui";

/** Milliseconds from a monotonic clock (module-level so it never runs during render). */
const clock = () => performance.now();

const input =
  "h-11 w-full rounded-xl border border-line bg-surface-2 px-3 font-mono text-base outline-none transition focus:border-brand";

function Step({ index, total, label }) {
  return (
    <div className="mb-5 flex items-center gap-3 text-xs text-muted">
      <span className="font-medium text-text">{label} {index + 1} of {total}</span>
      <Progress value={(index / total) * 100} className="h-1.5 flex-1" />
    </div>
  );
}

function AnswerBox({ onAnswer, placeholder = "Your answer", inputMode = "numeric", autoFocus = true }) {
  const [value, setValue] = useState("");
  const submit = (e) => {
    e.preventDefault();
    onAnswer(value.trim());
    setValue("");
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input value={value} onChange={(e) => setValue(e.target.value)} inputMode={inputMode} autoFocus={autoFocus}
        autoComplete="off" spellCheck={false} placeholder={placeholder} className={input} />
      <Button type="submit" size="lg" disabled={!value.trim()}>Enter <ArrowRight className="size-4" /></Button>
    </form>
  );
}

// ---------------------------------------------------------------- number span

export function NumberSpan({ data, onSubmit }) {
  const { rounds, shown_ms: shown } = data;
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState("show"); // show | input | feedback
  const [digit, setDigit] = useState(-1);
  const [answers, setAnswers] = useState([]);
  const [misses, setMisses] = useState(0);
  const [last, setLast] = useState(null);

  useEffect(() => {
    if (phase !== "show") return undefined;
    const digits = rounds[round].digits;
    const timers = [setTimeout(() => setDigit(-1), 0)];
    for (let i = 0; i < digits.length; i++) {
      timers.push(setTimeout(() => setDigit(i), 700 + i * shown));
      timers.push(setTimeout(() => setDigit(-1), 700 + i * shown + shown * 0.75));
    }
    timers.push(setTimeout(() => setPhase("input"), 700 + digits.length * shown));
    return () => timers.forEach(clearTimeout);
  }, [phase, round, rounds, shown]);

  const answer = (value) => {
    const digits = value.replace(/\D/g, "");
    const ok = digits === rounds[round].digits;
    const next = [...answers, digits];
    const missed = ok ? 0 : misses + 1;
    setAnswers(next);
    setMisses(missed);
    setLast({ ok, expected: rounds[round].digits, given: digits });
    if (missed >= 2 || round + 1 >= rounds.length) {
      onSubmit(next);
      return;
    }
    setPhase("feedback");
    setTimeout(() => { setRound((r) => r + 1); setPhase("show"); }, 1300);
  };

  const digits = rounds[round].digits;
  return (
    <Card className="p-6 sm:p-8">
      <Step index={round} total={rounds.length} label="Round" />
      <p className="text-center text-sm text-muted">{digits.length} digits. Two misses in a row ends the run.</p>
      <div className="my-10 flex h-28 items-center justify-center">
        {phase === "show" && (
          <span className="font-mono text-7xl font-bold tabular-nums">{digit >= 0 ? digits[digit] : ""}</span>
        )}
        {phase === "input" && <p className="text-lg font-medium">Type the digits in order</p>}
        {phase === "feedback" && last && (
          <p className={cx("text-lg font-semibold", last.ok ? "text-ok" : "text-bad")}>
            {last.ok ? "Correct" : `It was ${last.expected}`}
          </p>
        )}
      </div>
      {phase === "input" && <AnswerBox onAnswer={answer} placeholder="e.g. 52819" />}
    </Card>
  );
}

// ---------------------------------------------------------------- state tracker

export function VariableTrace({ data, onSubmit }) {
  const { rounds, shown_ms: shown } = data;
  const [round, setRound] = useState(0);
  const [line, setLine] = useState(-1);
  const [asking, setAsking] = useState(false);
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    const lines = rounds[round].lines;
    const timers = [setTimeout(() => { setLine(-1); setAsking(false); }, 0)];
    lines.forEach((_, i) => timers.push(setTimeout(() => setLine(i), 600 + i * shown)));
    timers.push(setTimeout(() => setAsking(true), 600 + lines.length * shown));
    return () => timers.forEach(clearTimeout);
  }, [round, rounds, shown]);

  const answer = (value) => {
    const next = [...answers, value];
    setAnswers(next);
    if (round + 1 >= rounds.length) onSubmit(next);
    else setRound(round + 1);
  };

  const r = rounds[round];
  return (
    <Card className="p-6 sm:p-8">
      <Step index={round} total={rounds.length} label="Program" />
      <p className="text-center text-sm text-muted">Each line runs once and disappears. Track every variable.</p>
      <div className="my-8 flex min-h-28 flex-col items-center justify-center gap-3">
        {!asking && line >= 0 && (
          <>
            <span className="text-xs text-faint">Line {line + 1} of {r.lines.length}</span>
            <code key={`${round}-${line}`} className="rounded-xl bg-bg px-6 py-4 font-mono text-3xl font-semibold">{r.lines[line]}</code>
          </>
        )}
        {asking && <p className="font-mono text-3xl font-semibold">{r.ask} = ?</p>}
      </div>
      {asking && <AnswerBox key={round} onAnswer={answer} placeholder={`Value of ${r.ask}`} />}
    </Card>
  );
}

// ---------------------------------------------------------------- focus grid

export function Schulte({ data, onSubmit }) {
  const { size, cells } = data;
  const [next, setNext] = useState(1);
  const [wrong, setWrong] = useState(-1);
  const [started, setStarted] = useState(false);
  const clicks = useRef([]);
  const t0 = useRef(0);
  const n = size * size;

  const begin = () => {
    t0.current = clock();
    setStarted(true);
  };
  const click = (i) => {
    clicks.current.push(i);
    if (cells[i] === next) {
      if (next === n) {
        onSubmit({ clicks: clicks.current, time_ms: Math.round(clock() - t0.current) });
      }
      setNext(next + 1);
    } else {
      setWrong(i);
      setTimeout(() => setWrong(-1), 250);
    }
  };

  if (!started) {
    return (
      <Card className="flex flex-col items-center gap-4 p-10 text-center">
        <p className="max-w-md text-sm text-muted">
          A {size}×{size} grid of numbers. Click 1, then 2, then 3, up to {n}. Keep your eyes near the centre and let
          your peripheral vision find the next number. The clock starts when you press Start.
        </p>
        <Button size="lg" onClick={begin}>Start</Button>
      </Card>
    );
  }
  return (
    <Card className="p-4 sm:p-6">
      <p className="mb-4 text-center text-sm text-muted">Find <span className="font-mono text-lg font-bold text-text">{next}</span></p>
      <div className="mx-auto grid max-w-md gap-1.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {cells.map((v, i) => (
          <button key={i} type="button" onClick={() => click(i)}
            className={cx("aspect-square rounded-lg border font-mono text-lg font-semibold transition select-none sm:text-xl",
              v < next ? "border-transparent bg-surface-2 text-faint" : "border-line bg-surface-2 hover:border-brand/50",
              wrong === i && "border-bad bg-bad/15")}>
            {v}
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- mental math

export function MentalMath({ data, onSubmit }) {
  const { questions, time_limit: limit } = data;
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(limit);
  const answers = useRef([]);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onSubmit(questions.map((_, i) => answers.current[i] ?? null));
  };
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });

  useEffect(() => {
    if (!started) return undefined;
    const end = performance.now() + limit * 1000;
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      setLeft(s);
      if (s === 0) finishRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [started, limit]);

  const answer = (value) => {
    answers.current[index] = value === "" ? null : value;
    if (index + 1 >= questions.length) finish();
    else setIndex(index + 1);
  };

  if (!started) {
    return (
      <Card className="flex flex-col items-center gap-4 p-10 text-center">
        <p className="max-w-md text-sm text-muted">
          {questions.length} questions, {limit} seconds. Type the answer and press Enter. <code>{"//"}</code> is integer
          division, <code>&amp;</code> and <code>^</code> are bitwise AND and XOR, <code>&lt;&lt;</code> and <code>&gt;&gt;</code> are shifts.
        </p>
        <Button size="lg" onClick={() => setStarted(true)}>Start the clock</Button>
      </Card>
    );
  }
  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-5 flex items-center justify-between text-sm">
        <span className="text-muted">Question {index + 1} of {questions.length}</span>
        <span className={cx("flex items-center gap-1.5 font-mono font-semibold tabular-nums", left <= 15 ? "text-bad" : "text-text")}>
          <Clock className="size-4" /> {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </span>
      </div>
      <Progress value={(left / limit) * 100} className="mb-8 h-1.5" />
      <p className="mb-8 text-center font-mono text-4xl font-bold sm:text-5xl">{questions[index]}</p>
      <AnswerBox key={index} onAnswer={answer} inputMode="decimal" />
      <div className="mt-3 flex justify-between">
        <Button variant="ghost" size="sm" onClick={() => answer("")}><SkipForward className="size-3.5" /> Skip</Button>
        <Button variant="ghost" size="sm" onClick={finish}>Finish now</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- written answers (code, sequences, puzzles, estimates)

function SubmitBar({ count, total, onSubmit, busy }) {
  return (
    <div className="sticky bottom-4 z-10 mt-6 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-3 pl-5 backdrop-blur">
      <span className="text-sm text-muted">{count} of {total} answered</span>
      <Button onClick={onSubmit} loading={busy}>Submit answers</Button>
    </div>
  );
}

export function CodeTrace({ data, onSubmit, busy }) {
  const [answers, setAnswers] = useState(() => data.snippets.map(() => ""));
  const set = (i, v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)));
  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Type exactly what each program prints. Lists and tuples print the way Python shows them, e.g. <code>[1, 4, 9]</code>.
        Several values in one print are separated by a space.
      </p>
      <div className="space-y-4">
        {data.snippets.map((code, i) => (
          <Card key={i} className="p-5">
            <p className="mb-2 text-xs font-medium text-muted">Program {i + 1}</p>
            <pre className="overflow-x-auto rounded-xl border border-line bg-bg p-4 font-mono text-[13.5px] leading-6">{code}</pre>
            <input value={answers[i]} onChange={(e) => set(i, e.target.value)} spellCheck={false} autoComplete="off"
              placeholder="Output" className={cx(input, "mt-3")} />
          </Card>
        ))}
      </div>
      <SubmitBar count={answers.filter((a) => a.trim()).length} total={answers.length} busy={busy} onSubmit={() => onSubmit(answers)} />
    </div>
  );
}

export function Sequence({ data, onSubmit, busy }) {
  const [answers, setAnswers] = useState(() => data.sequences.map(() => ""));
  const set = (i, v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)));
  return (
    <div>
      <p className="mb-4 text-sm text-muted">What comes next in each sequence?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.sequences.map((seq, i) => (
          <Card key={i} className="flex flex-col gap-3 p-4">
            <p className="font-mono text-lg font-semibold tracking-wide">{seq.join(", ")}, ?</p>
            <input value={answers[i]} onChange={(e) => set(i, e.target.value)} inputMode="numeric" autoComplete="off"
              placeholder="Next number" className={input} />
          </Card>
        ))}
      </div>
      <SubmitBar count={answers.filter((a) => a.trim()).length} total={answers.length} busy={busy} onSubmit={() => onSubmit(answers)} />
    </div>
  );
}

export function Choices({ options, value, onChange }) {
  return (
    <div className="grid gap-2">
      {options.map((opt, j) => (
        <button key={j} type="button" onClick={() => onChange(j)}
          className={cx("flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition",
            value === j ? "border-brand bg-brand/10" : "border-line bg-surface-2 hover:border-brand/40")}>
          <span className={cx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
            value === j ? "border-brand bg-brand text-white" : "border-line text-muted")}>
            {String.fromCharCode(65 + j)}
          </span>
          <span>{opt}</span>
        </button>
      ))}
    </div>
  );
}

export function Logic({ data, onSubmit, busy }) {
  const [answers, setAnswers] = useState(() => data.puzzles.map(() => null));
  const set = (i, v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)));
  return (
    <div>
      <p className="mb-4 text-sm text-muted">Take your time. The first answer that comes to mind is often the trap.</p>
      <div className="space-y-4">
        {data.puzzles.map((p, i) => (
          <Card key={p.id} className="p-5">
            <p className="text-xs font-medium text-muted">Puzzle {i + 1}: {p.title}</p>
            <p className="mt-2 mb-4 leading-relaxed">{p.prompt}</p>
            <Choices options={p.options} value={answers[i]} onChange={(v) => set(i, v)} />
          </Card>
        ))}
      </div>
      <SubmitBar count={answers.filter((a) => a !== null).length} total={answers.length} busy={busy} onSubmit={() => onSubmit(answers)} />
    </div>
  );
}

export function Estimation({ data, onSubmit, busy }) {
  const [answers, setAnswers] = useState(() => data.questions.map(() => ""));
  const set = (i, v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)));
  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Estimate without a calculator. You can type <code>1.5k</code>, <code>2e6</code> or <code>40 million</code>.
        Within 2x of the true value scores about 85; 10x off scores 50.
      </p>
      <div className="space-y-4">
        {data.questions.map((q, i) => (
          <Card key={q.id} className="p-5">
            <p className="mb-3 leading-relaxed">{q.prompt}</p>
            <div className="flex items-center gap-3">
              <input value={answers[i]} onChange={(e) => set(i, e.target.value)} autoComplete="off" placeholder="Estimate"
                className={cx(input, "max-w-60")} />
              <span className="text-sm text-muted">{q.unit}</span>
            </div>
          </Card>
        ))}
      </div>
      <SubmitBar count={answers.filter((a) => a.trim()).length} total={answers.length} busy={busy} onSubmit={() => onSubmit(answers)} />
    </div>
  );
}

export const RUNNERS = {
  "number-span": NumberSpan,
  "variable-trace": VariableTrace,
  schulte: Schulte,
  "mental-math": MentalMath,
  "code-trace": CodeTrace,
  sequence: Sequence,
  logic: Logic,
  estimation: Estimation,
};
