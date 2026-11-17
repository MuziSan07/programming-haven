"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, Play } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useActiveTime } from "@/lib/useActiveTime";
import { Badge, Button, Card, ErrorState, PageLoader } from "@/components/ui";
import { CATEGORY, DrillResult, LEVEL_NAMES, LevelDots } from "@/components/mind/shared";
import { RUNNERS } from "@/components/mind/runners";

function History({ runs }) {
  if (!runs.length) return null;
  const recent = runs.slice(-20);
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold">Your last {recent.length} runs</h3>
      <div className="flex h-24 items-end gap-1">
        {recent.map((r) => (
          <div key={r.id} className="flex-1 rounded-t" title={`${r.date}: ${r.score} (level ${r.level})`}
            style={{ height: `${Math.max(4, r.score)}%`, background: r.score >= 80 ? "var(--color-ok)" : r.score >= 40 ? "var(--color-warn)" : "var(--color-bad)" }} />
        ))}
      </div>
    </Card>
  );
}

export default function DrillPage() {
  const { id } = useParams();
  useActiveTime("mind", id);
  const overview = useApi("/api/mind");
  const history = useApi(`/api/mind/drills/${id}/history`);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (overview.loading) return <PageLoader label="Loading drill" />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />;
  const drill = overview.data.drills.find((d) => d.id === id);
  if (!drill) return <ErrorState error={{ message: "That drill doesn't exist." }} />;
  const cat = CATEGORY[drill.category];
  const Runner = RUNNERS[id];

  const start = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setSession(await api(`/api/mind/drills/${id}/start`, { method: "POST" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (answer) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/api/mind/sessions/${session.id}/finish`, { body: { answer } });
      setResult(res);
      setSession(null);
      overview.reload();
      history.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/mind" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> Mind Training
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: cat.color }}>{cat.label}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{drill.title}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <LevelDots level={session?.level ?? drill.level} />
          Level {session?.level ?? drill.level}: {LEVEL_NAMES[session?.level ?? drill.level]}
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}

      {result && !session && <DrillResult result={result} drill={drill} onAgain={start} />}

      {session && Runner && <Runner key={session.id} data={session.data} onSubmit={submit} busy={busy} />}

      {!session && !result && (
        <div className="space-y-6">
          <Card className="p-6 sm:p-8">
            <p className="text-lg leading-relaxed">{drill.summary}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted"><span className="font-medium text-text">Why it matters: </span>{drill.skill}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge>About {drill.minutes} min</Badge>
              {drill.runs > 0 && <Badge>Best {drill.best}</Badge>}
              {drill.runs > 0 && <Badge>{drill.runs} run{drill.runs === 1 ? "" : "s"}</Badge>}
            </div>
            <Button size="lg" className="mt-6" onClick={start} loading={busy}><Play className="size-4" /> Start level {drill.level}</Button>
          </Card>
          <History runs={history.data?.runs || []} />
        </div>
      )}
      {result && !session && <div className="mt-6"><History runs={history.data?.runs || []} /></div>}
    </div>
  );
}
