"use client";

import { useParams } from "next/navigation";
import { CircleCheck, CircleX, Clock, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useApi } from "@/lib/useApi";
import VettingBanner from "@/components/vetting/VettingBanner";
import { Badge, Button, Card, CodeBlock, ErrorState, PageLoader, Ring, RichText, cx, scoreColor } from "@/components/ui";

export default function TestResultPage() {
  const { attemptId } = useParams();
  const { data: r, error, loading, reload } = useApi(`/api/tests/attempts/${attemptId}`);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const minutes = r.duration_seconds ? Math.round(r.duration_seconds / 60) : null;

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <VettingBanner />
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Badge tone="brand">{r.style}</Badge>
          <h1 className="mt-2 text-3xl font-bold">{r.title}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <Clock className="size-3.5" /> {minutes !== null ? `Completed in ${minutes} min` : ""}
            {r.late && <Badge tone="bad" className="ml-2">Submitted late</Badge>}
          </p>
        </div>
        <Button href={`/tests/${r.test_id}`} variant="secondary"><RotateCcw className="size-4" /> Retake</Button>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card className="flex flex-col items-center p-6 text-center">
          <Ring value={r.score} size={150} color={scoreColor(r.score)} label={`${Math.round(r.score)}%`} sublabel="Score" />
          <p className={cx("mt-4 text-lg font-bold", r.passed ? "text-ok" : "text-bad")}>
            {r.passed ? "Passed" : "Not passed"}
          </p>
          <p className="text-xs text-muted">Pass mark {r.pass_mark}% with integrity ≥ 60</p>
        </Card>
        <Card className="p-6 md:col-span-2">
          <div className="flex items-center gap-4">
            <Ring value={r.integrity_score} size={96} stroke={9} color={scoreColor(r.integrity_score)} />
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-brand-2" /> Integrity Report</h2>
              <p className="text-sm text-muted">
                {r.integrity.length === 0 ? "Clean session: no proctoring flags. This is what reviewers want to see."
                  : "Real proctors flag these events. Practise until your report is clean."}
              </p>
            </div>
          </div>
          {r.integrity.length > 0 && (
            <ul className="mt-5 divide-y divide-line">
              {r.integrity.map((v) => (
                <li key={v.type} className="flex items-center gap-3 py-2.5 text-sm">
                  <TriangleAlert className="size-4 text-warn" />
                  <span className="flex-1">{v.label}</span>
                  <span className="text-muted">×{v.count}</span>
                  <span className="w-12 text-right font-medium text-bad">−{v.penalty}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {r.coding.length > 0 && (
        <Card className="mt-5 p-6">
          <h2 className="mb-4 font-semibold">Coding problems</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {r.coding.map((c) => (
              <div key={c.slug} className="flex items-center gap-3 rounded-xl border border-line p-4">
                {c.status === "Accepted" ? <CircleCheck className="size-5 text-ok" /> : <CircleX className="size-5 text-bad" />}
                <div className="flex-1">
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted">{c.status} · {c.passed}/{c.total} tests</p>
                </div>
                <Button href={`/dsa/${c.slug}`} size="sm" variant="ghost">Practise</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {r.mcq.length > 0 && (
        <Card className="mt-5 p-6">
          <h2 className="mb-4 font-semibold">
            Multiple choice · {r.mcq.filter((m) => m.correct).length}/{r.mcq.length} correct
          </h2>
          <ol className="space-y-4">
            {r.mcq.map((m, i) => (
              <li key={m.id} className="rounded-xl border border-line p-4">
                <p className="flex gap-2 text-sm font-medium">
                  {m.correct ? <CircleCheck className="size-4 shrink-0 text-ok" /> : <CircleX className="size-4 shrink-0 text-bad" />}
                  <span>{i + 1}. <RichText text={m.question} /></span>
                </p>
                {m.code && <CodeBlock code={m.code} className="mt-2 ml-6 text-xs" />}
                <div className="mt-2 space-y-1 pl-6 text-sm">
                  {m.chosen !== null && m.chosen !== undefined && !m.correct && (
                    <p className="text-bad">Your answer: <RichText text={m.options[m.chosen]} /></p>
                  )}
                  {(m.chosen === null || m.chosen === undefined) && <p className="text-faint">Not answered</p>}
                  <p className="text-ok">Correct: <RichText text={m.options[m.answer]} /></p>
                  {m.explanation && <p className="pt-1 text-muted"><RichText text={m.explanation} /></p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
