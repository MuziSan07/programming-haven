"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, BookOpen, Check, ChevronRight, CircleAlert, CircleCheck, CircleDashed, CircleX, Clock, Container,
  ExternalLink, FileCode, FlaskConical, GitBranch, GitCommitHorizontal, GitFork, KeyRound, ListChecks,
  MessageSquareQuote, Mic, Package, Scale, Send, Star, ThumbsUp, TriangleAlert, Workflow, Wrench,
} from "lucide-react";
import { siGithub } from "simple-icons";
import { api } from "@/lib/api";
import { Badge, Button, Card, Progress, Ring, RichText, Spinner, cx, scoreColor } from "@/components/ui";

export function GitHubMark({ className = "size-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" role="img" aria-label="GitHub">
      <path d={siGithub.path} />
    </svg>
  );
}

export const VERDICT_META = {
  hire: { label: "Hire", tone: "ok", border: "border-ok/40", bg: "bg-ok/5" },
  "lean hire": { label: "Lean hire", tone: "cyan", border: "border-brand-2/40", bg: "bg-brand-2/5" },
  "lean no": { label: "Lean no", tone: "warn", border: "border-warn/40", bg: "bg-warn/5" },
  no: { label: "No hire", tone: "bad", border: "border-bad/40", bg: "bg-bad/5" },
};

const STATUS_META = {
  met: { icon: CircleCheck, cls: "text-ok", label: "Met" },
  partial: { icon: CircleDashed, cls: "text-warn", label: "Partial" },
  missing: { icon: CircleX, cls: "text-bad", label: "Missing" },
};

const PRIORITY_TONE = { high: "bad", medium: "warn", low: "neutral" };

const STEPS = [
  { label: "Fetching repository", after: 0 },
  { label: "Reading code", after: 3 },
  { label: "Checking commits", after: 7 },
  { label: "Writing review", after: 11 },
];

function langColor(i) {
  return `hsl(${(i * 47 + 250) % 360} 70% 62%)`;
}

function fmtDate(iso) {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtSize(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

/* ------------------------------------------------------------------------------------------------ */
/* Submit panel                                                                                      */
/* ------------------------------------------------------------------------------------------------ */

export function RepoSubmitPanel({ projectId, onReviewed }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStep(0);
    const started = performance.now();
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      const secs = (performance.now() - started) / 1000;
      setStep(STEPS.reduce((acc, s, i) => (secs >= s.after ? i : acc), 0));
    }, 500);
    try {
      const r = await api(`/api/projects/${projectId}/review-repo`, { body: { repo_url: repoUrl.trim(), notes } });
      onReviewed?.(r);
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(timer.current);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="repo-url">GitHub repository</label>
        <div className="relative">
          <GitHubMark className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input id="repo-url" className="input pl-9" placeholder="https://github.com/you/project" value={repoUrl}
            disabled={busy} autoComplete="off" spellCheck={false} onChange={(e) => setRepoUrl(e.target.value)} />
        </div>
        <p className="mt-1 text-[11px] text-faint">Public repos only. A branch link (/tree/branch) works too.</p>
      </div>
      <div>
        <label className="label" htmlFor="repo-notes">Notes for the reviewer <span className="text-faint">(optional)</span></label>
        <textarea id="repo-notes" className="input min-h-20 resize-y" value={notes} disabled={busy}
          placeholder="Trade-offs, what you'd do with more time, anything unfinished…"
          onChange={(e) => setNotes(e.target.value)} />
      </div>

      {busy && (
        <ol className="space-y-2 rounded-xl border border-line bg-surface-2 p-3" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s.label} className={cx("flex items-center gap-2.5 text-sm transition",
              i < step ? "text-muted" : i === step ? "text-text" : "text-faint")}>
              {i < step ? <Check className="size-4 text-ok" />
                : i === step ? <Spinner className="size-4" />
                  : <span className="mx-[5px] size-1.5 rounded-full bg-faint/60" />}
              {s.label}
            </li>
          ))}
          <li className="pt-1 text-[11px] text-faint">This usually takes 10 to 30 seconds.</li>
        </ol>
      )}

      {error && <p className="flex items-start gap-1.5 text-sm text-bad"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || repoUrl.trim().length < 3}>
        <Send className="size-4" /> {busy ? "Reviewing repository…" : "Review my repo"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Report pieces                                                                                     */
/* ------------------------------------------------------------------------------------------------ */

function Section({ icon: Icon, title, aside, className, children }) {
  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-brand" />{title}</h3>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function SignalChip({ ok, bad, icon: Icon, label, detail }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
      bad ? "border-bad/40 bg-bad/10 text-bad" : ok ? "border-ok/30 bg-ok/10 text-ok" : "border-line bg-surface-2 text-muted")}>
      <Icon className="size-3.5" />
      {label}
      {detail && <span className="font-normal opacity-80">{detail}</span>}
    </span>
  );
}

