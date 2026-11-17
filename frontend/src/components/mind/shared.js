"use client";

import Link from "next/link";
import { Award, Brain, CircleCheck, CircleX, Gauge, Sparkles, Zap } from "lucide-react";
import { Badge, Button, Card, Ring, cx, scoreColor } from "@/components/ui";

export const CATEGORY = {
  memory: { label: "Memory", color: "#a78bfa", icon: Brain },
  focus: { label: "Focus", color: "#22d3ee", icon: Gauge },
  logic: { label: "Logic", color: "#f59e0b", icon: Sparkles },
  speed: { label: "Speed", color: "#22c55e", icon: Zap },
};

export const LEVEL_NAMES = ["", "Warm-up", "Steady", "Sharp", "Hard", "Brutal"];

export function LevelDots({ level, max = 5, className }) {
  return (
    <span className={cx("inline-flex items-center gap-1", className)} title={`Level ${level}: ${LEVEL_NAMES[level]}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cx("size-1.5 rounded-full", i < level ? "bg-brand" : "bg-surface-3")} />
      ))}
    </span>
  );
}

export function formatMinutes(min) {
  if (!min) return "0 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** XP, personal best and badges earned by an action. */
export function Rewards({ xp, personalBest, badges = [], capped }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={xp ? "brand" : "neutral"}><Zap className="size-3" /> +{xp} XP</Badge>
      {personalBest && <Badge tone="ok">New personal best</Badge>}
      {capped && <Badge>Daily mind XP cap reached</Badge>}
      {badges.map((b) => <Badge key={b.id} tone="warn"><Award className="size-3" /> {b.title}</Badge>)}
    </div>
  );
}

function show(v) {
  if (v === null || v === undefined || v === "") return "No answer";
  return String(v);
}

/** Per-item review after a drill or lesson. */
export function Review({ items }) {
  if (!items?.length) return null;
  return (
    <ol className="space-y-3">
      {items.map((r, i) => (
        <li key={i} className={cx("rounded-xl border p-4", r.correct ? "border-ok/25 bg-ok/[0.04]" : "border-bad/25 bg-bad/[0.04]")}>
          <div className="flex items-start gap-3">
            {r.correct ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-bad" />}
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              {r.prompt && (r.prompt.includes("\n")
                ? <pre className="overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[12.5px] leading-5">{r.prompt}</pre>
                : <p className="font-medium">{r.prompt}</p>)}
              <div className="grid gap-1 sm:grid-cols-2">
                <p><span className="text-muted">Your answer: </span><span className="font-mono">{show(r.given)}</span></p>
                <p><span className="text-muted">Correct: </span><span className="font-mono">{show(r.expected)}</span>
                  {typeof r.points === "number" && <span className="ml-2 text-xs text-muted">({r.points}/100)</span>}</p>
              </div>
              {r.why && <p className="text-[13px] leading-relaxed text-muted">{r.why}</p>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DrillResult({ result, drill, onAgain }) {
  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:p-8">
        <Ring value={result.score} label={result.score} sublabel="score" color={scoreColor(result.score)} />
        <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
          <p className="text-xs font-semibold tracking-widest text-brand uppercase">{drill.title}</p>
          <h2 className="text-2xl font-bold tracking-tight">{result.headline}</h2>
          <p className="text-sm text-muted">
            Played at level {result.level} ({LEVEL_NAMES[result.level]}).{" "}
            {result.next_level > result.level && `Next run moves up to level ${result.next_level}.`}
            {result.next_level < result.level && `Next run eases down to level ${result.next_level}.`}
            {result.next_level === result.level && "Score 80 or more to move up a level."}
            {result.previous_best !== null && result.previous_best !== undefined && !result.personal_best &&
              ` Your best is ${result.previous_best}.`}
          </p>
          <Rewards xp={result.xp} personalBest={result.personal_best} badges={result.new_badges} capped={result.xp_capped} />
          <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
            <Button onClick={onAgain}>Play again</Button>
            <Button variant="secondary" href="/mind">Back to Mind Training</Button>
          </div>
        </div>
      </Card>
      {result.review?.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold">Review</h3>
          <Review items={result.review} />
        </div>
      )}
    </div>
  );
}

export function DrillCard({ drill }) {
  const cat = CATEGORY[drill.category];
  const Icon = cat.icon;
  return (
    <Link href={`/mind/drills/${drill.id}`} className="group card flex flex-col p-5 transition hover:border-brand/40">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl" style={{ background: `${cat.color}1f`, color: cat.color }}>
          <Icon className="size-5" />
        </span>
        <span className="text-[11px] text-faint">{drill.minutes} min</span>
      </div>
      <h3 className="mt-4 font-semibold group-hover:text-brand">{drill.title}</h3>
      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{drill.summary}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs">
        <span className="flex items-center gap-2 text-muted"><LevelDots level={drill.level} /> L{drill.level}</span>
        <span className="text-muted">{drill.runs ? <>Best <span className="font-semibold text-text">{drill.best}</span></> : "Not played"}</span>
      </div>
    </Link>
  );
}
