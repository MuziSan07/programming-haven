"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, Check, Flame, Pause, Play, Plus, Square, Timer, Wind } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Card, Progress, cx } from "@/components/ui";
import { Rewards, formatMinutes } from "./shared";

const field = "rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none transition focus:border-brand";

function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- breathing

export function Breathing({ patterns, onLogged }) {
  const [patternId, setPatternId] = useState(patterns[0].id);
  const [minutes, setMinutes] = useState(2);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [reward, setReward] = useState(null);
  const [error, setError] = useState(null);
  const pattern = patterns.find((p) => p.id === patternId);
  const cycle = pattern.steps.reduce((s, [, n]) => s + n, 0);
  const total = minutes * 60;

  const log = async (seconds) => {
    if (seconds < 60) return;
    try {
      const res = await api("/api/mind/breathing", { body: { pattern: patternId, seconds: Math.round(seconds) } });
      setReward({ xp: res.xp, badges: res.new_badges });
      onLogged?.(res);
    } catch (e) {
      setError(e.message);
    }
  };
  const logRef = useRef(log);
  useEffect(() => { logRef.current = log; });

  useEffect(() => {
    if (!running) return undefined;
    const t0 = performance.now();
    const id = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      if (s >= total) {
        setElapsed(total);
        setRunning(false);
        logRef.current(total);
      } else {
        setElapsed(s);
      }
    }, 100);
    return () => clearInterval(id);
  }, [running, total]);

  const start = () => { setReward(null); setError(null); setElapsed(0); setRunning(true); };
  const stop = () => { setRunning(false); log(elapsed); };

  // Where are we inside the current breath?
  let t = elapsed % cycle;
  let step = 0;
  while (step < pattern.steps.length && t >= pattern.steps[step][1]) {
    t -= pattern.steps[step][1];
    step += 1;
  }
  step = Math.min(step, pattern.steps.length - 1);
  const [label, length] = pattern.steps[step];
  const frac = Math.min(1, t / length);
  const kind = label.toLowerCase();
  const hasTopUp = pattern.steps.some(([l]) => l.toLowerCase().includes("top"));
  const prevKind = (pattern.steps[step - 1]?.[0] || pattern.steps.at(-1)[0]).toLowerCase();
  let scale;
  if (kind.includes("top")) scale = 0.9 + 0.1 * frac;
  else if (kind.includes("inhale")) scale = 0.55 + (hasTopUp ? 0.35 : 0.45) * frac;
  else if (kind.includes("exhale")) scale = 1 - 0.45 * frac;
  else scale = prevKind.includes("inhale") ? 1 : 0.55; // a hold keeps the size it reached

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-4">
          <h3 className="flex items-center gap-2 font-semibold"><Wind className="size-4 text-brand-2" /> Guided breathing</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {patterns.map((p) => (
              <button key={p.id} type="button" disabled={running} onClick={() => setPatternId(p.id)}
                className={cx("rounded-xl border p-3 text-left transition disabled:opacity-60",
                  p.id === patternId ? "border-brand bg-brand/10" : "border-line bg-surface-2 hover:border-brand/40")}>
                <p className="text-sm font-medium">{p.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{p.use}</p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 5].map((m) => (
              <button key={m} type="button" disabled={running} onClick={() => setMinutes(m)}
                className={cx("h-8 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-60",
                  m === minutes ? "border-brand bg-brand/10 text-text" : "border-line text-muted hover:text-text")}>
                {m} min
              </button>
            ))}
            <span className="ml-auto">
              {running
                ? <Button variant="secondary" onClick={stop}><Square className="size-4" /> Stop</Button>
                : <Button onClick={start}><Play className="size-4" /> Start</Button>}
            </span>
          </div>
          {reward && <Rewards xp={reward.xp} badges={reward.badges} />}
          {error && <p className="text-sm text-bad">{error}</p>}
          <p className="text-[11px] leading-relaxed text-faint">
            Sessions of a minute or more are logged. If you feel dizzy, stop and breathe normally. This is a focus
            exercise, not medical advice.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 lg:w-72">
          <div className="relative flex size-56 items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-line" />
            <div className="rounded-full bg-gradient-to-br from-brand/50 to-brand-2/40"
              style={{ width: "100%", height: "100%", transform: `scale(${running ? scale : 0.55})`, transition: "transform 120ms linear" }} />
            <div className="absolute text-center">
              <p className="text-lg font-semibold">{running ? label : "Ready"}</p>
              {running && <p className="font-mono text-sm text-muted tabular-nums">{Math.ceil(length - t)}</p>}
            </div>
          </div>
          <p className="font-mono text-sm text-muted tabular-nums">{mmss(elapsed)} / {mmss(total)}</p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- focus timer

export function FocusTimer({ today, onLogged }) {
  const [minutes, setMinutes] = useState(25);
  const [label, setLabel] = useState("");
  const [state, setState] = useState("idle"); // idle | running | paused
  const [left, setLeft] = useState(25 * 60);
  const [reward, setReward] = useState(null);
  const [error, setError] = useState(null);
  const endAt = useRef(0);

  const log = async (mins) => {
    if (mins < 5) return;
    try {
      const res = await api("/api/mind/focus", { body: { minutes: Math.min(180, mins), label } });
      setReward({ xp: res.xp, badges: res.new_badges });
      onLogged?.(res);
    } catch (e) {
      setError(e.message);
    }
  };
  const logRef = useRef(log);
  useEffect(() => { logRef.current = log; });

  useEffect(() => {
    if (state !== "running") return undefined;
    const id = setInterval(() => {
      const s = Math.max(0, (endAt.current - performance.now()) / 1000);
      setLeft(s);
      if (s <= 0) {
        setState("idle");
        logRef.current(minutes);
      }
    }, 250);
    return () => clearInterval(id);
  }, [state, minutes]);

  const pick = (m) => { setMinutes(m); setLeft(m * 60); };
  const start = () => {
    setReward(null);
    setError(null);
    endAt.current = performance.now() + (state === "paused" ? left : minutes * 60) * 1000;
    setState("running");
  };
  const pause = () => setState("paused");
  const stop = () => {
    const done = Math.floor((minutes * 60 - left) / 60);
    setState("idle");
    setLeft(minutes * 60);
    log(done);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Timer className="size-4 text-ok" /> Deep work timer</h3>
        <Badge>{formatMinutes(today.focus_minutes)} today</Badge>
      </div>
      <p className="mt-6 text-center font-mono text-6xl font-bold tabular-nums">{mmss(left)}</p>
      <Progress value={100 - (left / (minutes * 60)) * 100} className="mt-4 h-1.5" color="var(--color-ok)" />
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {[25, 50, 90].map((m) => (
          <button key={m} type="button" disabled={state !== "idle"} onClick={() => pick(m)}
            className={cx("h-8 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-60",
              m === minutes ? "border-ok bg-ok/10 text-text" : "border-line text-muted hover:text-text")}>
            {m} min
          </button>
        ))}
      </div>
      <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={state !== "idle"} maxLength={80}
        placeholder="What will you work on? (optional)" className={cx(field, "mt-4 h-10 w-full")} />
      <div className="mt-4 flex justify-center gap-2">
        {state === "running" && <Button variant="secondary" onClick={pause}><Pause className="size-4" /> Pause</Button>}
        {state !== "running" && <Button onClick={start}><Play className="size-4" /> {state === "paused" ? "Resume" : "Start"}</Button>}
        {state !== "idle" && <Button variant="ghost" onClick={stop}><Square className="size-4" /> End and log</Button>}
      </div>
      {reward && <div className="mt-4 flex justify-center"><Rewards xp={reward.xp} badges={reward.badges} /></div>}
      {error && <p className="mt-3 text-center text-sm text-bad">{error}</p>}
      <p className="mt-4 text-center text-[11px] text-faint">Phone face down, one task, no tabs you don&apos;t need. Sessions of 5 minutes or more are logged.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- daily check-in

const SCALES = [
  { key: "mood", label: "Mood", low: "Low", high: "Great" },
  { key: "energy", label: "Energy", low: "Drained", high: "Charged" },
  { key: "nerves", label: "Interview nerves", low: "Calm", high: "Very nervous" },
];

export function CheckIn({ today, onSaved }) {
  const [form, setForm] = useState(() => ({
    mood: today.mood, energy: today.energy, nerves: today.nerves,
    sleep_hours: today.sleep_hours ?? "", note: today.note || "",
  }));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, sleep_hours: form.sleep_hours === "" ? null : Number(form.sleep_hours) };
      const res = await api("/api/mind/today", { method: "PUT", body });
      setSaved(res);
      onSaved?.(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Daily check-in</h3>
        {today.checked_in && <Badge tone="ok"><Check className="size-3" /> Done today</Badge>}
      </div>
      <div className="mt-5 space-y-4">
        {SCALES.map((s) => (
          <div key={s.key}>
            <p className="mb-2 text-sm text-muted">{s.label}</p>
            <div className="flex items-center gap-2">
              <span className="w-20 text-right text-[11px] text-faint">{s.low}</span>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} type="button" onClick={() => setForm({ ...form, [s.key]: v })}
                  className={cx("size-9 rounded-lg border text-sm font-medium transition",
                    form[s.key] === v ? "border-brand bg-brand text-white" : "border-line bg-surface-2 text-muted hover:border-brand/40")}>
                  {v}
                </button>
              ))}
              <span className="text-[11px] text-faint">{s.high}</span>
            </div>
          </div>
        ))}
        <label className="flex items-center gap-3 text-sm text-muted">
          Sleep last night
          <input type="number" min={0} max={16} step={0.5} value={form.sleep_hours}
            onChange={(e) => setForm({ ...form, sleep_hours: e.target.value })} className={cx(field, "h-9 w-24")} />
          hours
        </label>
        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={2000} rows={3}
          placeholder="One line: what's on your mind, what went well, what you'll do differently."
          className={cx(field, "w-full py-2")} />
        <div className="flex items-center gap-3">
          <Button onClick={save} loading={busy} disabled={!form.mood}>Save check-in</Button>
          {saved && <Rewards xp={saved.xp} />}
          {error && <span className="text-sm text-bad">{error}</span>}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- habits

export function Habits({ habits, suggestions, onChange }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const call = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      onChange(await fn());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const add = (t) => call("add", async () => {
    const res = await api("/api/mind/habits", { body: { title: t } });
    setTitle("");
    return res;
  });
  const unused = suggestions.filter((s) => !habits.some((h) => h.title === s));

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-line">
        {habits.length === 0 && (
          <p className="p-6 text-sm text-muted">No habits yet. Pick one below or write your own. Start with one or two you can keep every day.</p>
        )}
        {habits.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center gap-4 p-4">
            <button type="button" onClick={() => call(h.id, () => api(`/api/mind/habits/${h.id}/toggle`, { method: "POST" }))}
              disabled={busy === h.id} aria-label={h.done_today ? "Mark not done" : "Mark done"}
              className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg border transition",
                h.done_today ? "border-ok bg-ok text-white" : "border-line bg-surface-2 hover:border-ok/60")}>
              {h.done_today && <Check className="size-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{h.title}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <Flame className={cx("size-3", h.streak ? "text-warn" : "text-faint")} /> {h.streak} day streak · {h.total} day{h.total === 1 ? "" : "s"} total
              </p>
            </div>
            <div className="flex gap-1" aria-label="Last 7 days">
              {h.week.map((d) => (
                <span key={d.date} title={d.date} className={cx("size-3 rounded-sm", d.done ? "bg-ok" : "bg-surface-3")} />
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => call(`a${h.id}`, () => api(`/api/mind/habits/${h.id}`, { method: "DELETE" }))}
              aria-label="Archive habit"><Archive className="size-3.5" /></Button>
          </div>
        ))}
      </Card>
      <Card className="p-5">
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) add(title.trim()); }} className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="New habit, e.g. Solve one problem before breakfast"
            className={cx(field, "h-10 flex-1")} />
          <Button type="submit" loading={busy === "add"} disabled={!title.trim()}><Plus className="size-4" /> Add</Button>
        </form>
        {unused.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {unused.map((s) => (
              <button key={s} type="button" onClick={() => add(s)}
                className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-brand/40 hover:text-text">
                + {s}
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </Card>
    </div>
  );
}
