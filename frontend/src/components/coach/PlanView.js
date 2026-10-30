"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays, Check, ChevronDown, Coffee, Flag, Lightbulb, LoaderCircle, RefreshCw, Target, TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Card, Progress, cx, scoreColor } from "@/components/ui";
import { AREA_LABEL, LANGUAGES, dayLabel, minutesLabel, taskMeta } from "./meta";

function TaskRow({ task, busy, onToggle }) {
  const { icon: Icon, label, color } = taskMeta(task.type);
  return (
    <li className="flex items-center gap-3 py-3">
      <button type="button" onClick={() => onToggle(task)} disabled={busy}
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
        className={cx("flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition",
          task.done ? "border-ok bg-ok text-white" : "border-line hover:border-brand")}>
        {busy ? <LoaderCircle className="size-3.5 animate-spin text-muted" /> : task.done && <Check className="size-3.5" />}
      </button>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1f`, color }}>
        <Icon className="size-4" />
      </span>
      <Link href={task.href} className="group min-w-0 flex-1">
        <span className={cx("block truncate text-sm font-medium group-hover:text-brand", task.done && "text-muted line-through")}>
          {task.title}
        </span>
        <span className="text-xs text-faint">
          {label} · {minutesLabel(task.minutes)}{task.auto && task.done ? " · completed automatically" : ""}
        </span>
      </Link>
    </li>
  );
}

function TodayCard({ plan, busyId, onToggle }) {
  const day = plan.today;
  const tasks = day?.tasks || [];
  const done = tasks.filter((t) => t.done).length;
  const minutes = tasks.reduce((n, t) => n + (t.minutes || 0), 0);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="size-4 text-brand" /> Today</h2>
        {tasks.length > 0 && <span className="text-xs text-muted">{done}/{tasks.length} done · {minutesLabel(minutes)}</span>}
      </div>
      {day?.rest && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Coffee className="size-3.5" /> Light review day: keep it short and rest.</p>
      )}
      {tasks.length > 0 && <Progress value={(100 * done) / tasks.length} className="mt-3 h-1.5" color="var(--color-ok)" />}
      {plan.finished ? (
        <p className="py-8 text-center text-sm text-muted">This plan has ended. Change target or start a new plan to keep going.</p>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nothing scheduled for today.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {tasks.map((t) => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={onToggle} />)}
        </ul>
      )}
    </Card>
  );
}

function CoachNote({ note }) {
  if (!note) return null;
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-xs font-semibold tracking-widest text-brand uppercase">Coach note · week {note.week}</p>
      <h2 className="mt-2 text-lg leading-snug font-semibold">{note.headline}</h2>
      {note.summary && <p className="mt-2 text-sm text-muted">{note.summary}</p>}
      {note.priorities?.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text"><Flag className="size-3.5 text-brand-2" /> This week&apos;s priorities</p>
          <ol className="space-y-2">
            {note.priorities.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] text-muted">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {note.risk && (
        <div className="mt-4 flex gap-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span><span className="font-medium text-warn">Biggest risk: </span>{note.risk}</span>
        </div>
      )}
    </Card>
  );
}

function WeakSpots({ analysis }) {
  if (!analysis?.areas) return null;
  const areas = Object.entries(analysis.areas).sort((a, b) => a[1] - b[1]);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-4 text-warn" /> Weak spots</h2>
      <p className="mt-1 text-xs text-muted">Scored from your real activity. Areas with no data count as weak until you practise them.</p>
      <div className="mt-4 space-y-3">
        {areas.map(([key, value]) => (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted">{AREA_LABEL[key] || key}</span>
              <span className="font-medium tabular-nums">{value ? `${value}/100` : <span className="text-faint">No data yet</span>}</span>
            </div>
            <Progress value={value} className="h-1.5" color={value ? scoreColor(value) : undefined} />
          </div>
        ))}
      </div>
      {(analysis.weak_patterns?.length > 0 || analysis.weak_topics?.length > 0) && (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          {analysis.weak_patterns?.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-faint uppercase">DSA patterns to drill</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.weak_patterns.map((p) => <span key={p} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{p}</span>)}
              </div>
            </div>
          )}
          {analysis.weak_topics?.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-faint uppercase">Question topics to revisit</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.weak_topics.map((t) => (
                  <Link key={t} href={`/questions?topic=${encodeURIComponent(t)}`}
                    className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-brand">{t}</Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function TaskChip({ task }) {
  const { icon: Icon, color } = taskMeta(task.type);
  return (
    <Link href={task.href} title={`${task.title} (${minutesLabel(task.minutes)})`}
      className={cx("flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] leading-tight transition hover:border-faint",
        task.done ? "border-transparent bg-surface-3/60 text-faint line-through" : "border-line bg-surface")}>
      {task.done ? <Check className="size-3 shrink-0 text-ok" /> : <Icon className="size-3 shrink-0" style={{ color }} />}
      <span className="truncate">{task.title}</span>
    </Link>
  );
}

function WeekCalendar({ plan }) {
  const [open, setOpen] = useState(() => new Set([plan.current_week]));
  const todayIso = plan.today?.date;
  const toggle = (w) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(w)) n.delete(w);
    else n.add(w);
    return n;
  });

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="size-4 text-brand-2" /> Week by week</h2>
      <div className="mt-4 space-y-2">
        {(plan.plan?.weeks || []).map((w) => {
          const tasks = w.days.flatMap((d) => d.tasks);
          const done = tasks.filter((t) => t.done).length;
          const isOpen = open.has(w.week);
          const current = w.week === plan.current_week;
          return (
            <div key={w.week} className={cx("rounded-xl border", current ? "border-brand/40" : "border-line")}>
              <button type="button" onClick={() => toggle(w.week)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  current ? "bg-brand text-white" : "bg-surface-3 text-muted")}>{w.week}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    Week {w.week} {current && <Badge tone="brand">Current</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted">{w.focus}</span>
                </span>
                <span className="hidden text-xs text-faint tabular-nums sm:block">{done}/{tasks.length}</span>
                <ChevronDown className={cx("size-4 text-faint transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-7">
                  {w.days.map((d) => {
                    const isToday = d.date === todayIso;
                    return (
                      <div key={d.date} className={cx("min-w-0 rounded-lg p-2",
                        isToday ? "bg-brand/10 ring-1 ring-brand/40" : "bg-surface-2")}>
                        <p className="mb-1.5 flex items-center justify-between text-[11px] font-medium">
                          <span className={isToday ? "text-brand" : "text-muted"}>{isToday ? "Today" : dayLabel(d.date, { weekday: "short" })}</span>
                          <span className="text-faint">{dayLabel(d.date, { day: "numeric", month: "short" })}</span>
                        </p>
                        {d.rest && <p className="mb-1 flex items-center gap-1 text-[10px] text-faint"><Coffee className="size-3" /> Review day</p>}
                        <div className="flex flex-col gap-1">
                          {d.tasks.map((t) => <TaskChip key={t.id} task={t} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function PlanView({ plan, onPlan, onReset }) {
  const [busyId, setBusyId] = useState(null);
  const [replanning, setReplanning] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const stats = plan.stats;
  const notes = plan.coach?.notes || [];
  const note = notes[notes.length - 1];
  const language = LANGUAGES.find((l) => l.id === plan.language)?.label || plan.language;

  async function toggle(task) {
    setBusyId(task.id);
    setError("");
    try {
      const res = await api("/api/coach/plan/tasks", { body: { task_id: task.id, done: !task.done } });
      onPlan(res.plan);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function replan() {
    setReplanning(true);
    setError("");
    try {
      const res = await api("/api/coach/plan/replan", { method: "POST" });
      onPlan(res.plan);
    } catch (err) {
      setError(err.message);
    } finally {
      setReplanning(false);
    }
  }

  async function reset() {
    setResetting(true);
    setError("");
    try {
      await api("/api/coach/plan", { method: "DELETE" });
      onReset();
    } catch (err) {
      setError(err.message);
      setResetting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <Card className="mb-5 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-brand uppercase">Career Coach</p>
            <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold tracking-tight sm:text-3xl">
              <Target className="size-6 text-brand" /> {plan.target_label}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{plan.finished ? `Finished · ${plan.weeks} weeks` : `Week ${plan.current_week} of ${plan.weeks}`}</span>
              <span className="text-faint">·</span>
              <span>{plan.hours_per_week} h/week</span>
              {plan.experience_label && <><span className="text-faint">·</span><span>{plan.experience_label}</span></>}
              <span className="text-faint">·</span>
              <span>{language}</span>
              {plan.finished ? (
                <Badge tone="brand">Plan complete</Badge>
              ) : stats.on_track ? (
                <Badge tone="ok">On track</Badge>
              ) : (
                <Badge tone="warn">Behind schedule</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={replan} loading={replanning}>
              {!replanning && <RefreshCw className="size-3.5" />}
              {replanning ? "Re-planning" : "Re-plan from my latest progress"}
            </Button>
            {confirmReset ? (
              <span className="flex items-center gap-2">
                <Button variant="danger" size="sm" onClick={reset} loading={resetting}>End this plan</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)} disabled={resetting}>Cancel</Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>Change target</Button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted">Plan progress</span>
              <span className="font-medium tabular-nums">{stats.done}/{stats.total} tasks</span>
            </div>
            <Progress value={stats.total ? (100 * stats.done) / stats.total : 0} />
            <p className="mt-1.5 text-xs text-faint">
              {stats.done_so_far}/{stats.due_so_far} tasks due so far are done
              {stats.due_so_far ? ` (${Math.round((100 * stats.done_so_far) / stats.due_so_far)}%). 70% keeps you on track.` : "."}
            </p>
          </div>
          {plan.pipeline?.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted">{plan.target_label} pipeline</p>
              <ol className="flex flex-wrap items-center gap-1.5">
                {plan.pipeline.map((p, i) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <span className="rounded-md bg-surface-2 px-2 py-1 text-xs">{i + 1}. {p}</span>
                    {i < plan.pipeline.length - 1 && <span className="h-px w-3 bg-line" />}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        {confirmReset && (
          <p className="mt-4 text-xs text-warn">Ending this plan keeps your progress and lets you pick a new target. The schedule itself is discarded.</p>
        )}
        {replanning && <p className="mt-4 text-xs text-faint">Re-analysing your results and rebuilding the rest of the plan…</p>}
        {error && <p className="mt-4 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <TodayCard plan={plan} busyId={busyId} onToggle={toggle} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <CoachNote note={note} />
          <WeakSpots analysis={plan.coach?.analysis} />
        </div>
      </div>

      <div className="mt-5">
        <WeekCalendar key={plan.id} plan={plan} />
      </div>
    </div>
  );
}
