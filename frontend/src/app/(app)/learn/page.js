"use client";

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { useApi } from "@/lib/useApi";
import TechLogo from "@/components/TechLogo";
import { Badge, Card, ErrorState, LEVEL_TONE, PageHeader, PageLoader, Progress } from "@/components/ui";

export default function LearnPage() {
  const { data: paths, error, loading, reload } = useApi("/api/learn/paths");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Language Paths" title="Master a language, one bite at a time"
        description="Basic to Expert in six languages: short lessons, interview-style questions, real code exercises and an AI tutor beside you the whole way." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {paths.map((p) => {
          const pct = p.lessons_total ? Math.round((100 * p.lessons_completed) / p.lessons_total) : 0;
          const body = (
            <>
              <div className="flex items-start justify-between">
                <TechLogo slug={p.icon} label={p.title} size={56} />
                {p.available ? (
                  pct === 100 ? <Badge tone="ok">Completed</Badge> : pct > 0 ? <Badge tone="brand">In progress</Badge> : null
                ) : (
                  <Badge><Lock className="size-3" /> Coming soon</Badge>
                )}
              </div>
              <h2 className="mt-5 text-lg font-semibold">{p.title}</h2>
              <p className="mt-1 flex-1 text-sm text-muted">{p.description}</p>
              {p.levels?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.levels.map((lv) => <Badge key={lv} tone={LEVEL_TONE[lv]}>{lv}</Badge>)}
                </div>
              )}
              {p.available && (
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-xs text-muted">
                    <span>{p.lessons_completed}/{p.lessons_total} lessons · {p.units} units</span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} color={p.color} />
                </div>
              )}
            </>
          );
          return p.available ? (
            <Link key={p.id} href={`/learn/${p.id}`}
              className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand/50">
              {body}
              <span className="mt-4 flex items-center gap-1 text-sm font-medium text-brand">
                {p.lessons_completed ? "Continue" : "Start path"}
                <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ) : (
            <Card key={p.id} className="flex flex-col p-6 opacity-60">{body}</Card>
          );
        })}
      </div>
    </div>
  );
}
