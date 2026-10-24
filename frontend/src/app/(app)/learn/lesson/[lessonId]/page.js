"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Bot, CircleCheck, CircleX, Eye, Play, Trophy, X, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useActiveTime } from "@/lib/useActiveTime";
import { useApi } from "@/lib/useApi";
import CodeEditor from "@/components/CodeEditor";
import { TutorDrawer } from "@/components/TutorChat";
import { Badge, Button, CodeBlock, ErrorState, LEVEL_TONE, PageLoader, Progress, RichText, cx } from "@/components/ui";

const LANG_LABEL = { python: "Python", javascript: "JavaScript", java: "Java", cpp: "C++", go: "Go" };

const GRADED = new Set(["mcq", "fill", "code"]);

function stepContext(lesson, step) {
  const parts = [`Lesson: ${lesson.title} (${lesson.unit_title})`, `Step type: ${step.type}`];
  if (step.title) parts.push(`Concept: ${step.title}\n${step.body}`);
  if (step.question) parts.push(`Question: ${step.question}`);
  if (step.prompt) parts.push(`Task: ${step.prompt}`);
  if (step.code) parts.push(`Code shown:\n${step.code}`);
  if (step.options) parts.push(`Options: ${step.options.join(" | ")}`);
  return parts.join("\n");
}

function Finished({ lesson, score, result }) {
  return (
    <div className="mx-auto flex max-w-md animate-pop flex-col items-center py-16 text-center">
      <div className="flex size-24 items-center justify-center rounded-full bg-warn/15">
        <Trophy className="size-12 text-warn" />
      </div>
      <h1 className="mt-6 text-3xl font-bold">Lesson complete!</h1>
      <p className="mt-2 text-muted">{lesson.title}</p>
      <div className="mt-8 grid w-full grid-cols-2 gap-4">
        <div className="card p-4">
          <p className="text-xs text-muted">Accuracy</p>
          <p className="text-2xl font-bold text-ok">{score}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">XP earned</p>
          <p className="flex items-center justify-center gap-1 text-2xl font-bold text-brand">
            <Zap className="size-5" />{result?.xp_gained ?? "…"}
          </p>
        </div>
      </div>
      <div className="mt-8 flex w-full gap-3">
        <Button href={`/learn/${lesson.path_id}`} size="lg" className="flex-1">Continue path</Button>
        <Button href="/dashboard" variant="secondary" size="lg">Dashboard</Button>
      </div>
    </div>
  );
}

