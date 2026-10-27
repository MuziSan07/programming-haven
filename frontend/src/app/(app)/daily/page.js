"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, CircleCheck, Circle, Clock, Target, Zap } from "lucide-react";
import { useApi } from "@/lib/useApi";
import Countdown from "@/components/daily/Countdown";
import Leaderboard from "@/components/daily/Leaderboard";
import StreakCalendar from "@/components/daily/StreakCalendar";
import { Badge, Button, Card, DIFFICULTY_TONE, ErrorState, PageHeader, PageLoader, cx } from "@/components/ui";

function formatDate(iso, opts = { weekday: "long", month: "long", day: "numeric" }) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function Hero({ data, onReset }) {
  const { problem, status } = data;
  return (
    <Card className="relative overflow-hidden p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-muted">
            <CalendarDays className="size-3.5" /> {formatDate(data.date)}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">{problem.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={DIFFICULTY_TONE[problem.difficulty]}>{problem.difficulty}</Badge>
            {problem.pattern && <Badge>{problem.pattern}</Badge>}
            {status.solved && <Badge tone="ok"><CircleCheck className="size-3" /> Solved</Badge>}
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end lg:flex-col lg:items-end">
          <div className="lg:text-right">
            <p className="flex items-center gap-1.5 text-xs text-muted lg:justify-end"><Clock className="size-3.5" /> Resets in</p>
            <Countdown to={data.resets_at} onElapsed={onReset} className="mt-1 block font-mono text-3xl font-semibold tabular-nums" />
          </div>
          <Button size="lg" href={`/dsa/${problem.slug}`} variant={status.solved ? "secondary" : "primary"} className="sm:ml-auto lg:ml-0">
            {status.solved ? "Open again" : "Solve now"} <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatusCard({ data }) {
  const { status, streak, bonus_rule: rule } = data;
  const items = status.solved
    ? [
      ["Solved at", formatTime(status.solved_at)],
      ["Attempts", status.attempts],
      ["Your rank", status.rank ? `#${status.rank}` : "-"],
    ]
    : [
      ["Attempts today", status.attempts],
      ["Solvers so far", data.solvers],
      ["Streak if solved", `${streak + 1} day${streak + 1 === 1 ? "" : "s"}`],
    ];
  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><Target className="size-4 text-brand" /> Your status</h2>
        <Badge tone={status.solved ? "ok" : "neutral"}>{status.solved ? "Complete" : "Open"}</Badge>
      </div>
      <div className={cx("mt-5 flex items-center gap-4 rounded-xl border p-4",
        status.solved ? "border-ok/30 bg-ok/[0.06]" : "border-brand/30 bg-brand/[0.06]")}>
        <Zap className={cx("size-6 shrink-0", status.solved ? "text-ok" : "text-brand")} />
        <div>
          <p className="text-2xl font-bold tabular-nums">+{status.bonus_xp} XP</p>
          <p className="text-xs text-muted">{status.solved ? "Daily bonus earned" : "Daily bonus waiting for you"}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-[11px] text-muted">{k}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        Bonus is {rule.base} XP plus {rule.per_day} XP per streak day, capped at {rule.cap} XP, on top of the normal problem XP.
      </p>
    </Card>
  );
}

function PreviousDays() {
  const { data, error, loading } = useApi("/api/daily/history?days=14");
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">Previous days</h2>
      </div>
      {loading && <p className="px-5 py-6 text-sm text-muted">Loading…</p>}
      {error && <p className="px-5 py-6 text-sm text-bad">{error.message}</p>}
      {data && (
        <ul className="divide-y divide-line">
          {data.days.map((d) => (
            <li key={d.date}>
              <Link href={`/dsa/${d.problem.slug}`} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
                {d.solved ? <CircleCheck className="size-4 shrink-0 text-ok" /> : <Circle className="size-4 shrink-0 text-faint" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-brand">{d.problem.title}</p>
                  <p className="text-[11px] text-faint">
                    {formatDate(d.date, { weekday: "short", month: "short", day: "numeric" })} · {d.solvers} solved
                  </p>
                </div>
                <Badge tone={DIFFICULTY_TONE[d.problem.difficulty]}>{d.problem.difficulty}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DailyPage() {
  const { data, error, loading, reload } = useApi("/api/daily");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Daily challenge" title="One problem. Everyone. Today."
        description="A new problem every day at 00:00 UTC: easy early in the week, a hard one on Saturday. Solve it to keep your streak and climb the global board." />

      <Hero data={data} onReset={reload} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <StatusCard data={data} />
        <StreakCalendar streak={data.streak} calendar={data.calendar} today={data.date} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Leaderboard rows={data.leaderboard} myRow={data.my_row} solvers={data.solvers} />
        <PreviousDays />
      </div>
    </div>
  );
}
