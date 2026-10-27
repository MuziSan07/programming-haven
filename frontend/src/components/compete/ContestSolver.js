"use client";

import { useState } from "react";
import { CircleCheck, CircleX, ListOrdered, Lock, Play, RotateCcw, Send, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import CodeEditor from "@/components/CodeEditor";
import ProblemStatement from "@/components/ProblemStatement";
import TestResults from "@/components/TestResults";
import { Badge, Button, ErrorState, PageLoader, Spinner, cx } from "@/components/ui";
import ContestLeaderboard from "./ContestLeaderboard";

const storageKey = (contest, slug, lang) => `haven:contest:${contest}:${slug}:${lang}`;

function loadCode(contestSlug, problem, lang) {
  const starter = problem.starter?.[lang] ?? "";
  try {
    return localStorage.getItem(storageKey(contestSlug, problem.slug, lang)) ?? starter;
  } catch {
    return starter;
  }
}

/** Loads one contest problem and renders the statement + editor workspace. */
export default function ContestSolver(props) {
  const { contestSlug, problemSlug } = props;
  const { data: problem, error, loading, reload } = useApi(`/api/contests/${contestSlug}/problems/${problemSlug}`);
  if (loading) return <PageLoader label="Loading problem" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <Solver key={problem.slug} problem={problem} {...props} />;
}

function Outcome({ outcome }) {
  if (!outcome) return null;
  const accepted = outcome.status === "Accepted";
  if (accepted && outcome.points > 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ok/30 bg-ok/10 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-ok"><CircleCheck className="size-4" /> +{outcome.points} points</span>
        {outcome.rank && <span className="text-muted">You are now <span className="font-semibold text-text">#{outcome.rank}</span></span>}
        {outcome.xp_gained > 0 && <span className="flex items-center gap-1 text-brand"><Zap className="size-3.5" /> +{outcome.xp_gained} XP</span>}
      </div>
    );
  }
  if (accepted) {
    return <div className="border-b border-line bg-surface-2 px-4 py-3 text-sm text-muted">Already solved. No extra points for a resubmission.</div>;
  }
  return (
    <div className="flex items-center gap-1.5 border-b border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
      <CircleX className="size-4 shrink-0" /> Wrong submission. It adds 5 penalty minutes once you solve this problem.
    </div>
  );
}

function Solver({ problem, solved, contestSlug, locked, leaderboard, meId, maxScore, onSubmitted }) {
  const firstLang = problem.languages.some((l) => l.id === "python") ? "python" : problem.languages[0]?.id || "python";
  const [language, setLanguage] = useState(firstLang);
  const [code, setCode] = useState(() => loadCode(contestSlug, problem, firstLang));
  const [tab, setTab] = useState("problem");
  const [result, setResult] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [running, setRunning] = useState(null);

  function switchLanguage(lang) {
    setLanguage(lang);
    setCode(loadCode(contestSlug, problem, lang));
  }

  function updateCode(value) {
    setCode(value);
    try {
      localStorage.setItem(storageKey(contestSlug, problem.slug, language), value);
    } catch {
      // storage unavailable
    }
  }

  async function execute(kind) {
    setRunning(kind);
    setResult(null);
    setOutcome(null);
    try {
      const r = await api(`/api/contests/${contestSlug}/problems/${problem.slug}/${kind}`, { body: { language, code } });
      setResult(r);
      if (kind === "submit") {
        setOutcome(r);
        onSubmitted?.(r);
      }
    } catch (err) {
      setResult({ status: "Error", passed: 0, total: 0, stderr: err.message, cases: [] });
    } finally {
      setRunning(null);
    }
  }

  const busy = Boolean(running);

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,42%)_1fr]">
      <div className="flex min-h-0 flex-col border-line lg:border-r">
        <div className="flex gap-1 border-b border-line px-3 pt-2">
          {[["problem", "Problem", null], ["leaderboard", "Leaderboard", ListOrdered]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cx("flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium",
                tab === id ? "border-b-2 border-brand text-text" : "text-muted hover:text-text")}>
              {Icon && <Icon className="size-3.5" />}{label}
            </button>
          ))}
          {solved && <Badge tone="ok" className="ml-auto self-center"><CircleCheck className="size-3" /> Solved</Badge>}
        </div>
        <div className={cx("min-h-0 flex-1 overflow-y-auto", tab === "problem" && "p-5")}>
          {tab === "problem" ? (
            <ProblemStatement problem={problem} />
          ) : (
            <ContestLeaderboard rows={leaderboard} meId={meId} maxScore={maxScore} compact />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col border-t border-line lg:border-t-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <select value={language} onChange={(e) => switchLanguage(e.target.value)} disabled={locked}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs disabled:opacity-50">
            {problem.languages.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => updateCode(problem.starter[language] ?? "")} title="Reset code"
            disabled={locked}>
            <RotateCcw className="size-3.5" />
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {locked && <span className="flex items-center gap-1 text-xs text-warn"><Lock className="size-3.5" /> Time is up</span>}
            <Button size="sm" variant="secondary" onClick={() => execute("run")} loading={running === "run"} disabled={busy || locked}>
              <Play className="size-3.5" /> Run
            </Button>
            <Button size="sm" variant="success" onClick={() => execute("submit")} loading={running === "submit"} disabled={busy || locked}>
              <Send className="size-3.5" /> Submit
            </Button>
          </div>
        </div>
        <div className="relative h-[55vh] min-h-0 lg:h-auto lg:flex-[3]">
          <CodeEditor value={code} onChange={updateCode} language={language} readOnly={locked} />
          {locked && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-bg/80 px-4 py-2 text-center text-xs text-muted backdrop-blur">
              Your contest time is over. The editor is read-only.
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto border-t border-line bg-surface lg:flex-[2]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-medium text-muted">
            Console {running && <Spinner className="size-3.5" />}
          </div>
          <Outcome outcome={outcome} />
          <TestResults result={result} />
        </div>
      </div>
    </div>
  );
}