export default function LessonPage() {
  const { lessonId } = useParams();
  const { setUser } = useAuth();
  const { data: lesson, error, loading, reload } = useApi(`/api/learn/lessons/${lessonId}`);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [fillValue, setFillValue] = useState("");
  const [code, setCode] = useState(null);
  const [checked, setChecked] = useState(null); // null | { correct, detail }
  const [correctCount, setCorrectCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [done, setDone] = useState(null); // { score, result }
  useActiveTime("learn", lessonId);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const steps = lesson.steps;
  const step = steps[index];
  const graded = steps.filter((s) => GRADED.has(s.type)).length;

  if (done) return <Finished lesson={lesson} score={done.score} result={done.result} />;

  function resetStep() {
    setSelected(null);
    setFillValue("");
    setCode(null);
    setChecked(null);
  }

  async function finish(finalCorrect) {
    const score = graded ? Math.round((100 * finalCorrect) / graded) : 100;
    setDone({ score, result: null });
    try {
      const result = await api(`/api/learn/lessons/${lesson.id}/complete`, { body: { score } });
      setUser(result.user);
      setDone({ score, result });
    } catch {
      setDone({ score, result: { xp_gained: 0 } });
    }
  }

  function next() {
    if (index + 1 >= steps.length) finish(correctCount);
    else {
      setIndex(index + 1);
      resetStep();
    }
  }

  function grade(correct, detail) {
    setChecked({ correct, detail });
    if (correct) setCorrectCount((c) => c + 1);
  }

  async function showSolution() {
    try {
      const r = await api("/api/learn/exercise/solution", { body: { lesson_id: lesson.id, step: index, code: code ?? step.starter } });
      setCode(r.solution);
      setChecked(null);
    } catch (err) {
      setChecked({ correct: false, detail: err.message });
    }
  }

  async function check() {
    if (step.type === "mcq") grade(selected === step.answer, step.explanation);
    else if (step.type === "fill") {
      const normalized = fillValue.trim();
      grade(step.answer.some((a) => a === normalized), step.explanation);
    } else if (step.type === "code") {
      setRunning(true);
      try {
        const r = await api("/api/learn/exercise", { body: { lesson_id: lesson.id, step: index, code: code ?? step.starter } });
        grade(r.correct, r.correct ? "Your output matches. Nice work!" :
          r.stderr ? `Error:\n${r.stderr}` : `Your output: ${r.stdout || "(nothing)"}\nExpected: ${r.expected}`);
      } catch (err) {
        setChecked({ correct: false, detail: err.message });
      } finally {
        setRunning(false);
      }
    }
  }

  const canCheck = step.type === "mcq" ? selected !== null : step.type === "fill" ? fillValue.trim() : true;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl flex-col">
      <div className="mb-8 flex items-center gap-4">
        <Link href={`/learn/${lesson.path_id}`} className="text-muted hover:text-text" aria-label="Exit lesson">
          <X className="size-6" />
        </Link>
        <Badge tone={LEVEL_TONE[lesson.level] || "neutral"} className="hidden shrink-0 sm:inline-flex">{lesson.level}</Badge>
        <Progress value={(100 * index) / steps.length} className="h-3" />
        <button onClick={() => setTutorOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-brand/40 bg-brand/10 px-3 py-1.5
            text-sm font-medium text-[#b4a3ff] hover:bg-brand/20">
          <Bot className="size-4" /> Ask Haven
        </button>
      </div>

      <div key={index} className="flex-1 animate-fade-up">
        {step.type === "concept" && (
          <div>
            <p className="text-xs font-semibold tracking-widest text-brand uppercase">New concept</p>
            <h1 className="mt-2 text-2xl font-bold">{step.title}</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-text/90"><RichText text={step.body} /></p>
            {step.code && <CodeBlock code={step.code} className="mt-6" />}
          </div>
        )}

        {step.type === "mcq" && (
          <div>
            <p className="text-xs font-semibold tracking-widest text-brand uppercase">Quick check</p>
            <h1 className="mt-2 text-xl font-bold"><RichText text={step.question} /></h1>
            {step.code && <CodeBlock code={step.code} className="mt-4" />}
            <div className="mt-6 grid gap-3">
              {step.options.map((opt, i) => {
                const state = checked && (i === step.answer ? "right" : i === selected ? "wrong" : null);
                return (
                  <button key={i} disabled={!!checked} onClick={() => setSelected(i)}
                    className={cx("flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-[15px] transition",
                      state === "right" ? "border-ok bg-ok/10" : state === "wrong" ? "border-bad bg-bad/10" :
                        selected === i ? "border-brand bg-brand/10" : "border-line bg-surface hover:border-faint")}>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line
                      font-mono text-xs text-muted">{i + 1}</span>
                    <RichText text={opt} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step.type === "fill" && (
          <div>
            <p className="text-xs font-semibold tracking-widest text-brand uppercase">Fill in the blank</p>
            <h1 className="mt-2 text-xl font-bold">{step.prompt}</h1>
            <CodeBlock code={step.code} className="mt-4" />
            <input className="input mt-5 font-mono text-base" value={fillValue} disabled={!!checked} autoFocus
              onChange={(e) => setFillValue(e.target.value)} placeholder="Type the missing code"
              onKeyDown={(e) => e.key === "Enter" && canCheck && !checked && check()} />
          </div>
        )}

        {step.type === "code" && (
          <div>
            <p className="text-xs font-semibold tracking-widest text-brand uppercase">Hands-on · {LANG_LABEL[step.language] || "Python"}</p>
            <h1 className="mt-2 text-xl font-bold"><RichText text={step.prompt} /></h1>
            <div className="mt-4 h-64 overflow-hidden rounded-xl border border-line">
              <CodeEditor value={code ?? step.starter} onChange={setCode} language={step.language || "python"} readOnly={!!checked} />
            </div>
            {step.hint && !checked && <p className="mt-2 text-xs text-faint">Hint: {step.hint}</p>}
          </div>
        )}
      </div>

      <div className={cx("sticky bottom-20 mt-8 rounded-2xl border p-4 lg:bottom-4",
        checked ? (checked.correct ? "border-ok/40 bg-[#0c1f16]" : "border-bad/40 bg-[#24100f]") : "border-line bg-surface")}>
        {checked && (
          <div className="mb-3 flex gap-3">
            {checked.correct ? <CircleCheck className="size-6 shrink-0 text-ok" /> : <CircleX className="size-6 shrink-0 text-bad" />}
            <div>
              <p className={cx("font-bold", checked.correct ? "text-ok" : "text-bad")}>
                {checked.correct ? "Correct!" : "Not quite"}
              </p>
              {checked.detail && (
                <p className="mt-1 text-sm whitespace-pre-wrap text-text/80"><RichText text={checked.detail} /></p>
              )}
              {!checked.correct && (
                <button onClick={() => setTutorOpen(true)} className="mt-2 text-sm font-medium text-brand hover:underline">
                  Ask Haven why →
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3">
          {step.type === "code" && checked && !checked.correct && (
            <>
              <Button variant="ghost" size="lg" onClick={showSolution}><Eye className="size-4" /> Show solution</Button>
              <Button variant="secondary" size="lg" onClick={() => setChecked(null)}>Try again</Button>
            </>
          )}
          {step.type === "concept" || checked ? (
            <Button size="lg" onClick={next} variant={checked?.correct ? "success" : "primary"} className="min-w-36">
              {index + 1 >= steps.length ? "Finish" : "Continue"}
            </Button>
          ) : (
            <Button size="lg" onClick={check} disabled={!canCheck} loading={running} className="min-w-36">
              {step.type === "code" ? <><Play className="size-4" /> Run & check</> : "Check"}
            </Button>
          )}
        </div>
      </div>

      <TutorDrawer open={tutorOpen} onClose={() => setTutorOpen(false)} context={stepContext(lesson, step)} />
    </div>
  );
}