function hygiene(c) {
  if (!c) return { label: "unknown", ok: false, bad: false };
  if (c.single_commit_dump || c.low_quality_share > 0.5) return { label: "poor", ok: false, bad: true };
  if (c.low_quality_share > 0.25 || c.count < 5) return { label: "fair", ok: false, bad: false };
  return { label: "good", ok: true, bad: false };
}

export function SignalChips({ signals }) {
  if (!signals) return null;
  const h = hygiene(signals.commits);
  const secrets = signals.secrets?.length || 0;
  return (
    <div className="flex flex-wrap gap-2">
      <SignalChip ok={signals.tests?.has} icon={FlaskConical} label="Tests"
        detail={signals.tests?.has ? `${signals.tests.files} files` : "none"} />
      <SignalChip ok={signals.ci?.has} icon={Workflow} label="CI" detail={signals.ci?.has ? null : "none"} />
      <SignalChip ok={signals.docker} icon={Container} label="Docker" detail={signals.docker ? null : "none"} />
      <SignalChip ok={signals.env_example} icon={FileCode} label=".env.example" detail={signals.env_example ? null : "missing"} />
      <SignalChip ok={signals.lockfile?.has} icon={Package} label="Lockfile" detail={signals.lockfile?.has ? null : "missing"} />
      <SignalChip ok={!secrets} bad={secrets > 0} icon={KeyRound} label={secrets ? "Secrets found" : "No secrets"}
        detail={secrets ? String(secrets) : null} />
      <SignalChip ok={h.ok} bad={h.bad} icon={GitCommitHorizontal} label="Commit hygiene" detail={h.label} />
    </div>
  );
}

