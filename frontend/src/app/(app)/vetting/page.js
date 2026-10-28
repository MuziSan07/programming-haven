"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CircleCheck, Crown, Flag, ShieldCheck, Target, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, cx } from "@/components/ui";
import { ROLES, RUN_STATUS, TYPE_META, formatDate } from "@/components/vetting/shared";

const RULES = [
  [Flag, "Stages run in order", "Each stage opens only after you pass the one before it."],
  [Target, "First attempt counts", "Retakes are allowed for practice, but only your first attempt decides the stage."],
  [Timer, "Real time limits", "Tests are timed and proctored, and the take-home project has a deadline."],
  [ShieldCheck, "One failure ends it", "Fail a stage and the run stops there with a report on what to fix."],
];

function StartForm({ platform, levels, onCancel }) {
  const router = useRouter();
  const { user } = useAuth();
  const [role, setRole] = useState(ROLES.includes(user?.target_role) ? user.target_role : ROLES[0]);
  const [level, setLevel] = useState("Mid-level");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const run = await api("/api/vetting/runs", { body: { platform: platform.id, role, level } });
      router.push(`/vetting/${run.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const field = "mt-1 h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-brand";
  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-2/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Level
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={field}>
            {levels.map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={start} loading={busy}>Begin the {platform.label} pipeline</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function PlatformCard({ platform, levels, open, onOpen, onClose }) {
  const run = platform.active_run;
  const { stats } = platform;
  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{platform.label}</h2>
          <p className="mt-0.5 text-xs text-faint">{platform.claim}</p>
        </div>
        {platform.passed && <Badge tone="ok"><CircleCheck className="size-3" /> Passed</Badge>}
      </div>
      <p className="mt-3 text-sm text-muted">{platform.about}</p>

      <ol className="mt-5 space-y-2.5">
        {platform.stages.map((s, i) => {
          const Icon = TYPE_META[s.type].icon;
          const reached = run && i < run.stages_passed;
          const current = run && i === run.current;
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                reached ? "border-ok bg-ok/10 text-ok" : current ? "border-brand text-brand" : "border-line text-muted")}>
                {reached ? <CircleCheck className="size-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{s.title}</p>
                <p className="flex items-center gap-1 text-[11px] text-faint">
                  <Icon className="size-3" /> {TYPE_META[s.type].label} · pass at {s.pass}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-auto pt-6">
        <p className="mb-3 text-[11px] text-faint">
          {stats.finished
            ? `${stats.pass_rate}% of ${stats.finished} finished Haven run${stats.finished === 1 ? "" : "s"} passed`
            : "No finished Haven runs yet"}
          {platform.best !== null && ` · your best average ${platform.best}`}
        </p>
        {run ? (
          <Button href={`/vetting/${run.id}`} className="w-full">
            Continue: stage {run.current + 1} of {run.stages_total} <ArrowRight className="size-4" />
          </Button>
        ) : open ? (
          <StartForm platform={platform} levels={levels} onCancel={onClose} />
        ) : (
          <Button variant="secondary" className="w-full" onClick={onOpen}>
            Start a {platform.label} run <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}

function History({ runs }) {
  if (!runs.length) return null;
  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-line px-5 py-4"><h2 className="font-semibold">Your runs</h2></div>
      <ul className="divide-y divide-line">
        {runs.map((r) => {
          const status = RUN_STATUS[r.status];
          return (
            <li key={r.id}>
              <Link href={`/vetting/${r.id}`} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-brand">{r.platform_label} · {r.level} {r.role}</p>
                  <p className="text-[11px] text-faint">
                    {formatDate(r.created_at)} · {r.stages_passed} of {r.stages_total} stages passed
                    {r.verdict && r.status !== "passed" ? ` · ${r.verdict}` : ""}
                  </p>
                </div>
                {r.overall_score !== null && r.overall_score !== undefined && (
                  <span className="text-sm font-semibold tabular-nums">{r.overall_score}</span>
                )}
                <Badge tone={status.tone}>{status.label}</Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function VettingPage() {
  const { data, error, loading, reload } = useApi("/api/vetting/platforms");
  const [open, setOpen] = useState(null);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Mock vetting" title="The final boss"
        description="Go through the full hiring pipeline of Toptal, Turing or Lemon.io, stage by stage, before you spend your one real attempt. Pass every stage to earn a verifiable certificate." />

      <Card className="mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {RULES.map(([Icon, title, text]) => (
          <div key={title} className="flex gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-xs text-muted">{text}</p>
            </div>
          </div>
        ))}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {data.platforms.map((p) => (
          <PlatformCard key={p.id} platform={p} levels={data.levels} open={open === p.id}
            onOpen={() => setOpen(p.id)} onClose={() => setOpen(null)} />
        ))}
      </div>

      <History runs={data.runs} />

      <p className="mt-6 flex items-center gap-2 text-[11px] text-faint">
        <Crown className="size-3.5" /> These pipelines are modelled on how each network describes its process. Haven is not affiliated with them.
      </p>
    </div>
  );
}
