"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

// Stable per-member colour so the same person looks the same in the leaderboard, tasks and chat
const COLORS = ["#7c5cff", "#22d3ee", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#3b82f6", "#14b8a6"];

export function memberColor(id) {
  return COLORS[Math.abs(Number(id) || 0) % COLORS.length];
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function MemberInitial({ user, size = "md", className, title }) {
  const sizes = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm" };
  return (
    <span title={title ?? user?.name}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-surface",
        sizes[size], className)}
      style={{ background: memberColor(user?.id) }}>
      {initials(user?.name)}
    </span>
  );
}

/** Current time, refreshed in an interval callback (never read during render). */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function endsIn(iso, now) {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (ms === 0) return "ended";
  if (d) return `${d}d ${h}h`;
  return `${h}h ${m % 60}m`;
}
