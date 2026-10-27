"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronLeft, Flame, Gauge, Hourglass, MessageCircle, Square, Timer, UsersRound, Volume2 } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useSpeaker } from "@/lib/useVoice";
import Avatar from "@/components/Avatar";
import { spokenText } from "@/components/interview/TranscriptMessage";
import {
  FillerChart, HighlightedAnswer, MetricChips, StatTile, TipCallout, seconds,
} from "@/components/interview/ReplayParts";
import { Badge, Button, Card, ErrorState, PageLoader, cx, scoreColor } from "@/components/ui";

export default function InterviewReplayPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/api/interviews/${id}/replay`);
  if (loading) return <PageLoader label="Loading your replay" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <Replay data={data} />;
}

function Replay({ data }) {
  const { session, turns, totals } = data;
  const lead = session.panel?.[0] || session.persona;
  const second = session.panel?.[1] || session.persona;
  const personas = Object.fromEntries([lead, second].filter(Boolean).map((p) => [p.id, p]));
  const leadVoice = useSpeaker({ voice: lead?.voice, gender: lead?.gender });
  const secondVoice = useSpeaker({ voice: second?.voice, gender: second?.gender });
  const [playing, setPlaying] = useState(null);
  const tokenRef = useRef(0);

  function personaFor(speakerId) {
    return personas[speakerId] || lead;
  }

  async function listen(i, turn) {
    const token = ++tokenRef.current;
    leadVoice.stop();
    secondVoice.stop();
    if (playing === i) {
      setPlaying(null);
      return;
    }
    setPlaying(i);
    for (const line of turn.lines?.length ? turn.lines : [{ speaker: turn.speaker, text: turn.question }]) {
      if (tokenRef.current !== token) return;
      const voice = session.panel && line.speaker === second?.id ? secondVoice : leadVoice;
      await voice.speak(spokenText(line.text));
    }
    setPlaying((p) => (p === i ? null : p));
  }

  function jump(i) {
    document.getElementById(`turn-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <Link href={`/interview/${session.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> Back to report
      </Link>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-widest text-brand uppercase">Interview replay</p>
          <h1 className="mt-1 text-3xl font-bold">{session.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {session.level} {session.role} · with {session.interviewer} · {new Date(session.created_at).toLocaleDateString()}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {session.stress && <Badge tone="bad"><Flame className="size-3" /> Stress mode</Badge>}
            {session.mode === "panel" && <Badge tone="cyan"><UsersRound className="size-3" /> Panel</Badge>}
            {session.ai === false && <Badge tone="warn">Tips estimated offline</Badge>}
          </div>
        </div>
        {session.overall_score != null && (
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums" style={{ color: scoreColor(session.overall_score) }}>
              {session.overall_score}<span className="text-base text-faint">/100</span>
            </p>
            <p className="text-sm text-muted">{session.verdict}</p>
          </div>
        )}
      </div>

      {turns.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No answers were recorded in this interview, so there is nothing to replay.</Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Gauge} label="Average pace" value={totals.avg_wpm != null ? `${totals.avg_wpm} wpm` : "–"}
              sub={totals.avg_wpm != null ? "130-160 wpm sounds confident" : "Measured on voice answers only"} />
            <StatTile icon={MessageCircle} label="Filler words" value={totals.total_fillers}
              sub={totals.top_fillers.length === 0 ? "None detected" : null}>
              {totals.top_fillers.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {totals.top_fillers.map((f) => (
                    <span key={f.word} className="rounded-md bg-warn/15 px-1.5 py-0.5 text-[11px] text-warn">
                      &ldquo;{f.word}&rdquo; ×{f.count}
                    </span>
                  ))}
                </div>
              )}
            </StatTile>
            <StatTile icon={Timer} label="Average think time" value={seconds(totals.avg_think_ms)} sub="Before your first word" />
            <StatTile icon={Hourglass} label="Longest pause" value={seconds(totals.longest_pause_ms)}
              sub={totals.longest_pause_ms > 8000 ? "Over 8 s reads as stuck" : "Within a natural range"} />
          </div>

          <Card className="mt-3 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Filler words per answer</h2>
              <span className="text-xs text-faint">{totals.answers} answers · {totals.total_words} words</span>
            </div>
            <div className="mt-2"><FillerChart turns={turns} onSelect={jump} /></div>
          </Card>

          <ol className="relative mt-8 space-y-8 before:absolute before:top-2 before:bottom-2 before:left-[19px] before:w-px before:bg-line">
            {turns.map((t, i) => {
              const asker = personaFor(t.speaker);
              return (
                <li key={t.index} id={`turn-${i}`} className="relative scroll-mt-24 pl-14">
                  <div className="absolute top-0 left-0"><Avatar persona={asker} size={40} /></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {(t.lines?.length > 1 ? [...new Set(t.lines.map((l) => personaFor(l.speaker)?.name))].join(" & ") : asker?.name) || session.interviewer}
                    </span>
                    <span className="text-xs text-faint">Question {i + 1}</span>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => listen(i, t)}
                      title={playing === i ? "Stop" : `Hear ${asker?.name || "the interviewer"} ask it`}>
                      {playing === i ? <Square className="size-3.5" fill="currentColor" /> : <Volume2 className="size-3.5" />}
                      {playing === i ? "Stop" : "Listen"}
                    </Button>
                  </div>
                  <div className="mt-1 space-y-1.5 text-sm leading-relaxed text-text/85">
                    {(t.lines?.length ? t.lines : [{ speaker: t.speaker, text: t.question }]).map((l, j) => (
                      <p key={j}>
                        {t.lines?.length > 1 && <span className="mr-1.5 text-xs font-semibold text-brand">{personaFor(l.speaker)?.name}</span>}
                        {spokenText(l.text)}
                      </p>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_300px]">
                    <div className={cx("rounded-2xl border border-line bg-surface p-4",
                      t.tips.some((x) => x.severity === "high") && "border-bad/30")}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">Your answer</span>
                        <MetricChips metrics={t.metrics} />
                      </div>
                      <HighlightedAnswer text={t.answer} spans={t.highlights} />
                    </div>
                    <div className="space-y-2">
                      {t.tips.map((tip, j) => <TipCallout key={j} tip={tip} />)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
