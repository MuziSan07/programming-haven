"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight, Award, ChevronLeft, CircleCheck, Crown, Hourglass, LogOut, RotateCcw, TriangleAlert, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageLoader, Ring, cx, scoreColor } from "@/components/ui";
import { RUN_STATUS, STATUS_META, TYPE_META, formatDate, formatLeft } from "@/components/vetting/shared";

function stageFacts(stage) {
  const d = stage.detail || {};
  if (stage.type === "interview") return [`${d.minutes} minutes`, `${d.questions} questions`, `Pass at ${stage.pass}`];
  if (stage.type === "test") {
    return [d.test_title, `${d.minutes} minutes`, `${d.mcq} multiple choice, ${d.coding} coding`, `Pass mark ${stage.pass}`];
  }
  return [d.project_title, `About ${d.hours} hours of work`, `${d.days} days to submit`, `Pass at ${stage.pass}`];
}

function useNow(active) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active]);
  return now;
}

function StageAction({ run, stage, onBegin, busy }) {
  const now = useNow(stage.status === "active" && Boolean(stage.deadline));
  if (stage.status === "ready") {
    return (
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-brand/30 bg-brand/[0.05] p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs text-muted">
          {stage.type === "project"
            ? "The deadline starts as soon as you begin. Build it in your own GitHub repo, then submit the link on the project page."
            : stage.type === "test"
              ? "Your next attempt at this test is the one that counts. Have a quiet room, a camera and enough time before you begin."
              : "The interview starts as soon as you begin. Answer every question: unanswered ones cost points."}
        </p>
        <Button onClick={() => onBegin(stage.index)} loading={busy}>Begin stage {stage.index + 1} <ArrowRight className="size-4" /></Button>
      </div>
    );
  }
  if (stage.status !== "active") return null;
  const left = stage.deadline && now ? new Date(stage.deadline).getTime() - now : null;
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-warn/30 bg-warn/[0.05] p-4 sm:flex-row sm:items-center">
      <div className="flex-1 text-xs text-muted">
        <p className="flex items-center gap-1.5 font-medium text-text">
          <Hourglass className="size-3.5 text-warn" />
          {stage.type === "project" ? "Waiting for your repository" : stage.type === "test" ? "Waiting for your test submission" : "Interview in progress"}
        </p>
        <p className="mt-1">
          {left !== null ? `${formatLeft(left)}. ` : ""}
          This page updates as soon as the {stage.type === "interview" ? "interview report" : stage.type === "test" ? "test is graded" : "repository review"} is ready.
        </p>
      </div>
      {stage.href && (
        <Button href={stage.href}>
          {stage.type === "test" ? "Open the test" : stage.type === "project" ? "Open the project" : "Continue the interview"}
          <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  );
}

function StageRow({ run, stage, last, onBegin, busy }) {
  const meta = STATUS_META[stage.status];
  const type = TYPE_META[stage.type];
  const StatusIcon = meta.icon;
  const open = stage.status === "ready" || stage.status === "active";
  const decided = stage.status === "passed" || stage.status === "failed";
  return (
    <li className="relative flex gap-4">
      {!last && <span className="absolute left-[19px] top-11 bottom-0 w-px bg-line" />}
      <span className={cx("relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 bg-surface", meta.ring)}>
        {stage.status === "locked" || stage.status === "ready" ? <span className="text-sm font-bold">{stage.index + 1}</span> : <StatusIcon className="size-5" />}
      </span>
      <Card className={cx("mb-4 min-w-0 flex-1 p-5", open && "border-brand/40", stage.status === "locked" && "opacity-70")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">
              <type.icon className="size-3" /> Stage {stage.index + 1} · {type.label}
            </p>
            <h3 className="mt-1 text-lg font-semibold">{stage.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {decided && stage.score !== null && (
              <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor(stage.score) }}>
                {Math.round(stage.score)}<span className="text-xs font-medium text-faint">/{stage.pass}</span>
              </span>
            )}
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">{stage.summary}</p>
        {(open || stage.status === "locked") && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stageFacts(stage).filter(Boolean).map((f) => (
              <span key={f} className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] text-muted">{f}</span>
            ))}
          </div>
        )}
        {decided && stage.note && (
          <p className={cx("mt-3 rounded-xl px-3 py-2 text-xs", stage.status === "failed" ? "bg-bad/10 text-bad" : "bg-surface-2 text-muted")}>
            {stage.note}
          </p>
        )}
        {decided && stage.href && (
          <Link href={stage.href} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            Open the full {stage.type === "test" ? "test result" : stage.type === "project" ? "repository review" : "interview report"}
            <ArrowRight className="size-3" />
          </Link>
        )}
        {run.status === "active" && <StageAction run={run} stage={stage} onBegin={onBegin} busy={busy} />}
      </Card>
    </li>
  );
}

