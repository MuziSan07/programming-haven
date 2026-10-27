"use client";

import { useEffect, useState } from "react";
import { Circle, CircleCheck, CircleDot, Clock } from "lucide-react";
import { cx } from "@/components/ui";

export const LANGUAGE_LABEL = { python: "Python", javascript: "JavaScript" };

export const STATUS = {
  passed: { label: "Passed", icon: CircleCheck, className: "text-ok" },
  attempted: { label: "Attempted", icon: CircleDot, className: "text-warn" },
  todo: { label: "Not started", icon: Circle, className: "text-faint" },
};

export const SEVERITY_TONE = { critical: "bad", high: "warn", medium: "cyan", low: "neutral" };
export const SEVERITIES = ["low", "medium", "high", "critical"];

export function StatusLabel({ status, className }) {
  const s = STATUS[status] || STATUS.todo;
  const Icon = s.icon;
  return (
    <span className={cx("flex items-center gap-1 text-xs", s.className, className)}>
      <Icon className="size-3.5" /> {s.label}
    </span>
  );
}

/** Start time of the round (ISO) plus seconds elapsed, ticking every second. */
export function useRoundClock() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return { startedAt: new Date(startedAt).toISOString(), elapsed: Math.max(0, Math.floor((now - startedAt) / 1000)) };
}

function mmss(total) {
  const s = Math.abs(total);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Countdown chip. Informational only: it turns red once the suggested time is used up. */
export function RoundTimer({ minutes, elapsed }) {
  const left = minutes * 60 - elapsed;
  const over = left < 0;
  return (
    <span title={`Suggested time: ${minutes} minutes. Going over does not end the round.`}
      className={cx("flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-xs tabular-nums",
        over ? "bg-bad/15 text-bad" : left < 120 ? "bg-warn/15 text-warn" : "bg-surface-2 text-text")}>
      <Clock className="size-3.5" />
      {over ? `+${mmss(left)} over` : mmss(left)}
    </span>
  );
}

/** Line diff (LCS) between two texts: [{type: "same" | "del" | "add", text, a, b}]. */
export function lineDiff(before, after) {
  const a = (before || "").split("\n");
  const b = (after || "").split("\n");
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i], a: i + 1 });
      i++;
    } else {
      out.push({ type: "add", text: b[j], b: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i], a: ++i });
  while (j < m) out.push({ type: "add", text: b[j], b: ++j });
  return out;
}

const DIFF_ROW = {
  same: "text-muted",
  del: "bg-bad/10 text-bad",
  add: "bg-ok/10 text-ok",
};

/** Unified, GitHub-style diff of one file. */
export function DiffView({ before, after }) {
  const rows = lineDiff(before, after);
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-bg font-mono text-[12.5px] leading-6">
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={DIFF_ROW[r.type]}>
              <td className="w-10 border-r border-line px-2 text-right text-faint select-none">{r.a ?? ""}</td>
              <td className="w-10 border-r border-line px-2 text-right text-faint select-none">{r.b ?? ""}</td>
              <td className="w-5 pl-2 select-none">{r.type === "del" ? "-" : r.type === "add" ? "+" : ""}</td>
              <td className="pr-4 whitespace-pre">{r.text || " "}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
