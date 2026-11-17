"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, Progress } from "@/components/ui";
import { JobCard, STATUS_TONE, timeAgo } from "@/components/jobs/shared";

function ApplicationRow({ app }) {
  const pct = (app.stages_done / app.stages_total) * 100;
  return (
    <Link href={`/seeker/applications/${app.id}`} className="flex flex-col gap-3 p-5 transition hover:bg-surface-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{app.job.title}</p>
        <p className="text-sm text-muted">{app.job.company} · applied {timeAgo(app.created_at)}</p>
      </div>
      <div className="w-full sm:w-48">
        <p className="mb-1.5 text-[11px] text-muted">
          {app.status === "vetting"
            ? `Step ${Math.min(app.stages_done + 1, app.stages_total)} of ${app.stages_total}`
            : `${app.stages_done} of ${app.stages_total} steps done`}
        </p>
        <Progress value={pct} className="h-1.5" />
      </div>
      <Badge tone={STATUS_TONE[app.status]}>{app.status_label}</Badge>
    </Link>
  );
}

export default function SeekerHome() {
  const { user } = useAuth();
  const apps = useApi("/api/applications");
  const profile = useApi("/api/seeker/profile");
  const jobs = useApi("/api/jobs");

  if (apps.loading || profile.loading) return <PageLoader label="Loading your applications" />;
  if (apps.error) return <ErrorState error={apps.error} onRetry={apps.reload} />;
  const applied = new Set(apps.data.applications.map((a) => a.job.id));
  const open = (jobs.data?.jobs || []).filter((j) => !applied.has(j.id));
  const p = profile.data;
  const waiting = apps.data.applications.filter((a) => a.status === "vetting" && a.current !== null
    && a.stages[a.current].status === "ready");

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Job Seeker" title={`Hi ${user.name.split(" ")[0]}`}
        description="Apply for roles posted by the Programming Haven team. Each application goes through AI vetting, and the strongest candidates go to the hiring team."
        actions={<Button href="/seeker/jobs">Browse jobs</Button>} />

      {p && !p.complete && (
        <Card className="flex flex-col gap-3 border-warn/30 bg-warn/[0.05] p-5 sm:flex-row sm:items-center">
          <CircleAlert className="size-5 shrink-0 text-warn" />
          <p className="flex-1 text-sm">Complete your profile to apply. Missing: <span className="font-medium">{p.missing.join(", ")}</span>.</p>
          <Button href="/seeker/profile" size="sm">Complete profile</Button>
        </Card>
      )}

      {waiting.length > 0 && (
        <Card className="border-brand/30 bg-brand/[0.05] p-5">
          <p className="font-semibold">Your next vetting steps</p>
          <ul className="mt-3 space-y-2">
            {waiting.map((a) => (
              <li key={a.id}>
                <Link href={`/seeker/applications/${a.id}`} className="flex items-center gap-2 text-sm hover:text-brand">
                  <ArrowRight className="size-4 text-brand" /> {a.stages[a.current].title} for {a.job.title}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-semibold">My applications</h2>
        {apps.data.applications.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted">You haven&apos;t applied for anything yet.</p>
            <Button href="/seeker/jobs" className="mt-4">Find a role</Button>
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {apps.data.applications.map((a) => <ApplicationRow key={a.id} app={a} />)}
          </Card>
        )}
      </section>

      {open.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Open roles</h2>
            <Link href="/seeker/jobs" className="text-sm text-brand hover:underline">See all</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {open.slice(0, 4).map((j) => <JobCard key={j.id} job={j} href={`/seeker/jobs/${j.id}`} />)}
          </div>
        </section>
      )}

      {p?.complete && (
        <p className="flex items-center gap-2 text-xs text-faint"><CircleCheck className="size-3.5 text-ok" /> Your profile and resume are complete.</p>
      )}
    </div>
  );
}
