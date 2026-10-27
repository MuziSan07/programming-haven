"use client";

import { useEffect, useState } from "react";
import { Bot, Check, Copy, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, cx } from "@/components/ui";

export const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export const OUTCOME = {
  win: { label: "Win", tone: "ok" },
  loss: { label: "Loss", tone: "bad" },
  draw: { label: "Draw", tone: "neutral" },
};

const pad = (n) => String(n).padStart(2, "0");

/** 754.2 -> "12:34" */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Current time in ms, refreshed from an interval callback (never read during render). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function initials(name = "") {
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Bot names carry "(practice bot)"; show the short name next to an explicit Bot tag. */
export function shortName(player) {
  if (!player) return "";
  return player.is_bot ? player.name.replace(/\s*\(practice bot\)\s*/i, "") : player.name;
}

export function PlayerAvatar({ player, size = "md", className }) {
  const sizes = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-14 text-base" };
  if (player?.is_bot) {
    return (
      <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-3 text-muted",
        sizes[size], className)} title="Practice bot">
        <Bot className={size === "lg" ? "size-6" : "size-4"} />
      </span>
    );
  }
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
      player?.me ? "bg-brand" : "bg-brand-2/80", sizes[size], className)}>
      {initials(player?.name)}
    </span>
  );
}

export function BotTag({ className }) {
  return <Badge tone="neutral" className={cx("border border-line", className)}><Bot className="size-3" />Bot</Badge>;
}

export function RatingDelta({ value, className }) {
  if (value === undefined || value === null) return null;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className={cx("inline-flex items-center gap-1 font-mono text-xs tabular-nums",
      value > 0 ? "text-ok" : value < 0 ? "text-bad" : "text-muted", className)}>
      <Icon className="size-3.5" />{value > 0 ? `+${value}` : value}
    </span>
  );
}

export function OutcomeChip({ outcome }) {
  const o = OUTCOME[outcome];
  if (!o) return null;
  return <Badge tone={o.tone} className="w-12 justify-center">{o.label}</Badge>;
}

/** Copy-to-clipboard pill. `getText` runs in the click handler so it can read window.location. */
export function CopyPill({ label, display, getText, mono = true, className }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(getText ? getText() : display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked; the value is still visible to copy by hand
    }
  }
  return (
    <button type="button" onClick={copy} title={`Copy ${label.toLowerCase()}`}
      className={cx("flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-xs transition hover:border-faint",
        className)}>
      <span className="shrink-0 text-muted">{label}</span>
      <span className={cx("min-w-0 flex-1 truncate font-semibold", mono && "font-mono tracking-wider")}>{display}</span>
      {copied ? <Check className="size-3.5 shrink-0 text-ok" /> : <Copy className="size-3.5 shrink-0 text-muted" />}
    </button>
  );
}
