"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { ErrorState, PageHeader, PageLoader, Progress } from "@/components/ui";

export default function PathsPage() {
  const { data: paths, error, loading, reload } = useApi("/api/paths/companies");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Company Prep Paths" title="Train for the exact pipeline you're applying to"
        description="Each path mirrors a network's screening stages and links every stage to the practice that prepares you for it." />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {paths.map((p) => (
          <Link key={p.slug} href={`/paths/${p.slug}`}
            className="card group relative flex flex-col overflow-hidden p-6 transition hover:-translate-y-0.5 hover:border-brand/50">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: p.accent }} />
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl text-lg font-bold"
                style={{ background: `${p.accent}22`, color: p.accent }}>{p.name[0]}</span>
              <div>
                <h2 className="font-semibold">{p.name}</h2>
                <p className="text-xs text-muted">{p.tagline}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {p.focus.map((f) => (
                <span key={f} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{f}</span>
              ))}
            </div>
            <div className="mt-auto pt-6">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-muted">{p.stages.length} stages</span>
                <span className="font-semibold">{p.readiness}% ready</span>
              </div>
              <Progress value={p.readiness} color={p.accent} />
              <span className="mt-4 flex items-center gap-1 text-sm font-medium" style={{ color: p.accent }}>
                View path <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
