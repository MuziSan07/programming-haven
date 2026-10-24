"use client";

import { useEffect, useState } from "react";

/** Current time, refreshed every `intervalMs` (updates happen in the interval callback). */
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
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60, done: ms === 0 };
}

export function shortCountdown(c) {
  if (c.days) return `${c.days}d ${c.hours}h ${c.minutes}m`;
  return `${String(c.hours).padStart(2, "0")}:${String(c.minutes).padStart(2, "0")}:${String(c.seconds).padStart(2, "0")}`;
}

export function localDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
