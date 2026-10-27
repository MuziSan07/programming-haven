"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ChevronLeft, CircleCheck, CircleX, FileCode, GitPullRequest, Lightbulb, MessageSquare, RotateCcw, Send, ShieldAlert,
  TriangleAlert, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import TechLogo from "@/components/TechLogo";
import { Badge, Button, DIFFICULTY_TONE, ErrorState, Markdown, PageLoader, Ring, RichText, cx, scoreColor } from "@/components/ui";
import ReviewCode, { SeverityBadge } from "@/components/rounds/ReviewCode";
import { LANGUAGE_LABEL, RoundTimer, useRoundClock } from "@/components/rounds/shared";

const VERDICTS = [
  { id: "approve", label: "Approve", help: "Ship it as is." },
  { id: "request_changes", label: "Request changes", help: "Must be fixed before merging." },
  { id: "comment", label: "Comment", help: "Feedback without a decision." },
];

export default function ReviewRoundPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/api/rounds/review/${id}`);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <Workspace key={data.id} round={data} />;
}

function Results({ result, submitted, onJump, onRetry }) {
  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex items-center gap-4">
        <Ring value={result.score} size={88} stroke={8} color={scoreColor(result.score)} />
        <div className="min-w-0">
          <p className={cx("text-lg font-bold", result.passed ? "text-ok" : "text-bad")}>
            {result.passed ? "Review passed" : "Not passed"}
          </p>
          <p className="text-sm text-muted">Found {result.found} of {result.total} planted issues</p>
          {result.xp_gained > 0 && (
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-brand"><Zap className="size-4" /> +{result.xp_gained} XP</p>
          )}
        </div>
      </div>
      {result.critical_missed && (
        <div className="flex gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          You missed a critical issue. In a live round that alone usually ends the interview, whatever else you caught.
        </div>
      )}
      {result.summary_feedback && (
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold text-brand">Reviewer feedback</p>
          <p className="text-text/90">{result.summary_feedback}</p>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold text-muted">Planted issues</p>
        <ul className="space-y-2">
          {result.issues.map((x) => (
            <li key={x.id} className={cx("rounded-xl border p-3 text-sm", x.found ? "border-ok/30" : "border-bad/30")}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {x.found ? <CircleCheck className="size-4 text-ok" /> : <CircleX className="size-4 text-bad" />}
                <span className={cx("font-semibold", x.found ? "text-ok" : "text-bad")}>{x.found ? "Found" : "Missed"}</span>
                <SeverityBadge severity={x.severity} />
                <Badge className="capitalize">{x.category}</Badge>
                <button onClick={() => onJump(x.file, x.line)} className="ml-auto font-mono text-faint hover:text-brand-2">
                  {x.file}:{x.line}
                </button>
              </div>
              <p className="mt-2 text-text/90"><RichText text={x.description} /></p>
              {x.fix && <p className="mt-1 text-muted"><span className="font-medium text-text">Fix: </span><RichText text={x.fix} /></p>}
              {x.feedback && <p className="mt-2 text-xs text-brand-2">{x.feedback}</p>}
              {x.comments?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {x.comments.map((ci) => submitted[ci] && (
                    <p key={ci} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
                      <span className="font-mono text-faint">Your comment, line {submitted[ci].line}: </span>{submitted[ci].body}
                    </p>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {result.false_positives?.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-warn"><TriangleAlert className="size-3.5" /> False positives (-3 each)</p>
          <ul className="space-y-2">
            {result.false_positives.map((fp, i) => (
              <li key={i} className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs">
                {submitted[fp.index] && (
                  <p className="text-muted"><span className="font-mono text-faint">{submitted[fp.index].file}:{submitted[fp.index].line}: </span>
                    {submitted[fp.index].body}</p>
                )}
                <p className="mt-1 text-warn">{fp.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.explanation && (
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warn"><Lightbulb className="size-3.5" /> What a strong review covers</p>
          <Markdown>{result.explanation}</Markdown>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onRetry}><RotateCcw className="size-3.5" /> Review again</Button>
        <Button size="sm" href="/rounds">More rounds</Button>
      </div>
    </div>
  );
}

function Workspace({ round }) {
  const { setUser } = useAuth();
  const { startedAt, elapsed } = useRoundClock();
  const fileNames = Object.keys(round.files);
  const [active, setActive] = useState(fileNames[0]);
  const [comments, setComments] = useState([]);
  const [nextId, setNextId] = useState(1);
  const [draft, setDraft] = useState(null);
  const [summary, setSummary] = useState("");
  const [verdict, setVerdict] = useState("request_changes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState([]);

  function saveComment(c) {
    if (c.id) {
      setComments((list) => list.map((x) => (x.id === c.id ? c : x)));
    } else {
      setComments((list) => [...list, { ...c, id: nextId }].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line));
      setNextId((n) => n + 1);
    }
    setDraft(null);
  }

  function jump(file, line) {
    setActive(file);
    requestAnimationFrame(() => {
      document.getElementById(`line-${file}-${line}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function submit() {
    setBusy(true);
    setError("");
    const payload = comments.map(({ file, line, body, severity }) => ({ file, line, body, severity }));
    try {
      const r = await api(`/api/rounds/review/${round.id}/submit`,
        { body: { comments: payload, summary, verdict, started_at: startedAt } });
      setSubmitted(payload);
      setResult(r);
      setDraft(null);
      if (r.user) setUser(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const counts = Object.fromEntries(fileNames.map((f) => [f, comments.filter((c) => c.file === f).length]));
  const fileIssues = result ? result.issues.filter((x) => x.file === active) : null;

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/rounds" className="flex items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft className="size-4" /> Rounds
        </Link>
        {round.best?.passed && <Badge tone="ok"><CircleCheck className="size-3" /> Passed · best {Math.round(round.best.score)}</Badge>}
        <span className="ml-auto"><RoundTimer minutes={round.time_minutes} elapsed={elapsed} /></span>
      </div>

      <header className="card mb-4 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
            <GitPullRequest className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg leading-snug font-semibold sm:text-xl">{round.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone="ok">Open</Badge>
              <span className="flex items-center gap-1.5"><TechLogo slug={round.language} size={14} tile={false} />{LANGUAGE_LABEL[round.language] || round.language}</span>
              <Badge tone={DIFFICULTY_TONE[round.difficulty]}>{round.difficulty}</Badge>
              <span>{fileNames.length} file{fileNames.length === 1 ? "" : "s"} changed</span>
              <span>{round.issue_count} planted issues</span>
            </div>
          </div>
        </div>
        {round.context && (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4 text-sm leading-relaxed text-text/90">
            <p className="mb-1 text-xs font-semibold text-muted">Author&apos;s description</p>
            <RichText text={round.context} />
          </div>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <div className="flex items-center gap-1 overflow-x-auto rounded-t-xl border border-line bg-surface px-2" role="tablist">
            {fileNames.map((f) => (
              <button key={f} role="tab" aria-selected={active === f} onClick={() => setActive(f)}
                className={cx("flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 font-mono text-xs",
                  active === f ? "border-brand text-text" : "border-transparent text-muted hover:text-text")}>
                <FileCode className="size-3.5" />{f}
                {counts[f] > 0 && <span className="rounded-full bg-brand/20 px-1.5 text-[10px] text-[#b4a3ff]">{counts[f]}</span>}
              </button>
            ))}
          </div>
          <ReviewCode key={active} file={active} code={round.files[active]} comments={comments.filter((c) => c.file === active)}
            issues={fileIssues} draft={draft} setDraft={setDraft} onSave={saveComment} locked={!!result}
            onDelete={(cid) => setComments((list) => list.filter((c) => c.id !== cid))} />
          {!result && (
            <p className="mt-2 text-xs text-faint">Click a line number (or the + that appears on hover) to leave a comment on that line.</p>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <div className="card p-4">
            {result ? (
              <Results result={result} submitted={submitted} onJump={jump}
                onRetry={() => { setResult(null); setSubmitted([]); }} />
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="size-4 text-brand-2" /> Your review
                  <span className="ml-auto text-xs font-normal text-faint">{comments.length} comment{comments.length === 1 ? "" : "s"}</span>
                </p>
                {comments.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-center text-xs text-faint">
                    No comments yet. Interviewers expect you to explain the impact and the fix, not just point at a line.
                  </p>
                ) : (
                  <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
                    {comments.map((c) => (
                      <li key={c.id}>
                        <button onClick={() => jump(c.file, c.line)}
                          className="w-full rounded-lg border border-line px-2.5 py-2 text-left text-xs hover:border-brand/50">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-mono text-faint">{c.file}:{c.line}</span>
                            <span className="ml-auto"><SeverityBadge severity={c.severity} /></span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-muted">{c.body}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <label htmlFor="review-summary" className="label mt-4">Overall summary</label>
                <textarea id="review-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={4000}
                  placeholder="Summarise the main risks and what must change before merge…" className="input min-h-24 resize-y text-[13px]" />

                <fieldset className="mt-4">
                  <legend className="label">Verdict</legend>
                  <div className="space-y-1.5">
                    {VERDICTS.map((v) => (
                      <label key={v.id} className={cx("flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-sm",
                        verdict === v.id ? "border-brand bg-brand/10" : "border-line hover:border-faint")}>
                        <input type="radio" name="verdict" value={v.id} checked={verdict === v.id}
                          onChange={() => setVerdict(v.id)} className="mt-1 accent-[#7c5cff]" />
                        <span>
                          <span className="font-medium">{v.label}</span>
                          <span className="block text-xs text-muted">{v.help}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {error && <p className="mt-3 text-sm text-bad">{error}</p>}
                <Button className="mt-4 w-full" onClick={submit} loading={busy} disabled={!comments.length}>
                  <Send className="size-4" /> Submit review
                </Button>
                {busy && <p className="mt-2 text-center text-xs text-faint">Grading your review against the answer key…</p>}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
