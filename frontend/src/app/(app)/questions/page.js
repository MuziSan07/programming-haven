"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Building, ChevronLeft, Circle, CircleCheck, CircleDot, CircleQuestionMark, Lightbulb, Send, Sparkles,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import {
  Badge, Button, Card, CodeBlock, ErrorState, Markdown, PageHeader, PageLoader, Progress, Ring, RichText, cx, scoreColor,
} from "@/components/ui";

const LEVEL_TONE = { Basic: "ok", Intermediate: "cyan", Advanced: "warn", Expert: "bad" };
const STATUS_ICON = {
  correct: <CircleCheck className="size-4 shrink-0 text-ok" />,
  attempted: <CircleDot className="size-4 shrink-0 text-warn" />,
  todo: <Circle className="size-4 shrink-0 text-faint" />,
};

function TopicCard({ topic, active, onClick }) {
  const pct = topic.total ? Math.round((100 * topic.done) / topic.total) : 0;
  return (
    <button onClick={onClick}
      className={cx("card flex flex-col p-4 text-left transition",
        active ? "border-brand bg-brand/10 ring-2 ring-brand/30" : "hover:border-faint")}>
      <p className="truncate text-sm font-semibold">{topic.topic}</p>
      <p className="mt-0.5 text-xs text-muted">{topic.done}/{topic.total} mastered</p>
      <Progress value={pct} className="mt-3 h-1.5" />
      <div className="mt-3 flex gap-1">
        {Object.entries(topic.levels).map(([lv, n]) => (
          <span key={lv} title={`${lv}: ${n}`} className="h-1.5 flex-1 rounded-full"
            style={{ background: n ? `var(--color-${LEVEL_TONE[lv] === "cyan" ? "brand-2" : LEVEL_TONE[lv]})` : "var(--color-surface-3)",
              opacity: n ? 0.8 : 1 }} />
        ))}
      </div>
    </button>
  );
}

