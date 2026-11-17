"use client";

import { useSearchParams } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, CircleCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Button, Card } from "@/components/ui";

/** Shown on interview, test and project pages opened from a job application (`?application=<id>`). */
export function ApplicationBanner({ className = "mb-6" }) {
  const appId = useSearchParams().get("application");
  const { data: app } = useApi(appId ? `/api/applications/${appId}` : null);
  if (!app) return null;
  const stage = app.current !== null ? app.stages[app.current] : null;
  const text = app.status !== "vetting"
    ? app.status_label
    : stage?.status === "active"
      ? `Step ${stage.index + 1} of ${app.stages_total}: ${stage.title}. Only your first attempt counts.`
      : `Step ${stage ? stage.index + 1 : 1} of ${app.stages_total} is ready when you are.`;
  return (
    <div className={`${className} flex flex-col gap-3 rounded-2xl border border-brand-2/30 bg-brand-2/[0.06] px-4 py-3 sm:flex-row sm:items-center`}>
      <BriefcaseBusiness className="hidden size-5 shrink-0 text-brand-2 sm:block" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Vetting for {app.job.title}</p>
        <p className="text-xs text-muted">{text}</p>
      </div>
      <Button href={`/seeker/applications/${app.id}`} size="sm" variant="secondary">
        <ArrowLeft className="size-3.5" /> Back to my application
      </Button>
    </div>
  );
}

/** Job Seekers don't see scores: the hiring team does. They get a "step submitted" card instead. */
export function SeekerResultGate({ children, what = "this step" }) {
  const { user } = useAuth();
  const appId = useSearchParams().get("application");
  if (user?.account_type !== "seeker") return children;
  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <ApplicationBanner />
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <CircleCheck className="size-10 text-ok" />
        <h1 className="text-xl font-bold">Thanks, {what} is submitted</h1>
        <p className="max-w-md text-sm text-muted">
          Your results go to the Programming Haven hiring team. Your application page shows what&apos;s next.
        </p>
        <Button href={appId ? `/seeker/applications/${appId}` : "/seeker"} className="mt-2">Go to my application</Button>
      </Card>
    </div>
  );
}
