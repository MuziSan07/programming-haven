"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpenCheck, CircleCheck, Flame, Zap } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useActiveTime } from "@/lib/useActiveTime";
import { Badge, Card, ErrorState, PageHeader, PageLoader, Progress, cx } from "@/components/ui";
import { CATEGORY, DrillCard, formatMinutes } from "@/components/mind/shared";
import { Breathing, CheckIn, FocusTimer, Habits } from "@/components/mind/tools";

const TABS = [
  { id: "train", label: "Train" },
  { id: "calm", label: "Calm & mindset" },
  { id: "habits", label: "Habits & focus" },
  { id: "progress", label: "Progress" },
];

function TodayStrip({ data }) {
  const { today, xp_cap: cap, streak, totals } = data;
  const items = [
    { label: "Mind XP today", value: `${today.xp} / ${cap}`, extra: <Progress value={(today.xp / cap) * 100} className="mt-2 h-1.5" /> },
    { label: "Mind streak", value: `${streak} day${streak === 1 ? "" : "s"}`, icon: Flame },
    { label: "Focus today", value: formatMinutes(today.focus_minutes) },
    { label: "Drills finished", value: totals.drills },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <p className="text-[11px] text-muted">{it.label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums">
            {it.icon && <it.icon className={cx("size-4", streak ? "text-warn" : "text-faint")} />}{it.value}
          </p>
          {it.extra}
        </Card>
      ))}
    </div>
  );
}

function TrainTab({ drills }) {
  const groups = Object.entries(CATEGORY).map(([id, c]) => ({ id, ...c, drills: drills.filter((d) => d.category === id) }));
  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-muted">
        Short, hard drills built around the skills screening rounds lean on. Every drill adapts: score 80 or more and the
        next run moves up a level, score under 40 and it eases off. All answers are checked on the server.
      </p>
      {groups.map((g) => (
        <section key={g.id}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: g.color }}>
            <g.icon className="size-4" /> {g.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {g.drills.map((d) => <DrillCard key={d.id} drill={d} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function CalmTab({ data, reload }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Breathing patterns={data.breathing} onLogged={reload} />
        <CheckIn key={data.today.date} today={data.today} onSaved={reload} />
      </div>
      <section>
        <h2 className="mb-1 font-semibold">Mindset lessons</h2>
        <p className="mb-4 text-sm text-muted">
          Five-minute lessons on what goes wrong in interviews when the skill is there but the head isn&apos;t. Each ends
          with three scenario questions; get all three right to pass.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.lessons.map((l, i) => (
            <Link key={l.id} href={`/mind/lessons/${l.id}`} className="group card flex flex-col p-5 transition hover:border-brand/40">
              <div className="flex items-center justify-between text-[11px] text-faint">
                <span>Lesson {i + 1} · {l.minutes} min</span>
                {l.passed ? <CircleCheck className="size-4 text-ok" /> : l.best !== null && <span>{l.best}%</span>}
              </div>
              <h3 className="mt-3 font-semibold group-hover:text-brand">{l.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{l.summary}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HabitsTab({ data, reload, setData }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <div>
        <h2 className="mb-1 font-semibold">Daily habits</h2>
        <p className="mb-4 text-sm text-muted">Tick a habit when it&apos;s done. Each tick is worth 2 XP and keeps the habit&apos;s own streak going.</p>
        <Habits habits={data.habits} suggestions={data.habit_suggestions}
          onChange={(res) => { setData({ ...data, habits: res.habits, ...(res.today ? { today: res.today } : {}) }); }} />
      </div>
      <FocusTimer today={data.today} onLogged={reload} />
    </div>
  );
}

function Bars({ rows, value, color, format }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="flex h-32 items-end gap-1.5">
      {rows.map((r) => {
        const v = value(r);
        return (
          <div key={r.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${r.date}: ${format(v)}`}>
            <div className="rounded-t-md transition-all" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 0, background: color }} />
            <span className="mt-1 text-center text-[9px] text-faint">{new Date(`${r.date}T00:00:00`).getDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProgressTab({ data }) {
  const played = data.drills.filter((d) => d.runs);
  const moods = data.trend.filter((r) => r.mood);
  const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "-");
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Zap className="size-4 text-brand" /> Mind XP, last 14 days</h3>
          <Bars rows={data.trend} value={(r) => r.xp} color="var(--color-brand)" format={(v) => `${v} XP`} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Focus minutes, last 14 days</h3>
          <Bars rows={data.trend} value={(r) => r.focus_minutes} color="var(--color-ok)" format={formatMinutes} />
        </Card>
      </div>
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Check-in averages, last 14 days</h3>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Mood", avg(moods.map((r) => r.mood))], ["Nerves", avg(data.trend.filter((r) => r.nerves).map((r) => r.nerves))],
            ["Sleep (hours)", avg(data.trend.filter((r) => r.sleep_hours !== null).map((r) => r.sleep_hours))],
            ["Days checked in", moods.length]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 px-3 py-2.5">
              <dt className="text-[11px] text-muted">{k}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4"><h3 className="text-sm font-semibold">Drill records</h3></div>
        {played.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Finish a drill to see your records here.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-muted">
              <tr><th className="px-5 py-2 font-medium">Drill</th><th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Best</th><th className="px-3 py-2 font-medium">Last</th>
                <th className="px-5 py-2 text-right font-medium">Runs</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {played.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-2.5"><Link href={`/mind/drills/${d.id}`} className="font-medium hover:text-brand">{d.title}</Link></td>
                  <td className="px-3 py-2.5 tabular-nums">{d.level}</td>
                  <td className="px-3 py-2.5 tabular-nums">{d.best}</td>
                  <td className="px-3 py-2.5 tabular-nums">{d.last}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{d.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="flex items-center gap-2 text-xs text-faint">
        <BookOpenCheck className="size-3.5" /> {data.lessons.filter((l) => l.passed).length} of {data.lessons.length} mindset lessons passed ·{" "}
        {data.totals.breathing_sessions} breathing sessions · {formatMinutes(data.totals.focus_minutes)} focus time in total
      </p>
    </div>
  );
}

export default function MindPage() {
  useActiveTime("mind", "hub");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "train";
  const { data, error, loading, reload, setData } = useApi("/api/mind");

  if (loading) return <PageLoader label="Loading Mind Training" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader eyebrow="Mind Training" title="Train the mind behind the code"
        description="Memory, focus and reasoning drills, calm tools for interview nerves, and the habits that keep you consistent. Counts toward XP, streaks, badges and your coach plan."
        actions={data.today.checked_in ? <Badge tone="ok">Checked in today</Badge> : null} />
      <TodayStrip data={data} />
      <div className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => router.replace(`${pathname}?tab=${t.id}`, { scroll: false })}
            className={cx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition",
              tab === t.id ? "border-brand text-text" : "border-transparent text-muted hover:text-text")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "train" && <TrainTab drills={data.drills} />}
      {tab === "calm" && <CalmTab data={data} reload={reload} />}
      {tab === "habits" && <HabitsTab data={data} reload={reload} setData={setData} />}
      {tab === "progress" && <ProgressTab data={data} />}
    </div>
  );
}