function RepoHeader({ repo }) {
  const langs = Object.entries(repo.languages || {}).sort((a, b) => b[1] - a[1]);
  const total = langs.reduce((n, [, v]) => n + v, 0) || 1;
  const shown = langs.filter(([, v]) => v / total >= 0.01).slice(0, 8);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={repo.html_url} target="_blank" rel="noopener noreferrer"
            className="group flex items-center gap-2 font-semibold hover:text-brand">
            <GitHubMark className="size-5 shrink-0" />
            <span className="truncate">{repo.full_name}</span>
            <ExternalLink className="size-3.5 shrink-0 text-faint group-hover:text-brand" />
          </a>
          <p className={cx("mt-1 text-sm", repo.description ? "text-muted" : "text-faint")}>
            {repo.description || "No description"}
          </p>
        </div>
        <Button variant="secondary" size="sm" href={repo.html_url} target="_blank" rel="noopener noreferrer">
          Open repo <ExternalLink className="size-3.5" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        <span className="flex items-center gap-1"><Star className="size-3.5" />{repo.stars ?? 0}</span>
        <span className="flex items-center gap-1"><GitFork className="size-3.5" />{repo.forks ?? 0}</span>
        <span className="flex items-center gap-1"><GitBranch className="size-3.5" />{repo.branch}</span>
        <span className="flex items-center gap-1"><Clock className="size-3.5" />Last push {fmtDate(repo.pushed_at)}</span>
        {repo.license && <span className="flex items-center gap-1"><Scale className="size-3.5" />{repo.license}</span>}
      </div>
      {shown.length > 0 && (
        <div className="mt-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
            {shown.map(([l, n], i) => (
              <span key={l} title={l} style={{ width: `${(100 * n) / total}%`, background: langColor(i) }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {shown.map(([l, n], i) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: langColor(i) }} />
                {l} <span className="text-faint">{((100 * n) / total).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {repo.topics?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {repo.topics.map((t) => <span key={t} className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] text-[#b4a3ff]">{t}</span>)}
        </div>
      )}
    </Card>
  );
}

function Requirements({ items }) {
  const counts = items.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  return (
    <Section icon={ListChecks} title="Requirements"
      aside={<span className="text-xs text-muted">{counts.met || 0} met · {counts.partial || 0} partial · {counts.missing || 0} missing</span>}>
      <ul className="space-y-3">
        {items.map((r, i) => {
          const meta = STATUS_META[r.status] || STATUS_META.missing;
          const Icon = meta.icon;
          return (
            <li key={i} className="flex gap-2.5">
              <Icon className={cx("mt-0.5 size-4 shrink-0", meta.cls)} aria-label={meta.label} />
              <div className="min-w-0 text-sm">
                <p>{r.requirement}</p>
                {r.note && <p className="mt-0.5 text-xs text-muted"><RichText text={r.note} /></p>}
                {r.evidence?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.evidence.map((p) => (
                      <code key={p} className="max-w-full truncate rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-brand-2">{p}</code>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Rubric({ items, weights }) {
  return (
    <Section icon={Scale} title="Rubric">
      <div className="space-y-4">
        {items.map((c) => {
          const pct = (c.score || 0) * 10;
          return (
            <div key={c.criterion}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{c.criterion}
                  {weights?.[c.criterion] != null && <span className="text-xs text-faint"> · {weights[c.criterion]}%</span>}
                </span>
                <span className="font-semibold tabular-nums" style={{ color: scoreColor(pct) }}>{c.score}<span className="text-xs text-faint">/10</span></span>
              </div>
              <Progress value={pct} color={scoreColor(pct)} />
              {c.comment && <p className="mt-1.5 text-xs leading-relaxed text-muted"><RichText text={c.comment} /></p>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function buildTimeline(perDay) {
  if (!perDay?.length) return [];
  const DAY = 86_400_000;
  const start = Date.parse(perDay[0].date);
  const end = Date.parse(perDay[perDay.length - 1].date);
  const days = Math.round((end - start) / DAY) + 1;
  const bucket = Math.max(1, Math.ceil(days / 40));
  const bins = Array.from({ length: Math.ceil(days / bucket) }, (_, i) => ({
    date: new Date(start + i * bucket * DAY).toISOString().slice(0, 10), count: 0, bucket,
  }));
  for (const d of perDay) {
    const idx = Math.floor(Math.round((Date.parse(d.date) - start) / DAY) / bucket);
    if (bins[idx]) bins[idx].count += d.count;
  }
  return bins;
}

function CommitChart({ perDay }) {
  const bins = buildTimeline(perDay);
  if (!bins.length) return <p className="text-xs text-faint">No dated commits.</p>;
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div>
      <div className="flex h-20 items-end gap-[2px] rounded-lg border border-line bg-surface-2 px-2 pt-2" role="img"
        aria-label={`Commits over ${bins.length} ${bins[0].bucket > 1 ? "periods" : "days"}`}>
        {bins.map((b) => (
          <div key={b.date} className="group relative flex h-full flex-1 items-end">
            <div className={cx("w-full rounded-t-sm", b.count ? "bg-brand" : "bg-surface-3")}
              style={{ height: b.count ? `${Math.max(8, (b.count / max) * 100)}%` : "2px" }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] whitespace-nowrap text-text group-hover:block">
              {b.date}: {b.count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>{bins[0].date}</span>
        <span>{bins[0].bucket > 1 ? `${bins[0].bucket}-day bins` : "per day"}</span>
        <span>{bins[bins.length - 1].date}</span>
      </div>
    </div>
  );
}

function Commits({ review, signals }) {
  const c = signals?.commits || {};
  const ex = review.commits?.examples || {};
  return (
    <Section icon={GitCommitHorizontal} title="Commit history"
      aside={<span className="text-xs text-muted">{c.count ?? 0} commits · {c.spread}</span>}>
      {c.single_commit_dump && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/5 p-2.5 text-xs text-bad">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{c.dump_reason || "Looks like a single-commit dump."}
        </p>
      )}
      <CommitChart perDay={c.per_day} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Avg message" value={`${Math.round(c.avg_message_length || 0)} ch`} />
        <Stat label="Low quality" value={`${Math.round((c.low_quality_share || 0) * 100)}%`}
          tone={(c.low_quality_share || 0) > 0.3 ? "text-bad" : undefined} />
        <Stat label="Authors" value={c.authors ?? 0} />
      </div>
      {review.commits?.comment && <p className="mt-3 text-sm text-text/90"><RichText text={review.commits.comment} /></p>}
      {(ex.good?.length > 0 || ex.bad?.length > 0) && (
        <div className="mt-3 space-y-1.5">
          {ex.good?.map((m) => (
            <p key={`g-${m}`} className="flex gap-2 font-mono text-xs"><Check className="size-3.5 shrink-0 text-ok" /><span className="break-all">{m}</span></p>
          ))}
          {ex.bad?.map((m) => (
            <p key={`b-${m}`} className="flex gap-2 font-mono text-xs"><CircleX className="size-3.5 shrink-0 text-bad" /><span className="break-all">{m}</span></p>
          ))}
        </div>
      )}
    </Section>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2">
      <p className={cx("text-sm font-semibold tabular-nums", tone)}>{value}</p>
      <p className="text-[10px] text-faint uppercase">{label}</p>
    </div>
  );
}

const SECTION_LABEL = { setup: "Setup", run: "Run", tests: "Tests", decisions: "Decisions / trade-offs" };

function Readme({ review, signals }) {
  const rs = signals?.readme || {};
  const sections = rs.sections || {};
  return (
    <Section icon={BookOpen} title="README" aside={<span className="text-xs text-muted">{rs.exists ? `${rs.words} words` : "missing"}</span>}>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(SECTION_LABEL).map(([k, label]) => (
          <Badge key={k} tone={sections[k] ? "ok" : "bad"}>
            {sections[k] ? <Check className="size-3" /> : <CircleX className="size-3" />}{label}
          </Badge>
        ))}
      </div>
      {review.readme?.comment && <p className="mt-3 text-sm text-text/90"><RichText text={review.readme.comment} /></p>}
      {review.readme?.missing_sections?.length > 0 && (
        <p className="mt-2 text-xs text-muted">Add: {review.readme.missing_sections.join(", ")}</p>
      )}
    </Section>
  );
}

function TestsAndStructure({ review, signals }) {
  const t = signals?.tests || {};
  return (
    <Section icon={FlaskConical} title="Tests and structure"
      aside={review.tests?.coverage_guess && <Badge tone={{ good: "ok", moderate: "cyan", low: "warn", none: "bad" }[review.tests.coverage_guess] || "neutral"}>
        Coverage: {review.tests.coverage_guess}</Badge>}>
      {review.tests?.comment && <p className="text-sm text-text/90"><RichText text={review.tests.comment} /></p>}
      {t.sample?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {t.sample.slice(0, 5).map((p) => <code key={p} className="truncate rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-brand-2">{p}</code>)}
        </div>
      )}
      {review.structure?.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
          {review.structure.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-text/90"><ChevronRight className="mt-0.5 size-4 shrink-0 text-faint" /><RichText text={s} /></li>
          ))}
        </ul>
      )}
      {signals?.largest_files?.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold text-faint uppercase">Largest files</p>
          <ul className="space-y-1">
            {signals.largest_files.map((f) => (
              <li key={f.path} className="flex justify-between gap-3 text-xs">
                <code className="truncate font-mono text-muted">{f.path}</code>
                <span className="shrink-0 tabular-nums text-faint">{fmtSize(f.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function ListCard({ icon: Icon, title, items, tone, render }) {
  return (
    <Card className={cx("p-5", tone === "bad" && "border-bad/30", tone === "ok" && "border-ok/30")}>
      <h3 className={cx("mb-3 flex items-center gap-2 text-sm font-semibold",
        tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-text")}>
        <Icon className="size-4" />{title}
      </h3>
      {items?.length ? <ul className="space-y-2">{items.map(render)}</ul> : <p className="text-xs text-faint">Nothing noted.</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Full report                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

export function RepoReview({ submission, rubric }) {
  const review = submission?.review;
  if (!review) return null;
  const signals = submission.signals || review.signals;
  const repo = submission.repo || review.repo;
  const meta = VERDICT_META[review.verdict] || VERDICT_META["lean no"];
  const weights = Object.fromEntries((rubric || []).map((c) => [c.criterion, c.weight]));

  return (
    <div className="space-y-5">
      <Card className={cx("border p-5 sm:p-6", meta.border, meta.bg)}>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <Ring value={review.overall_score} size={128} color={scoreColor(review.overall_score)} sublabel="out of 100" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-[11px] font-semibold tracking-widest text-faint uppercase">Hiring manager verdict</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Badge tone={meta.tone} className="px-3 py-1 text-sm">{meta.label}</Badge>
              {review.ai === false && <Badge tone="warn">Signals only, AI offline</Badge>}
            </div>
            {review.rationale && <p className="mt-2 font-medium text-text">{review.rationale}</p>}
            {review.summary && <p className="mt-1.5 text-sm leading-relaxed text-muted"><RichText text={review.summary} /></p>}
            <div className="mt-4 flex justify-center sm:justify-start"><SignalChips signals={signals} /></div>
          </div>
        </div>
      </Card>

      {repo && <RepoHeader repo={repo} />}

      {signals?.secrets?.length > 0 && (
        <Card className="border-bad/40 bg-bad/5 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-bad"><KeyRound className="size-4" />Secrets committed to the repo</h3>
          <p className="mt-1 text-xs text-muted">Rotate these credentials now: they stay in git history even after you delete the file.</p>
          <ul className="mt-3 space-y-1">
            {signals.secrets.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-text">{s.file}</code>
                <span className="text-bad">{s.type}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {review.requirements?.length > 0 && <Requirements items={review.requirements} />}
        {review.rubric?.length > 0 && <Rubric items={review.rubric} weights={weights} />}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Commits review={review} signals={signals} />
        <div className="space-y-5">
          <Readme review={review} signals={signals} />
          <TestsAndStructure review={review} signals={signals} />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <ListCard icon={TriangleAlert} title="Red flags" tone="bad" items={review.red_flags}
          render={(f, i) => <li key={i} className="flex gap-2 text-sm text-text/90"><CircleX className="mt-0.5 size-3.5 shrink-0 text-bad" /><RichText text={f} /></li>} />
        <ListCard icon={ThumbsUp} title="Strengths" tone="ok" items={review.strengths}
          render={(f, i) => <li key={i} className="flex gap-2 text-sm text-text/90"><CircleCheck className="mt-0.5 size-3.5 shrink-0 text-ok" /><RichText text={f} /></li>} />
        <ListCard icon={Wrench} title="Top fixes" items={review.top_fixes}
          render={(f, i) => (
            <li key={i} className="text-sm text-text/90">
              <Badge tone={PRIORITY_TONE[f.priority] || "neutral"} className="mb-1 capitalize">{f.priority}</Badge>
              <p><RichText text={f.fix} /></p>
            </li>
          )} />
      </div>

      {review.interviewer_questions?.length > 0 && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-semibold"><MessageSquareQuote className="size-4 text-brand" />Questions the interviewer will ask you</h3>
              <p className="mt-1 text-xs text-muted">Hiring managers dig into your own repo in the follow-up call. Practise answering out loud.</p>
            </div>
            <Button href="/interview?kind=technical" size="sm"><Mic className="size-3.5" />Start a technical interview</Button>
          </div>
          <ol className="mt-4 space-y-2.5">
            {review.interviewer_questions.map((qn, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface-2 p-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-[#b4a3ff]">{i + 1}</span>
                <span className="pt-0.5"><RichText text={qn} /></span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* History list                                                                                      */
/* ------------------------------------------------------------------------------------------------ */

export function RepoReviewList({ projectId, submissions }) {
  const items = (submissions || []).filter((s) => s.kind === "repo");
  if (!items.length) return null;
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-semibold"><GitHubMark className="size-4" />Past repo reviews</h2>
      <ul className="space-y-2">
        {items.map((s) => {
          const meta = VERDICT_META[s.review?.verdict];
          const name = s.repo?.full_name || s.repo_url?.replace(/^https?:\/\/(www\.)?github\.com\//, "");
          return (
            <li key={s.id}>
              <Link href={`/projects/${projectId}/review/${s.id}`}
                className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm transition hover:border-faint hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="text-xs text-faint">{new Date(s.created_at).toLocaleString()}</span>
                </span>
                {meta && <Badge tone={meta.tone} className="hidden sm:inline-flex">{meta.label}</Badge>}
                <span className="w-8 text-right font-bold tabular-nums" style={{ color: scoreColor(s.review?.overall_score || 0) }}>
                  {s.review?.overall_score ?? "-"}
                </span>
                <ArrowRight className="size-4 shrink-0 text-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