function Practice({ question, onAnswered, onNext, onBack }) {
  const { setUser } = useAuth();
  const [choice, setChoice] = useState(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const body = question.type === "mcq" ? { choice } : { text };
      const r = await api(`/api/questions/${question.id}/answer`, { body });
      setResult(r);
      if (r.user) setUser(r.user);
      onAnswered(question.id, r.correct);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Keyboard: 1-9 picks an option, Enter checks / goes next
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (question.type === "mcq" && !result && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < question.options.length) setChoice(i);
      } else if (e.key === "Enter") {
        if (result) onNext();
        else if (question.type === "mcq" && choice !== null) submit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const canSubmit = question.type === "mcq" ? choice !== null : text.trim().length > 0;

  return (
    <Card key={question.id} className="animate-fade-up p-5 sm:p-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-text lg:hidden">
        <ChevronLeft className="size-4" /> All questions
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{question.topic}</Badge>
        <Badge tone={LEVEL_TONE[question.level]}>{question.level}</Badge>
        <Badge>{question.type === "mcq" ? "Multiple choice" : "Open answer"}</Badge>
      </div>
      <h2 className="mt-4 text-lg leading-snug font-semibold"><RichText text={question.question} /></h2>
      {question.code && <CodeBlock code={question.code} className="mt-4" />}
      {question.companies?.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Building className="size-3.5" /> Reported at:
          {question.companies.map((c) => <span key={c} className="rounded-md bg-surface-2 px-2 py-0.5">{c}</span>)}
        </p>
      )}

      {question.type === "mcq" ? (
        <div className="mt-5 grid gap-2.5">
          {question.options.map((opt, i) => {
            const state = result && (i === result.answer ? "right" : i === choice ? "wrong" : null);
            return (
              <button key={i} disabled={!!result} onClick={() => setChoice(i)}
                className={cx("flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition",
                  state === "right" ? "border-ok bg-ok/10" : state === "wrong" ? "border-bad bg-bad/10" :
                    choice === i ? "border-brand bg-brand/10" : "border-line bg-surface hover:border-faint")}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line font-mono text-xs text-muted">
                  {i + 1}
                </span>
                <RichText text={opt} />
              </button>
            );
          })}
        </div>
      ) : (
        <textarea className="input mt-5 min-h-40 resize-y leading-relaxed" value={text} disabled={!!result}
          onChange={(e) => setText(e.target.value)}
          placeholder="Answer as you would in a real interview: structure it, be specific, mention trade-offs…" />
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      {!result ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="hidden text-xs text-faint sm:block">
            {question.type === "mcq" ? "Press 1–9 to pick, Enter to check" : "AI grades your answer against a model answer"}
          </span>
          <Button onClick={submit} loading={busy} disabled={!canSubmit} className="ml-auto">
            {question.type === "mcq" ? "Check answer" : <><Send className="size-4" /> Submit for grading</>}
          </Button>
        </div>
      ) : (
        <div className="mt-6 animate-fade-up space-y-4">
          {question.type === "mcq" ? (
            <div className={cx("flex items-center gap-2 rounded-xl px-4 py-3 font-semibold",
              result.correct ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>
              {result.correct ? <CircleCheck className="size-5" /> : <CircleQuestionMark className="size-5" />}
              {result.correct ? "Correct!" : "Not quite."}
              {result.xp_gained > 0 && (
                <span className="ml-auto flex items-center gap-1 text-sm text-brand"><Zap className="size-4" />+{result.xp_gained} XP</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-xl bg-surface-2 p-4">
              <Ring value={result.score} size={84} stroke={8} color={scoreColor(result.score)} />
              <div className="min-w-0 flex-1">
                <p className={cx("font-semibold", result.correct ? "text-ok" : "text-warn")}>
                  {result.correct ? "Interview-ready answer" : "Not there yet"}
                </p>
                <p className="mt-0.5 text-sm text-text/90">{result.verdict}</p>
                {result.xp_gained > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand"><Zap className="size-3.5" />+{result.xp_gained} XP</p>
                )}
              </div>
            </div>
          )}
          {question.type === "open" && (result.good?.length > 0 || result.missing?.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {result.good?.length > 0 && (
                <div className="rounded-xl border border-ok/30 p-3">
                  <p className="mb-1 text-xs font-semibold text-ok">What you got right</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{result.good.map((g) => <li key={g}>{g}</li>)}</ul>
                </div>
              )}
              {result.missing?.length > 0 && (
                <div className="rounded-xl border border-warn/30 p-3">
                  <p className="mb-1 text-xs font-semibold text-warn">What you missed</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{result.missing.map((g) => <li key={g}>{g}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          {result.model_answer && (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand"><Sparkles className="size-3.5" /> Model answer</p>
              <Markdown>{result.model_answer}</Markdown>
            </div>
          )}
          {result.explanation && (
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warn"><Lightbulb className="size-3.5" />
                {question.type === "mcq" ? "Explanation" : "What interviewers look for"}</p>
              <Markdown>{result.explanation}</Markdown>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={onNext}>Next question <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function QuestionBankPage() {
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("");
  const [type, setType] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [statusOverride, setStatusOverride] = useState({});
  const params = new URLSearchParams();
  if (topic) params.set("topic", topic);
  if (level) params.set("level", level);
  const query = params.toString();
  const { data, error, loading, reload } = useApi(`/api/questions${query ? `?${query}` : ""}`);

  const questions = useMemo(() => {
    const list = data?.questions || [];
    return (type ? list.filter((x) => x.type === type) : list).map((x) => ({ ...x, status: statusOverride[x.id] || x.status }));
  }, [data, type, statusOverride]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const active = questions.find((x) => x.id === activeId);
  const totalQuestions = data.topics.reduce((n, t) => n + t.total, 0);

  function markAnswered(id, correct) {
    setStatusOverride((s) => ({ ...s, [id]: correct ? "correct" : s[id] === "correct" ? "correct" : "attempted" }));
  }

  function next() {
    const idx = questions.findIndex((x) => x.id === activeId);
    const pending = questions.slice(idx + 1).find((x) => x.status !== "correct") || questions[idx + 1];
    setActiveId(pending ? pending.id : null);
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <PageHeader eyebrow="Question Bank" title="Interview questions, Basic to Expert"
        description={`${totalQuestions} questions on the topics real screenings test: multiple choice graded instantly, open answers graded by AI against a model answer.`} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {data.topics.map((t) => (
          <TopicCard key={t.topic} topic={t} active={topic === t.topic}
            onClick={() => { setTopic(topic === t.topic ? "" : t.topic); setActiveId(null); }} />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["", ...data.levels].map((lv) => (
          <button key={lv || "all"} onClick={() => { setLevel(lv); setActiveId(null); }}
            className={cx("rounded-full px-3 py-1.5 text-xs font-medium transition",
              level === lv ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text")}>
            {lv || "All levels"}
          </button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value)}
          className="ml-auto rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs">
          <option value="">All types</option>
          <option value="mcq">Multiple choice</option>
          <option value="open">Open answer</option>
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className={cx("overflow-hidden", active && "hidden lg:block")}>
          {questions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">No questions match these filters yet.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
              {questions.map((x) => (
                <li key={x.id}>
                  <button onClick={() => setActiveId(x.id)}
                    className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2",
                      x.id === activeId && "bg-brand/10")}>
                    <span className="mt-0.5">{STATUS_ICON[x.status]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm">{x.question}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-faint">
                        <span>{x.topic}</span>·<span>{x.type === "mcq" ? "MCQ" : "Open"}</span>
                      </span>
                    </span>
                    <Badge tone={LEVEL_TONE[x.level]} className="shrink-0">{x.level}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className={cx(!active && "hidden lg:block")}>
          {active ? (
            <div className="lg:sticky lg:top-20">
              <Practice key={active.id} question={active} onAnswered={markAnswered} onNext={next}
                onBack={() => setActiveId(null)} />
            </div>
          ) : (
            <Card className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
              <CircleQuestionMark className="size-10 text-brand" />
              <p className="font-semibold">Pick a question to practise</p>
              <p className="max-w-sm text-sm text-muted">Start with your weakest topic. Expert questions are what separate
                &quot;maybe&quot; from &quot;hire&quot; at top remote networks.</p>
              {questions[0] && <Button size="sm" onClick={() => setActiveId(questions.find((x) => x.status !== "correct")?.id || questions[0].id)}>
                Start practising <ArrowRight className="size-4" />
              </Button>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
