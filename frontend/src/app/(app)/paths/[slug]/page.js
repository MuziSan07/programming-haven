"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Check, ChevronLeft, Info, Lightbulb } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Button, Card, ErrorState, PageLoader, Progress, Ring } from "@/components/ui";

export default function CompanyPathPage() {
  const { slug } = useParams();
  const { data: p, error, loading, reload } = useApi(`/api/paths/companies/${slug}`);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const nextStage = p.stages.find((s) => s.progress < 100);

  return (
    <div className="mx-auto max-w-4xl animate-fade-up">
      <Link href="/paths" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> All paths
      </Link>

      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: p.accent }}>Prepare for</p>
            <h1 className="mt-1 text-3xl font-bold">{p.name}</h1>
            <p className="mt-1 text-muted">{p.tagline}</p>
            {nextStage && (
              <Button href={nextStage.href} className="mt-5">
                Next: {nextStage.title} <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
          <Ring value={p.readiness} size={130} color={p.accent} sublabel="Path ready" />
        </div>
      </Card>

      <ol className="relative mt-10 space-y-6 border-l-2 border-line pl-8">
        {p.stages.map((s, i) => {
          const done = s.progress >= 100;
          return (
            <li key={s.title} className="relative">
              <span className="absolute top-5 -left-[49px] flex size-8 items-center justify-center rounded-full border-4
                border-bg text-sm font-bold"
                style={{ background: done ? "var(--color-ok)" : "var(--color-surface-3)", color: done ? "#fff" : "var(--color-muted)" }}>
                {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <Card className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <p className="text-xs text-faint">Stage {i + 1}</p>
                    <h2 className="font-semibold">{s.title}</h2>
                    <p className="mt-1 text-sm text-muted">{s.description}</p>
                    <p className="mt-3 flex gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn" /> {s.tip}
                    </p>
                  </div>
                  <div className="w-full shrink-0 sm:w-44">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted">{s.label}</span>
                      <span className="font-semibold">{s.progress}%</span>
                    </div>
                    <Progress value={s.progress} color={done ? "var(--color-ok)" : p.accent} />
                    <Button href={s.href} size="sm" variant={done ? "secondary" : "primary"} className="mt-3 w-full">
                      {done ? "Practise more" : "Train this stage"}
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 flex gap-2 text-xs text-faint"><Info className="size-4 shrink-0" /> {p.disclaimer}</p>
    </div>
  );
}
