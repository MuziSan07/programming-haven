"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bot, ChevronLeft, CircleCheck, Clock, History, Lightbulb, Play, RotateCcw, Send, Sparkles, Trophy, Zap,
} from "lucide-react";
import { formatDuration, useActiveTime } from "@/lib/useActiveTime";
import { usePersona } from "@/lib/usePersona";
import { CompanionPanel, useCompanion } from "@/components/Companion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import CodeEditor from "@/components/CodeEditor";
import ProblemStatement from "@/components/ProblemStatement";
import TestResults from "@/components/TestResults";
import { TutorPanel } from "@/components/TutorChat";
import { Badge, Button, ErrorState, Markdown, PageLoader, Ring, Spinner, cx, scoreColor } from "@/components/ui";

const storageKey = (slug, lang) => `haven:code:${slug}:${lang}`;

function loadCode(problem, lang) {
  try {
    return localStorage.getItem(storageKey(problem.slug, lang)) ?? problem.starter[lang];
  } catch {
    return problem.starter[lang];
  }
}

function CoachTab({ problem, language, code }) {
  const [hints, setHints] = useState([]);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  async function getHint() {
    const level = Math.min(3, hints.length + 1);
    setBusy("hint");
    setError("");
    try {
      const r = await api("/api/dsa/hint", { body: { slug: problem.slug, language, code, level } });
      setHints((h) => [...h, r]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function getReview() {
    setBusy("review");
    setError("");
    try {
      setReview(await api("/api/dsa/review", { body: { slug: problem.slug, language, code } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const LEVELS = ["Nudge", "Technique", "Walkthrough"];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4 text-warn" /> Progressive hints</p>
        <p className="mt-1 text-xs text-muted">Each hint reveals a little more. Interviewers reward solving with minimal help.</p>
        <div className="mt-3 space-y-3">
          {hints.map((h, i) => (
            <div key={i} className="animate-fade-up rounded-xl bg-surface-2 p-3">
              <Badge tone="warn" className="mb-1">Hint {i + 1} · {LEVELS[i]}</Badge>
              <Markdown>{h.hint}</Markdown>
            </div>
          ))}
        </div>
        {hints.length < 3 && (
          <Button size="sm" variant="secondary" className="mt-3" onClick={getHint} loading={busy === "hint"}>
            {hints.length ? "Next hint" : "Get a hint"} ({LEVELS[hints.length]})
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-line p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand-2" /> AI code review</p>
        <p className="mt-1 text-xs text-muted">Get graded like a Toptal or Turing reviewer would grade you.</p>
        <Button size="sm" className="mt-3" onClick={getReview} loading={busy === "review"}>Review my code</Button>
        {review && (
          <div className="mt-4 animate-fade-up space-y-4">
            <div className="flex items-center gap-4">
              <Ring value={review.score} size={84} stroke={8} color={scoreColor(review.score)} />
              <div className="space-y-1 text-xs">
                <p><span className="text-faint">Time: </span><span className="font-mono">{review.time_complexity}</span></p>
                <p><span className="text-faint">Space: </span><span className="font-mono">{review.space_complexity}</span></p>
                <Badge tone={review.is_optimal ? "ok" : "warn"}>{review.is_optimal ? "Optimal" : "Can be improved"}</Badge>
              </div>
            </div>
            <p className="text-sm text-text/90">{review.summary}</p>
            {review.strengths?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-ok">Strengths</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{review.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
            {review.improvements?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-warn">Improvements</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{review.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            )}
            {review.interviewer_follow_up && (
              <div className="rounded-xl bg-surface-2 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold text-brand">Interviewer follow-up</p>
                “{review.interviewer_follow_up}”
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

function SubmissionsTab({ submissions, onLoad }) {
  if (!submissions.length) return <p className="text-sm text-faint">No submissions yet.</p>;
  return (
    <ul className="space-y-2">
      {submissions.map((s) => (
        <li key={s.id}>
          <button onClick={() => onLoad(s)}
            className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left text-sm hover:border-brand/50">
            <span className={cx("font-semibold", s.status === "Accepted" ? "text-ok" : "text-bad")}>{s.status}</span>
            <span className="text-xs text-muted">{s.passed}/{s.total}</span>
            <span className="text-xs text-faint">{s.language}</span>
            <span className="ml-auto text-xs text-faint">{new Date(s.created_at).toLocaleString()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ProblemPage() {
  const { slug } = useParams();
  const { data: problem, error, loading, reload, setData } = useApi(`/api/dsa/problems/${slug}`);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <Workspace key={problem.slug} problem={problem} setProblem={setData} />;
}

function Workspace({ problem, setProblem }) {
  const { setUser } = useAuth();
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState(() => loadCode(problem, "python"));
  const [tab, setTab] = useState("description");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const codeRef = useRef(code);
  const { persona } = usePersona();
  const companion = useCompanion({ slug: problem.slug, language, codeRef });
  const { notify } = companion;
  const timer = useActiveTime("dsa", problem.slug, { onReturn: () => notify("tab_return") });

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  function switchLanguage(lang) {
    setLanguage(lang);
    setCode(loadCode(problem, lang));
  }

  function updateCode(value) {
    setCode(value);
    companion.codeChanged();
    try {
      localStorage.setItem(storageKey(problem.slug, language), value);
    } catch {
      // storage unavailable
    }
  }

  async function execute(kind) {
    setRunning(kind);
    setResult(null);
    try {
      const r = await api(`/api/dsa/${kind}`, { body: { slug: problem.slug, language, code } });
      setResult(r);
      if (kind === "submit") {
        setUser(r.user);
        setProblem(await api(`/api/dsa/problems/${problem.slug}`));
        if (r.status === "Accepted") setCelebrate(r);
      }
      if (r.status === "Accepted" && kind === "submit") notify("accepted");
      else if (r.status !== "Accepted") notify("run_failed", { status: `${r.status} (${r.passed}/${r.total})` });
    } catch (err) {
      setResult({ status: "Error", passed: 0, total: 0, stderr: err.message, cases: [] });
    } finally {
      setRunning(null);
    }
  }

  const TABS = [
    { id: "description", label: "Problem", icon: null },
    { id: "coach", label: "AI Coach", icon: Bot },
    { id: "chat", label: "Ask AI", icon: Sparkles },
    { id: "submissions", label: "Submissions", icon: History },
  ];

  return (
    <div className="-mx-4 -my-6 flex flex-col sm:-mx-6 lg:-mx-10 lg:-my-8 lg:h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <Link href="/dsa" className="flex items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft className="size-4" /> Problems
        </Link>
        {problem.solved && <Badge tone="ok"><CircleCheck className="size-3" /> Solved</Badge>}
        <span className={`flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-xs tabular-nums ${timer.active ? "bg-surface-2 text-text" : "bg-warn/15 text-warn"}`}
          title="Focused time on this problem. The clock pauses when you leave the tab.">
          <Clock className="size-3.5" /> {formatDuration(timer.seconds)}{!timer.active && " · paused"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select value={language} onChange={(e) => switchLanguage(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs">
            {problem.languages.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => updateCode(problem.starter[language])} title="Reset code">
            <RotateCcw className="size-3.5" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => execute("run")} loading={running === "run"} disabled={!!running}>
            <Play className="size-3.5" /> Run
          </Button>
          <Button size="sm" variant="success" onClick={() => execute("submit")} loading={running === "submit"} disabled={!!running}>
            <Send className="size-3.5" /> Submit
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(360px,42%)_1fr]">
        <div className="flex min-h-0 flex-col border-r border-line">
          <div className="flex gap-1 border-b border-line px-3 pt-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={cx("flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium",
                  tab === id ? "border-b-2 border-brand text-text" : "text-muted hover:text-text")}>
                {Icon && <Icon className="size-3.5" />}{label}
              </button>
            ))}
          </div>
          <div className={cx("min-h-0 flex-1", tab === "chat" ? "" : "overflow-y-auto p-5")}>
            {tab === "description" && <ProblemStatement problem={problem} />}
            {tab === "coach" && <CoachTab problem={problem} language={language} code={code} />}
            {tab === "chat" && (
              <TutorPanel className="h-[60vh] lg:h-full" title="Ask about this problem"
                context={`DSA problem: ${problem.title}\n${problem.description}\n\nLearner's ${language} code:\n${code}\n\n` +
                  "Do not give the full solution; coach them."} />
            )}
            {tab === "submissions" && (
              <SubmissionsTab submissions={problem.submissions} onLoad={(s) => { setLanguage(s.language); updateCode(s.code); }} />
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="h-[55vh] min-h-0 lg:h-auto lg:flex-[3]">
            <CodeEditor value={code} onChange={updateCode} language={language} />
          </div>
          <div className="min-h-0 overflow-y-auto border-t border-line bg-surface lg:flex-[2]">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-medium text-muted">
              Console {running && <Spinner className="size-3.5" />}
            </div>
            <TestResults result={result} />
          </div>
        </div>
      </div>

      <CompanionPanel companion={companion} persona={persona} />

      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setCelebrate(null)}>
          <div className="card glow w-full max-w-sm animate-pop p-8 text-center" onClick={(e) => e.stopPropagation()}>
            <Trophy className="mx-auto size-14 text-warn" />
            <h2 className="mt-4 text-2xl font-bold">Accepted!</h2>
            <p className="mt-1 text-sm text-muted">All {celebrate.total} tests passed in {celebrate.time_ms} ms.</p>
            {celebrate.xp_gained > 0 && (
              <p className="mt-4 flex items-center justify-center gap-1 text-lg font-bold text-brand">
                <Zap className="size-5" /> +{celebrate.xp_gained} XP
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <Button className="flex-1" onClick={() => { setCelebrate(null); setTab("coach"); }}>Get AI review</Button>
              <Button variant="secondary" href="/dsa">Next problem</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
