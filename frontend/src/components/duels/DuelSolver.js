"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Lock, Play, RotateCcw, Send } from "lucide-react";
import { api } from "@/lib/api";
import CodeEditor from "@/components/CodeEditor";
import ProblemStatement from "@/components/ProblemStatement";
import TestResults from "@/components/TestResults";
import { Button, Spinner } from "@/components/ui";

const storageKey = (duelId, lang) => `haven:duel:${duelId}:${lang}`;

function loadCode(duelId, problem, lang) {
  const starter = problem.starter?.[lang] ?? "";
  try {
    return localStorage.getItem(storageKey(duelId, lang)) ?? starter;
  } catch {
    return starter;
  }
}

function Verdict({ result }) {
  if (!result || result.kind !== "submit") return null;
  if (result.status === "Accepted") {
    return (
      <div className="flex items-center gap-1.5 border-b border-ok/30 bg-ok/10 px-4 py-3 text-sm font-medium text-ok">
        <CircleCheck className="size-4 shrink-0" /> Accepted. Checking the result
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 border-b border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
      <CircleX className="size-4 shrink-0" /> {result.passed}/{result.total} tests passed. Your opponent can see this count.
    </div>
  );
}

/** Statement + editor + console for a live duel. Mirrors ContestSolver; `locked` freezes the editor. */
export default function DuelSolver({ duelId, problem, locked, onSubmitted }) {
  const firstLang = problem.languages.some((l) => l.id === "python") ? "python" : problem.languages[0]?.id || "python";
  const [language, setLanguage] = useState(firstLang);
  const [code, setCode] = useState(() => loadCode(duelId, problem, firstLang));
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(null);

  function switchLanguage(lang) {
    setLanguage(lang);
    setCode(loadCode(duelId, problem, lang));
  }

  function updateCode(value) {
    setCode(value);
    try {
      localStorage.setItem(storageKey(duelId, language), value);
    } catch {
      // storage unavailable
    }
  }

  async function execute(kind) {
    setRunning(kind);
    setResult(null);
    try {
      const r = await api(`/api/duels/${duelId}/${kind}`, { body: { language, code } });
      setResult({ ...r, kind });
      if (kind === "submit") onSubmitted?.(r);
    } catch (err) {
      setResult({ status: "Error", passed: 0, total: 0, stderr: err.message, cases: [], kind: "run" });
    } finally {
      setRunning(null);
    }
  }

  const busy = Boolean(running);

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,42%)_1fr]">
      <div className="min-h-0 overflow-y-auto border-line p-5 lg:border-r">
        <ProblemStatement problem={problem} />
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
            {locked && <span className="flex items-center gap-1 text-xs text-warn"><Lock className="size-3.5" /> Locked</span>}
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
              The duel is over. The editor is read-only.
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto border-t border-line bg-surface lg:flex-[2]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-medium text-muted">
            Console {running && <Spinner className="size-3.5" />}
          </div>
          <Verdict result={result} />
          <TestResults result={result} />
        </div>
      </div>
    </div>
  );
}
