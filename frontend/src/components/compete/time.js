"use client";

import { useEffect, useState } from "react";

/** Current time in ms, refreshed every `intervalMs` from an interval callback. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function countdown(targetIso, now) {
  const ms = Math.max(0, new Date(targetIso).getTime() - now);
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60, done: ms === 0, ms,
  };
}

export const PHASE = {
  live: { label: "Live", tone: "ok" },
  upcoming: { label: "Upcoming", tone: "cyan" },
  ended: { label: "Ended", tone: "neutral" },
};

const pad = (n) => String(n).padStart(2, "0");

export function formatCountdown(c) {
  if (c.days) return `${c.days}d ${c.hours}h ${pad(c.minutes)}m`;
  return `${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
}

export function formatDate(iso, withTime = false) {
  return new Date(iso).toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

/** Big segmented countdown (days / hours / minutes / seconds). */
export function CountdownBlocks({ c }) {
  const parts = [
    ["Days", c.days], ["Hours", c.hours], ["Min", c.minutes], ["Sec", c.seconds],
  ];
  return (
    <div className="flex gap-2">
      {parts.map(([label, v]) => (
        <div key={label} className="min-w-14 rounded-xl border border-line bg-surface-2 px-2.5 py-2 text-center">
          <p className="font-mono text-xl font-bold tabular-nums">{pad(v)}</p>
          <p className="text-[10px] tracking-wider text-faint uppercase">{label}</p>
        </div>
      ))}
    </div>
  );
}
