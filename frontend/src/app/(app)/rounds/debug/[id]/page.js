"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Bug, ChevronLeft, CircleCheck, FileCode, FlaskConical, Lightbulb, Lock, Play, RotateCcw, Send, Ticket, Trophy, X, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import CodeEditor from "@/components/CodeEditor";
import TechLogo from "@/components/TechLogo";
import {
  Badge, Button, DIFFICULTY_TONE, ErrorState, Markdown, PageLoader, Ring, RichText, Spinner, cx, scoreColor,
} from "@/components/ui";
import RoundTestResults from "@/components/rounds/RoundTestResults";
import { DiffView, LANGUAGE_LABEL, RoundTimer, useRoundClock } from "@/components/rounds/shared";

const MONACO_LANGUAGE = { python: "python", javascript: "javascript" };
const storageKey = (id, file) => `haven:round:${id}:${file}`;

function loadFiles(round) {
  const out = {};
  for (const [name, content] of Object.entries(round.files)) {
    try {
      out[name] = localStorage.getItem(storageKey(round.id, name)) ?? content;
    } catch {
      out[name] = content;
    }
  }
  return out;
}

function saveFile(id, name, content, original) {
  try {
    if (content === original) localStorage.removeItem(storageKey(id, name));
    else localStorage.setItem(storageKey(id, name), content);
  } catch {
    // storage unavailable
  }
}

