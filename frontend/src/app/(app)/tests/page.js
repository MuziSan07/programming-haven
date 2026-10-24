"use client";

import Link from "next/link";
import { ArrowRight, Camera, ClipboardCheck, Clock, Code, Eye, ShieldCheck } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, DIFFICULTY_TONE, ErrorState, PageHeader, PageLoader, scoreColor } from "@/components/ui";

export default function TestsPage() {
  const { data: tests, error, loading, reload } = useApi("/api/tests");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Mock Tests" title="Proctored assessments"
        description="Hard, timed, company-style assessments that feel like the real thing: webcam face detection, tab and paste monitoring, and an Integrity Report at the end." />

      <Card className="mb-8 grid gap-4 p-5 sm:grid-cols-4">
        {[[Camera, "Face detection", "Runs on your device. No video is uploaded."],
          [Eye, "Focus tracking", "Tab switches and window changes are logged."],
          [ShieldCheck, "Integrity score", "Practise staying clean under pressure."],
          [Clock, "Real time limits", "Auto-submits when the clock hits zero."]].map(([Icon, t, d]) => (
          <div key={t} className="flex gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand-2" />
            <div>
              <p className="text-sm font-semibold">{t}</p>
              <p className="text-xs text-muted">{d}</p>
            </div>
          </div>
        ))}
      </Card>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {tests.map((t) => (
          <Card key={t.id} className="flex flex-col p-6">
            <div className="flex items-center justify-between">
              <span className="flex gap-1.5">
                <Badge tone="brand">{t.style}</Badge>
                <Badge tone={DIFFICULTY_TONE[t.difficulty] || "neutral"}>{t.difficulty}</Badge>
              </span>
              <span className="flex items-center gap-1 text-xs text-muted"><Clock className="size-3.5" />{t.duration_minutes} min</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold">{t.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted">{t.description}</p>
            <div className="mt-5 flex gap-4 text-xs text-muted">
              {t.mcq_count > 0 && <span className="flex items-center gap-1"><ClipboardCheck className="size-3.5" />{t.mcq_count} questions</span>}
              {t.coding_count > 0 && <span className="flex items-center gap-1"><Code className="size-3.5" />{t.coding_count} coding</span>}
              <span>Pass: {t.pass_mark}%</span>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              {t.best_score !== null ? (
                <Link href={`/tests/result/${t.best_attempt_id}`} className="text-sm">
                  <span className="text-muted">Best: </span>
                  <span className="font-bold" style={{ color: scoreColor(t.best_score) }}>{Math.round(t.best_score)}%</span>
                  <span className="text-xs text-faint"> · {t.attempts} attempt{t.attempts > 1 ? "s" : ""}</span>
                </Link>
              ) : <span className="text-sm text-faint">Not attempted</span>}
              <Button href={`/tests/${t.id}`} size="sm">Start <ArrowRight className="size-3.5" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
