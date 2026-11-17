"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ChevronLeft, CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useActiveTime } from "@/lib/useActiveTime";
import { Badge, Button, Card, ErrorState, Markdown, PageLoader } from "@/components/ui";
import { Choices } from "@/components/mind/runners";
import { Review, Rewards } from "@/components/mind/shared";

function Checks({ lesson, onDone }) {
  const [answers, setAnswers] = useState(() => lesson.checks.map(() => null));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/api/mind/lessons/${lesson.id}/submit`, { body: { answers } });
      setResult(res);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{result.passed ? "Passed. All three right." : `${result.correct} of ${result.total} right. Get all three to pass.`}</p>
            <div className="mt-2"><Rewards xp={result.xp} badges={result.new_badges} /></div>
          </div>
          <div className="flex gap-2">
            {!result.passed && <Button variant="secondary" onClick={() => { setResult(null); setAnswers(lesson.checks.map(() => null)); }}>Try again</Button>}
            {lesson.next
              ? <Button href={`/mind/lessons/${lesson.next}`}>Next lesson <ArrowRight className="size-4" /></Button>
              : <Button href="/mind?tab=calm">Back to lessons</Button>}
          </div>
        </Card>
        <Review items={result.review} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {lesson.checks.map((c, i) => (
        <Card key={i} className="p-5">
          <p className="text-xs font-medium text-muted">Scenario {i + 1}</p>
          <p className="mt-2 mb-4 leading-relaxed">{c.prompt}</p>
          <Choices options={c.options} value={answers[i]} onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} />
        </Card>
      ))}
      {error && <p className="text-sm text-bad">{error}</p>}
      <Button onClick={submit} loading={busy} disabled={answers.some((a) => a === null)}>Check my answers</Button>
    </div>
  );
}

export default function LessonPage() {
  const { id } = useParams();
  useActiveTime("mind", `lesson:${id}`);
  const { data: lesson, error, loading, reload } = useApi(`/api/mind/lessons/${id}`);

  if (loading) return <PageLoader label="Loading lesson" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/mind?tab=calm" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> Mindset lessons
      </Link>
      <p className="text-xs font-semibold tracking-widest text-brand uppercase">Mindset · {lesson.minutes} min</p>
      <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
        {lesson.title} {lesson.passed && <Badge tone="ok"><CircleCheck className="size-3" /> Passed</Badge>}
      </h1>
      <p className="mt-2 text-muted">{lesson.summary}</p>
      <Card className="mt-6 p-6 sm:p-8"><Markdown>{lesson.body}</Markdown></Card>
      <h2 className="mt-10 mb-4 text-lg font-semibold">Check yourself</h2>
      <Checks key={lesson.id} lesson={lesson} onDone={() => {}} />
    </div>
  );
}
