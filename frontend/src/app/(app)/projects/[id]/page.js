"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Building, Check, ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, ClipboardPaste, FolderGit2, ListChecks, Send,
  Star, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import CodeEditor from "@/components/CodeEditor";
import { Badge, Button, Card, ErrorState, PageLoader, Progress, Ring, RichText, cx, scoreColor } from "@/components/ui";
import { TechChip } from "@/components/TechLogo";
import { GitHubMark, RepoReview, RepoReviewList, RepoSubmitPanel } from "@/components/projects/RepoReview";
import VettingBanner from "@/components/vetting/VettingBanner";

const LEVEL_TONE = { Basic: "ok", Intermediate: "cyan", Advanced: "warn", Expert: "bad" };
const VERDICT_TONE = { "Hire-level": "ok", Close: "warn", "Not yet": "bad" };

function Review({ review }) {
  if (!review) return null;
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <Ring value={review.overall_score} size={130} color={scoreColor(review.overall_score)} sublabel="out of 100" />
        <div className="flex-1">
          <Badge tone={VERDICT_TONE[review.verdict] || "neutral"} className="text-sm">{review.verdict}</Badge>
          <p className="mt-2 text-sm leading-relaxed text-text/90">{review.summary}</p>
          {review.ai === false && <p className="mt-2 text-xs text-warn">AI review was offline: saved without a score.</p>}
        </div>
      </div>
      {review.criteria?.length > 0 && (
        <div className="space-y-3">
          {review.criteria.map((c) => (
            <div key={c.criterion}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium">{c.criterion} <span className="text-faint">· {c.weight}%</span></span>
                <span className="font-semibold tabular-nums">{c.score}</span>
              </div>
              <Progress value={c.score} color={scoreColor(c.score)} />
              {c.comment && <p className="mt-1 text-xs text-muted">{c.comment}</p>}
            </div>
          ))}
        </div>
      )}
      {review.requirements_met?.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Requirements</p>
          <ul className="space-y-1.5">
            {review.requirements_met.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm">
                {r.met ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-bad" />}
                <span><span className={r.met ? "" : "text-text"}>{r.requirement}</span>
                  {r.note && <span className="text-muted"> · {r.note}</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {review.must_fix?.length > 0 && (
          <div className="rounded-xl border border-bad/30 p-3">
            <p className="mb-1 text-xs font-semibold text-bad">Must fix</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{review.must_fix.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        {review.nice_to_have?.length > 0 && (
          <div className="rounded-xl border border-brand-2/30 p-3">
            <p className="mb-1 text-xs font-semibold text-brand-2">Nice to have</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{review.nice_to_have.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ListBlock({ title, items, icon: Icon, tone = "text-brand-2" }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it} className="flex gap-2 text-sm text-text/90">
            <Icon className={cx("mt-0.5 size-4 shrink-0", tone)} /><RichText text={it} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProjectPage() {
  const { id } = useParams();
  const { setUser } = useAuth();
  const { data: p, error, loading, reload, setData } = useApi(`/api/projects/${id}`);
  const [form, setForm] = useState({ repo_url: "", notes: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [latest, setLatest] = useState(null);
  const [openSub, setOpenSub] = useState(null);
  const [mode, setMode] = useState("repo");

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  function onRepoReviewed(r) {
    if (r.user) setUser(r.user);
    setLatest(r);
    setData((d) => ({ ...d, submissions: [r, ...(d.submissions || [])] }));
  }

  const pasted = (p.submissions || []).filter((s) => s.kind !== "repo");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setSubmitError("");
    try {
      const r = await api(`/api/projects/${p.id}/submit`, { body: form });
      if (r.user) setUser(r.user);
      setLatest(r);
      setData((d) => ({ ...d, submissions: [r, ...(d.submissions || [])] }));
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <Link href="/projects" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> All projects
      </Link>
      <VettingBanner />

      <div className="mb-8">
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{p.niche}</Badge>
          <Badge tone={LEVEL_TONE[p.level]}>{p.level}</Badge>
          <Badge><Clock className="size-3" />~{p.hours}h</Badge>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{p.title}</h1>
        <p className="mt-2 max-w-3xl text-muted">{p.summary}</p>
        {p.companies?.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Building className="size-3.5" /> Assigned in screenings like:
            {p.companies.map((c) => <span key={c} className="rounded-md bg-surface-2 px-2 py-0.5">{c}</span>)}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="space-y-4 p-6">
            <h2 className="font-semibold">The brief</h2>
            {String(p.brief).split("\n\n").map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-text/90"><RichText text={para} /></p>
            ))}
          </Card>
          <Card className="space-y-6 p-6">
            <ListBlock title="Requirements" items={p.requirements} icon={ListChecks} />
            <ListBlock title="Stretch goals" items={p.stretch} icon={Star} tone="text-warn" />
            <ListBlock title="Deliverables" items={p.deliverables} icon={Check} tone="text-ok" />
            {p.tech?.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Suggested tech</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.tech.map((t) => <TechChip key={t} name={t} className="px-2.5 py-1 text-xs" />)}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <p className="border-b border-line px-5 py-3 text-sm font-semibold">How you&apos;ll be graded</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {p.rubric.map((c) => (
                  <tr key={c.criterion} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-medium">{c.criterion}</p>
                      <p className="mt-0.5 text-xs text-muted">{c.description}</p>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold whitespace-nowrap text-brand">{c.weight}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Send className="size-4 text-brand" /> Submit for review</h2>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1" role="tablist">
              {[["repo", "GitHub repo", GitHubMark], ["paste", "Paste code", ClipboardPaste]].map(([k, label, Icon]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                  className={cx("flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    mode === k ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}>
                  <Icon className="size-3.5" />{label}
                </button>
              ))}
            </div>
            {mode === "repo" ? (
              <div className="mt-4">
                <p className="mb-3 text-xs text-muted">
                  Submit your GitHub repo and get reviewed like a hiring manager would: code, tests, README, commit
                  history and every requirement, with file evidence.
                </p>
                <RepoSubmitPanel projectId={p.id} onReviewed={onRepoReviewed} />
              </div>
            ) : (
            <>
            <p className="mt-3 text-xs text-muted">Paste your key files (or the whole thing). The AI reviews them strictly against the rubric.</p>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="repo">Repository URL</label>
                <input id="repo" className="input" placeholder="https://github.com/you/project" value={form.repo_url}
                  onChange={(e) => setForm({ ...form, repo_url: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="notes">Notes & decisions</label>
                <textarea id="notes" className="input min-h-24 resize-y" value={form.notes}
                  placeholder="Architecture, trade-offs, what you'd do with more time…"
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div>
                <span className="label">Key files</span>
                <div className="h-64 overflow-hidden rounded-xl border border-line">
                  <CodeEditor value={form.code} language="plaintext" onChange={(v) => setForm((f) => ({ ...f, code: v }))} />
                </div>
                <p className="mt-1 text-[11px] text-faint">Tip: separate files with a header line like {"// --- src/app.js ---"}</p>
              </div>
              {submitError && <p className="text-sm text-bad">{submitError}</p>}
              <Button type="submit" className="w-full" loading={busy} disabled={!form.code.trim() && !form.notes.trim()}>
                <Send className="size-4" /> {busy ? "Reviewing…" : "Submit for review"}
              </Button>
            </form>
            </>
            )}
          </Card>
        </div>
      </div>

      {latest?.kind === "repo" && (
        <div className="mt-8 animate-fade-up">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Repository review</h2>
            {latest.xp_gained > 0 && <span className="flex items-center gap-1 text-sm font-semibold text-brand"><Zap className="size-4" />+{latest.xp_gained} XP</span>}
          </div>
          <RepoReview submission={latest} rubric={p.rubric} />
        </div>
      )}

      <div className="mt-5"><RepoReviewList projectId={p.id} submissions={p.submissions} /></div>

      {latest && latest.kind !== "repo" && (
        <Card className="mt-5 animate-fade-up p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-semibold">Review</h2>
            {latest.xp_gained > 0 && <span className="flex items-center gap-1 text-sm font-semibold text-brand"><Zap className="size-4" />+{latest.xp_gained} XP</span>}
          </div>
          <Review review={latest.review} />
        </Card>
      )}

      {pasted.length > 0 && (
        <Card className="mt-5 p-6">
          <h2 className="mb-4 font-semibold">Pasted submissions</h2>
          <ul className="space-y-2">
            {pasted.map((s) => (
              <li key={s.id} className="rounded-xl border border-line">
                <button onClick={() => setOpenSub(openSub === s.id ? null : s.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
                  <ChevronRight className={cx("size-4 shrink-0 text-muted transition", openSub === s.id && "rotate-90")} />
                  <span className="flex-1 truncate">
                    {s.repo_url ? <span className="flex items-center gap-1.5"><FolderGit2 className="size-3.5 text-faint" />{s.repo_url}</span>
                      : "Pasted submission"}
                  </span>
                  {s.review?.overall_score !== undefined && (
                    <span className="font-bold" style={{ color: scoreColor(s.review.overall_score) }}>{s.review.overall_score}</span>
                  )}
                  <span className="hidden text-xs text-faint sm:block">{new Date(s.created_at).toLocaleString()}</span>
                </button>
                {openSub === s.id && <div className="border-t border-line p-4"><Review review={s.review} /></div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