export default function DebugRoundPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/api/rounds/debug/${id}`);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <Workspace key={data.id} round={data} />;
}

/** Support-ticket style card for the bug report. */
function TicketCard({ round }) {
  const [key, ...rest] = round.scenario.split(":");
  const hasKey = rest.length > 0 && /^[A-Z]+-\d+$/.test(key.trim());
  const body = hasKey ? rest.join(":").trim() : round.scenario;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-xs">
        <Ticket className="size-3.5 text-bad" />
        <span className="font-mono font-semibold text-text">{hasKey ? key.trim() : "BUG REPORT"}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-bad" /> <span className="text-muted">Open</span>
        </span>
      </div>
      <div className="p-4">
        <h1 className="text-base leading-snug font-semibold">{round.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-text/90"><RichText text={body} /></p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-xs">
          <dt className="text-faint">Type</dt><dd className="flex items-center gap-1 text-bad"><Bug className="size-3.5" /> Bug</dd>
          <dt className="text-faint">Priority</dt>
          <dd><Badge tone={DIFFICULTY_TONE[round.difficulty]}>{round.difficulty}</Badge></dd>
          <dt className="text-faint">Bugs to fix</dt><dd className="font-semibold">{round.bug_count}</dd>
          <dt className="text-faint">Time box</dt><dd>{round.time_minutes} minutes</dd>
          <dt className="text-faint">Language</dt>
          <dd className="flex items-center gap-1.5"><TechLogo slug={round.language} size={14} tile={false} />{LANGUAGE_LABEL[round.language]}</dd>
        </dl>
        {round.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {round.tags.map((t) => <span key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{t}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function HintPanel({ round, hints, onHint, busy, error }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4 text-warn" /> Hints</p>
      <p className="mt-1 text-xs text-muted">
        {round.hint_count} available. Each hint you open takes 15% off your score, so try the tests first.
      </p>
      <div className="mt-3 space-y-2">
        {hints.map((h, i) => (
          <div key={i} className="animate-fade-up rounded-xl bg-surface-2 p-3 text-sm">
            <Badge tone="warn" className="mb-1">Hint {i + 1} of {round.hint_count}</Badge>
            <p className="text-text/90"><RichText text={h} /></p>
          </div>
        ))}
      </div>
      {hints.length < round.hint_count && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onHint} loading={busy}>
          <Lightbulb className="size-3.5" /> {hints.length ? "Next hint" : "Show a hint"} (-15%)
        </Button>
      )}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </div>
  );
}

function SolutionModal({ round, result, onClose }) {
  const names = Object.keys(result.solution || {});
  const [file, setFile] = useState(names[0]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Round passed"
        className="card glow my-8 w-full max-w-4xl animate-pop p-5 sm:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <Ring value={result.score} size={92} stroke={8} color={scoreColor(result.score)} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xl font-bold"><Trophy className="size-5 text-warn" /> Ticket closed</p>
            <p className="mt-1 text-sm text-muted">
              All {result.total} tests pass.{result.score < 100 && " Hints used reduced the score."}
            </p>
            {result.xp_gained > 0 && (
              <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand"><Zap className="size-4" /> +{result.xp_gained} XP</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text">
            <X className="size-5" />
          </button>
        </div>
        {result.explanation && (
          <div className="mt-5 rounded-xl bg-surface-2 p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warn"><Lightbulb className="size-3.5" /> What was wrong</p>
            <Markdown>{result.explanation}</Markdown>
          </div>
        )}
        {names.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold text-muted">Reference fix (original buggy code against the solution)</p>
            <div className="mb-2 flex flex-wrap gap-1">
              {names.map((n) => (
                <button key={n} onClick={() => setFile(n)}
                  className={cx("rounded-lg px-2.5 py-1 font-mono text-xs",
                    file === n ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text")}>
                  {n}
                </button>
              ))}
            </div>
            <DiffView before={round.files[file]} after={result.solution[file]} />
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Keep looking</Button>
          <Button href="/rounds">More rounds</Button>
        </div>
      </div>
    </div>
  );
}

function Workspace({ round }) {
  const { setUser } = useAuth();
  const { startedAt, elapsed } = useRoundClock();
  const sourceNames = Object.keys(round.files);
  const [files, setFiles] = useState(() => loadFiles(round));
  const [active, setActive] = useState(sourceNames[0]);
  const [result, setResult] = useState(null);
  const [submitInfo, setSubmitInfo] = useState(null);
  const [solved, setSolved] = useState(null);
  const [running, setRunning] = useState(null);
  const [hints, setHints] = useState([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintError, setHintError] = useState("");
  const [panel, setPanel] = useState("ticket");

  const isTest = active === round.test_file;
  const edited = Object.fromEntries(Object.entries(files).filter(([n, c]) => c !== round.files[n]));

  function update(value) {
    if (isTest) return;
    setFiles((f) => ({ ...f, [active]: value }));
    saveFile(round.id, active, value, round.files[active]);
  }

  function resetFile() {
    setFiles((f) => ({ ...f, [active]: round.files[active] }));
    saveFile(round.id, active, round.files[active], round.files[active]);
  }

  async function getHint() {
    setHintBusy(true);
    setHintError("");
    try {
      const r = await api(`/api/rounds/debug/${round.id}/hint`, { body: { level: hints.length + 1 } });
      setHints((h) => [...h, r.hint]);
    } catch (err) {
      setHintError(err.message);
    } finally {
      setHintBusy(false);
    }
  }

  async function run() {
    setRunning("run");
    setSubmitInfo(null);
    try {
      setResult(await api(`/api/rounds/debug/${round.id}/run`, { body: { files: edited } }));
    } catch (err) {
      setResult({ status: "Error", passed: 0, total: 0, results: [], stderr: err.message });
    } finally {
      setRunning(null);
    }
  }

  async function submit() {
    setRunning("submit");
    try {
      const r = await api(`/api/rounds/debug/${round.id}/submit`,
        { body: { files: edited, hints_used: hints.length, started_at: startedAt } });
      setResult(r);
      setSubmitInfo({ score: r.score, passed: r.passed_round, xp: r.xp_gained });
      if (r.user) setUser(r.user);
      if (r.passed_round) setSolved(r);
    } catch (err) {
      setResult({ status: "Error", passed: 0, total: 0, results: [], stderr: err.message });
    } finally {
      setRunning(null);
    }
  }

  const tabs = [...sourceNames, round.test_file];
  const editedCount = Object.keys(edited).length;

  return (
    <div className="-mx-4 -my-6 flex flex-col sm:-mx-6 lg:-mx-10 lg:-my-8 lg:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Link href="/rounds" className="flex items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft className="size-4" /> Rounds
        </Link>
        {round.best?.passed && <Badge tone="ok"><CircleCheck className="size-3" /> Passed · best {Math.round(round.best.score)}</Badge>}
        <RoundTimer minutes={round.time_minutes} elapsed={elapsed} />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={run} loading={running === "run"} disabled={!!running}>
            <Play className="size-3.5" /> Run tests
          </Button>
          <Button size="sm" variant="success" onClick={submit} loading={running === "submit"} disabled={!!running}>
            <Send className="size-3.5" /> Submit
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,34%)_1fr]">
        <aside className="flex min-h-0 flex-col border-line lg:border-r">
          <div className="flex gap-1 border-b border-line px-3 pt-2 lg:hidden">
            {[["ticket", "Ticket"], ["hints", "Hints"]].map(([pid, label]) => (
              <button key={pid} onClick={() => setPanel(pid)}
                className={cx("rounded-t-lg px-3 py-2 text-xs font-medium",
                  panel === pid ? "border-b-2 border-brand text-text" : "text-muted hover:text-text")}>
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <div className={cx(panel !== "ticket" && "hidden lg:block")}><TicketCard round={round} /></div>
            <div className={cx(panel !== "hints" && "hidden lg:block")}>
              <HintPanel round={round} hints={hints} onHint={getHint} busy={hintBusy} error={hintError} />
            </div>
            <p className={cx("text-xs text-faint", panel !== "ticket" && "hidden lg:block")}>
              Tip: run the tests first and read the failure messages. They usually point straight at the symptom.
            </p>
          </div>
        </aside>

        <div className="flex min-h-0 flex-col border-t border-line lg:border-t-0">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2">
            {tabs.map((name) => {
              const test = name === round.test_file;
              return (
                <button key={name} onClick={() => setActive(name)}
                  className={cx("flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-xs transition",
                    active === name ? "border-brand text-text" : "border-transparent text-muted hover:text-text")}>
                  {test ? <FlaskConical className="size-3.5 text-brand-2" /> : <FileCode className="size-3.5" />}
                  {name}
                  {test && <Lock className="size-3 text-faint" aria-label="read-only" />}
                  {!test && edited[name] !== undefined && <span className="size-1.5 rounded-full bg-warn" title="Edited" />}
                </button>
              );
            })}
            <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
              {isTest ? (
                <span className="flex items-center gap-1 text-[11px] text-faint"><Lock className="size-3" /> Read-only</span>
              ) : (
                <Button size="sm" variant="ghost" onClick={resetFile} disabled={edited[active] === undefined}
                  title="Restore this file to the original buggy version">
                  <RotateCcw className="size-3.5" /> Reset file
                </Button>
              )}
            </div>
          </div>
          <div className="h-[55vh] min-h-0 lg:h-auto lg:flex-[3]">
            <CodeEditor value={isTest ? round.tests : files[active]} onChange={update}
              language={MONACO_LANGUAGE[round.language] || "plaintext"} readOnly={isTest} />
          </div>
          <div className="min-h-0 overflow-y-auto border-t border-line bg-surface lg:flex-[2]">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-medium text-muted">
              Test results {running && <Spinner className="size-3.5" />}
              <span className="ml-auto text-faint">{editedCount} file{editedCount === 1 ? "" : "s"} changed</span>
            </div>
            {submitInfo && (
              <div className={cx("mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm",
                submitInfo.passed ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn")}>
                <span className="font-semibold">Submitted · score {Math.round(submitInfo.score)}</span>
                <span className="text-text/80">
                  {submitInfo.passed ? "Every test passes." : "Not all tests pass yet. Partial credit was recorded; keep going and submit again."}
                </span>
                {submitInfo.passed && (
                  <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setSolved(result)}>View fix</Button>
                )}
              </div>
            )}
            <RoundTestResults result={result} />
          </div>
        </div>
      </div>

      {solved && <SolutionModal round={round} result={solved} onClose={() => setSolved(null)} />}
    </div>
  );
}
