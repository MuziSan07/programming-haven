"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bug, Clock, FileCode, GitPullRequest, Trophy } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Badge, Card, DIFFICULTY_TONE, ErrorState, PageHeader, PageLoader, cx, scoreColor } from "@/components/ui";
import TechLogo from "@/components/TechLogo";
import { LANGUAGE_LABEL, STATUS, StatusLabel } from "@/components/rounds/shared";

const TABS = [
  { id: "debug", label: "Debugging", icon: Bug },
  { id: "review", label: "Code review", icon: GitPullRequest },
];
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert"];

function RoundCard({ round, kind }) {
  const count = kind === "debug" ? round.bug_count : round.issue_count;
  const unit = kind === "debug" ? "bug" : "issue";
  return (
    <Link href={`/rounds/${kind}/${round.id}`}
      className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand/50">
      <div className="flex items-start gap-3">
        <TechLogo slug={round.language} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold group-hover:text-brand">{round.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={DIFFICULTY_TONE[round.difficulty]}>{round.difficulty}</Badge>
            <span className="text-[11px] text-faint">{LANGUAGE_LABEL[round.language] || round.language}</span>
          </div>
        </div>
      </div>
      {round.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {round.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{t}</span>
          ))}
        </div>
      )}
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-muted">
          <span className="flex items-center gap-1"><Clock className="size-3.5" />{round.time_minutes} min</span>
          {count != null && (
            <span className="flex items-center gap-1">
              {kind === "debug" ? <Bug className="size-3.5" /> : <GitPullRequest className="size-3.5" />}
              {count} {unit}{count === 1 ? "" : "s"}
            </span>
          )}
          <span className="flex items-center gap-1"><FileCode className="size-3.5" />{round.files} file{round.files === 1 ? "" : "s"}</span>
          <span className="ml-auto flex items-center gap-3">
            {round.best_score != null && (
              <span className="flex items-center gap-1 font-semibold tabular-nums" style={{ color: scoreColor(round.best_score) }}>
                <Trophy className="size-3.5" />{Math.round(round.best_score)}
              </span>
            )}
            <StatusLabel status={round.status} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function Select({ value, onChange, label, children }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
      className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs">
      {children}
    </select>
  );
}

export default function RoundsPage() {
  const { data, error, loading, reload } = useApi("/api/rounds");
  const [tab, setTab] = useState("debug");
  const [language, setLanguage] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [status, setStatus] = useState("");

  const rounds = useMemo(() => data?.[tab] || [], [data, tab]);
  const languages = useMemo(() => [...new Set(rounds.map((r) => r.language))].sort(), [rounds]);
  const filtered = rounds.filter((r) => (!language || r.language === language)
    && (!difficulty || r.difficulty === difficulty) && (!status || r.status === status));

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const passed = rounds.filter((r) => r.status === "passed").length;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Live rounds" title="Debugging and code review"
        description="Toptal and Lemon.io live rounds often skip the greenfield problem: you get a broken codebase and a bug ticket, or a pull request to review while the interviewer watches. Practise both here against real tests and a graded answer key." />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Card className="flex items-start gap-3 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bad/15 text-bad"><Bug className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold">Debugging rounds</p>
            <p className="mt-0.5 text-xs text-muted">Read the ticket, find the bugs across several files and make the failing tests pass. Hints are available but each one costs 15% of your score.</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-2/15 text-brand-2"><GitPullRequest className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold">Code review rounds</p>
            <p className="mt-0.5 text-xs text-muted">Review a PR line by line. Each one hides planted security, correctness and design issues; missing a critical one fails the round.</p>
          </div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id}
              onClick={() => { setTab(id); setLanguage(""); }}
              className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                tab === id ? "bg-brand text-white" : "text-muted hover:text-text")}>
              <Icon className="size-3.5" />{label}
              <span className={cx("rounded-full px-1.5 text-[10px]", tab === id ? "bg-white/20" : "bg-surface-3")}>
                {data[id]?.length || 0}
              </span>
            </button>
          ))}
        </div>
        <span className="text-xs text-faint">{passed}/{rounds.length} passed</span>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <Select value={language} onChange={setLanguage} label="Language">
            <option value="">All languages</option>
            {languages.map((l) => <option key={l} value={l}>{LANGUAGE_LABEL[l] || l}</option>)}
          </Select>
          <Select value={difficulty} onChange={setDifficulty} label="Difficulty">
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Select value={status} onChange={setStatus} label="Status">
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">No rounds match these filters.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => <RoundCard key={r.id} round={r} kind={tab} />)}
        </div>
      )}
    </div>
  );
}