function FinalReport({ run }) {
  const r = run.report;
  const passed = r.passed;
  return (
    <Card className={cx("mb-8 overflow-hidden", passed ? "border-ok/40" : "border-bad/40")}>
      <div className={cx("flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8", passed ? "bg-ok/[0.05]" : "bg-bad/[0.05]")}>
        <Ring value={r.overall_score} size={128} stroke={10} sublabel="average" color={scoreColor(r.overall_score)} />
        <div className="min-w-0 flex-1">
          <Badge tone={passed ? "ok" : "bad"}>
            {passed ? <Crown className="size-3" /> : <TriangleAlert className="size-3" />} {r.verdict}
          </Badge>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">{r.headline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{r.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {r.xp_gained > 0 && <Badge tone="brand"><Zap className="size-3" /> +{r.xp_gained} XP</Badge>}
            {r.certificate_id && (
              <Button href={`/verify/${r.certificate_id}`} size="sm"><Award className="size-3.5" /> View certificate</Button>
            )}
            <Button href="/vetting" size="sm" variant="secondary"><RotateCcw className="size-3.5" /> Start a new run</Button>
          </div>
        </div>
      </div>
      <div className="grid gap-6 border-t border-line p-6 md:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold">What went well</h3>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            {r.strengths.length ? r.strengths.map((s) => (
              <li key={s} className="flex gap-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" />{s}</li>
            )) : <li className="text-faint">Nothing stood out yet.</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">What held you back</h3>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            {r.gaps.length ? r.gaps.map((s) => (
              <li key={s} className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />{s}</li>
            )) : <li className="text-faint">No major gaps found.</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{passed ? "Stay sharp" : "Your comeback plan"}</h3>
          <ul className="mt-2 space-y-2">
            {r.plan.map((p) => (
              <li key={p.title}>
                <Link href={p.href} className="group block rounded-xl border border-line px-3 py-2 transition hover:border-brand/40 hover:bg-surface-2">
                  <p className="flex items-center justify-between gap-2 text-sm font-medium group-hover:text-brand">
                    {p.title} <ArrowRight className="size-3.5 shrink-0" />
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{p.detail}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export default function VettingRunPage() {
  const { id } = useParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const { data: run, error, loading, reload, setData } = useApi(`/api/vetting/runs/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const active = run?.status === "active";

  // Coming back from an interview, test or project tab: pick up the result without a loader flash.
  useEffect(() => {
    if (!active) return undefined;
    const refresh = () => {
      api(`/api/vetting/runs/${id}`).then((r) => {
        setData(r);
        if (r.user) setUser(r.user);
      }).catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(refresh, 20_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [active, id, setData, setUser]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function begin(index) {
    setBusy(true);
    setActionError("");
    try {
      const r = await api(`/api/vetting/runs/${id}/stages/${index}/begin`, { method: "POST" });
      setData((d) => ({ ...d, ...r }));
      if (r.href) router.push(r.href);
      else setBusy(false);
    } catch (err) {
      setActionError(err.message);
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      const r = await api(`/api/vetting/runs/${id}/withdraw`, { method: "POST" });
      setData((d) => ({ ...d, ...r }));
      setConfirmWithdraw(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const status = RUN_STATUS[run.status];
  const progress = Math.round((100 * run.stages_passed) / run.stages_total);

  return (
    <div className="mx-auto max-w-4xl animate-fade-up">
      <Link href="/vetting" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> Mock vetting
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-widest text-brand uppercase">{run.platform_label} pipeline</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{run.level} {run.role}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={status.tone}>{status.label}</Badge>
            Started {formatDate(run.created_at)} · {run.stages_passed} of {run.stages_total} stages passed
          </p>
        </div>
        {active && !confirmWithdraw && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmWithdraw(true)}><LogOut className="size-3.5" /> Withdraw</Button>
        )}
        {active && confirmWithdraw && (
          <div className="flex items-center gap-2 text-xs text-muted">
            End this run without a report?
            <Button variant="danger" size="sm" onClick={withdraw} loading={busy}>Withdraw</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmWithdraw(false)}>Keep going</Button>
          </div>
        )}
      </div>

      {active && (
        <div className="mb-8">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {actionError && <p className="mb-4 rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad">{actionError}</p>}
      {run.report && <FinalReport run={run} />}
      {run.badges?.length > 0 && (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3 text-sm">
          <Award className="size-4 text-warn" /> New badge: {run.badges.map((b) => b.title).join(", ")}
        </p>
      )}

      <ol>
        {run.stages.map((s, i) => (
          <StageRow key={s.key} run={run} stage={s} last={i === run.stages.length - 1} onBegin={begin} busy={busy} />
        ))}
      </ol>
    </div>
  );
}
