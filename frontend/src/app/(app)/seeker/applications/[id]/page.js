"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ChevronLeft, CircleCheck, CircleX, Clock, Lock, MinusCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageLoader, cx } from "@/components/ui";
import { STAGE_META, STATUS_TONE, stageLength, timeAgo } from "@/components/jobs/shared";

const STEP_STATUS = {
  passed: { icon: CircleCheck, label: "Completed", tone: "ok" },
  failed: { icon: CircleX, label: "Completed", tone: "neutral" },
  active: { icon: Clock, label: "In progress", tone: "brand" },
  ready: { icon: ArrowRight, label: "Ready", tone: "cyan" },
  locked: { icon: Lock, label: "Locked", tone: "neutral" },
  skipped: { icon: MinusCircle, label: "Not needed", tone: "neutral" },
};

const BEFORE = {
  resume: "Our AI reads your resume and profile against the job description.",
  interview: "A voice interview with our AI interviewer. Use a quiet room, a microphone and a stable connection. Your first attempt is the one that counts.",
  test: "A timed test with camera proctoring and tab-switch checks. Once you start, the clock runs.",
  project: "A real take-home project. Submit a GitHub repository before the deadline.",
};

function Step({ app, stage, onBegin, busy }) {
  const meta = STAGE_META[stage.type];
  const st = STEP_STATUS[stage.status] || STEP_STATUS.locked;
  const Icon = meta.icon;
  const current = app.current === stage.index && app.status === "vetting";
  return (
    <li className={cx("rounded-2xl border p-5", current ? "border-brand/40 bg-brand/[0.04]" : "border-line bg-surface")}>
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${meta.color}1f`, color: meta.color }}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Step {stage.index + 1}: {stage.title}</p>
            <Badge tone={st.tone}><st.icon className="size-3" /> {st.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">{meta.label} · {stageLength(stage)}{stage.project_title ? ` · ${stage.project_title}` : ""}</p>
          {current && <p className="mt-3 text-sm leading-relaxed text-muted">{BEFORE[stage.type]}</p>}
          {stage.status === "active" && stage.deadline && (
            <p className="mt-2 text-xs text-warn">Due {new Date(stage.deadline).toLocaleString()}</p>
          )}
          {current && stage.status === "ready" && (
            <Button className="mt-4" loading={busy} onClick={() => onBegin(stage.index)}>Start this step <ArrowRight className="size-4" /></Button>
          )}
          {stage.status === "active" && stage.href && (
            <Button className="mt-4" href={stage.href}>Continue <ArrowRight className="size-4" /></Button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ApplicationPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: app, error, loading, reload, setData } = useApi(`/api/applications/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (loading) return <PageLoader label="Loading your application" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const begin = async (index) => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await api(`/api/applications/${app.id}/stages/${index}/begin`, { method: "POST" });
      setData(res);
      if (res.href) router.push(res.href);
      else setBusy(false);
    } catch (e) {
      setActionError(e.message);
      setBusy(false);
    }
  };
  const withdraw = async () => {
    if (!window.confirm("Withdraw this application? You can't apply for the same job again.")) return;
    try {
      setData(await api(`/api/applications/${app.id}/withdraw`, { method: "POST" }));
    } catch (e) {
      setActionError(e.message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/seeker" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> My applications
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{app.job.company} · applied {timeAgo(app.created_at)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{app.job.title}</h1>
        </div>
        <Badge tone={STATUS_TONE[app.status]} className="self-start sm:self-auto">{app.status_label}</Badge>
      </div>

      {app.feedback && (
        <Card className="mb-6 p-5">
          <p className="text-sm leading-relaxed">{app.feedback}</p>
        </Card>
      )}
      {actionError && <p className="mb-4 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{actionError}</p>}

      <h2 className="mb-3 font-semibold">Vetting steps</h2>
      <ol className="space-y-3">
        {app.stages.map((s) => <Step key={s.index} app={app} stage={s} onBegin={begin} busy={busy} />)}
      </ol>
      <p className="mt-4 text-xs text-faint">
        Results from each step go to the Programming Haven hiring team. You&apos;ll see your status change here as they review.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="secondary" href={`/seeker/jobs/${app.job.id}`}>View job description</Button>
        {["vetting", "vetted", "shortlisted"].includes(app.status) && (
          <Button variant="ghost" onClick={withdraw}>Withdraw application</Button>
        )}
      </div>
    </div>
  );
}
