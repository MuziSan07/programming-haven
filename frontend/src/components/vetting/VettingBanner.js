"use client";

import { useSearchParams } from "next/navigation";
import { ArrowLeft, Crown } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Button } from "@/components/ui";

/** Shown on interview, test and project pages opened from a mock vetting run (`?vetting=<runId>`). */
export default function VettingBanner({ className = "mb-6" }) {
  const runId = useSearchParams().get("vetting");
  const { data: run } = useApi(runId ? `/api/vetting/runs/${runId}` : null);
  if (!run) return null;

  const stage = run.current !== null ? run.stages[run.current] : null;
  const text = run.status !== "active"
    ? "This run is finished. Your final report is ready."
    : stage?.status === "active"
      ? `Stage ${stage.index + 1} of ${run.stages_total}: ${stage.title}. Only your first attempt counts.`
      : `Stage ${stage ? stage.index + 1 : 1} of ${run.stages_total} is ready when you are.`;

  return (
    <div className={`${className} flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand/[0.06] px-4 py-3 sm:flex-row sm:items-center`}>
      <Crown className="hidden size-5 shrink-0 text-brand sm:block" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{run.platform_label} mock vetting</p>
        <p className="text-xs text-muted">{text}</p>
      </div>
      <Button href={`/vetting/${run.id}`} size="sm" variant="secondary">
        <ArrowLeft className="size-3.5" /> Back to the run
      </Button>
    </div>
  );
}
