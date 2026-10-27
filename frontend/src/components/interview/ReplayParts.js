"use client";

import { useState } from "react";
import { CircleAlert, Info, Keyboard, Mic, TriangleAlert } from "lucide-react";
import { cx } from "@/components/ui";

export function seconds(ms) {
  if (ms == null) return "–";
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`;
}

export function StatTile({ icon: Icon, label, value, sub, children }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted"><Icon className="size-3.5" /> {label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
      {children}
    </div>
  );
}

/** Fillers per answer as thin bars; hover (or focus) shows the exact count, click jumps to the answer. */
export function FillerChart({ turns, onSelect }) {
  const [hover, setHover] = useState(null);
  const counts = turns.map((t) => t.metrics?.fillers?.total || 0);
  const max = Math.max(3, ...counts);
  const shown = hover ?? counts.indexOf(Math.max(...counts));
  return (
    <div>
      <p className="h-4 text-xs text-muted">
        {counts.length > 0 && (
          <>Answer {shown + 1}: <span className="font-semibold text-text tabular-nums">{counts[shown]}</span> filler{counts[shown] === 1 ? "" : "s"}{hover == null && counts[shown] > 0 ? " (most)" : ""}</>
        )}
      </p>
      <div className="mt-2 flex h-24 items-end gap-0.5 border-b border-line" role="list" aria-label="Filler words per answer">
        {counts.map((c, i) => (
          <button key={i} type="button" role="listitem" onClick={() => onSelect?.(i)}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            aria-label={`Answer ${i + 1}: ${c} filler words`}
            className="group flex h-full min-w-0 flex-1 items-end justify-center px-[1px]">
            <span className={cx("w-full max-w-7 rounded-t-[4px] transition",
              hover === i ? "bg-brand" : c >= 6 ? "bg-brand/80" : "bg-brand/50", c === 0 && "bg-line")}
              style={{ height: c === 0 ? 2 : `${Math.max(6, (c / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-faint">
        {counts.map((_, i) => <span key={i} className="flex-1 text-center tabular-nums">{i + 1}</span>)}
      </div>
    </div>
  );
}

/** Answer text with filler words highlighted. `spans` are [{start, end, word}] from the backend. */
export function HighlightedAnswer({ text, spans }) {
  const out = [];
  let at = 0;
  (spans || []).forEach((s, i) => {
    if (s.start > at) out.push(<span key={`t${i}`}>{text.slice(at, s.start)}</span>);
    out.push(
      <mark key={`f${i}`} title="Filler word" className="rounded bg-warn/20 px-0.5 text-warn">{text.slice(s.start, s.end)}</mark>,
    );
    at = s.end;
  });
  if (at < text.length) out.push(<span key="end">{text.slice(at)}</span>);
  return <p className="text-sm leading-relaxed whitespace-pre-wrap text-text/90">{out}</p>;
}

function Chip({ tone = "neutral", children, title }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums",
      tone === "warn" ? "bg-warn/15 text-warn" : tone === "ok" ? "bg-ok/15 text-ok" : "bg-surface-3 text-muted")}>
      {children}
    </span>
  );
}

export function MetricChips({ metrics: m }) {
  const fillers = m.fillers?.total || 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip title={m.input === "voice" ? "Answered by voice" : "Typed answer"}>
        {m.input === "voice" ? <Mic className="size-3" /> : <Keyboard className="size-3" />}
        {m.input === "voice" ? "Voice" : "Typed"}
      </Chip>
      {m.wpm != null && (
        <Chip tone={m.wpm < 110 || m.wpm > 170 ? "warn" : "ok"} title="Words per minute (130-160 is a comfortable pace)">{m.wpm} wpm</Chip>
      )}
      <Chip tone={m.words < 25 ? "warn" : "neutral"}>{m.words} words</Chip>
      {m.think_ms != null && (
        <Chip tone={m.long_pause ? "warn" : "neutral"} title="Time before your first word">{seconds(m.think_ms)} to start</Chip>
      )}
      <Chip tone={fillers >= 3 ? "warn" : "neutral"}>{fillers} filler{fillers === 1 ? "" : "s"}</Chip>
    </div>
  );
}

const SEVERITY = {
  high: { icon: CircleAlert, className: "border-bad/35 bg-bad/10", text: "text-bad", label: "High" },
  medium: { icon: TriangleAlert, className: "border-warn/35 bg-warn/10", text: "text-warn", label: "Medium" },
  low: { icon: Info, className: "border-brand-2/30 bg-brand-2/10", text: "text-brand-2", label: "Low" },
};

export function TipCallout({ tip }) {
  const s = SEVERITY[tip.severity] || SEVERITY.medium;
  const Icon = s.icon;
  return (
    <div className={cx("flex gap-2.5 rounded-xl border p-3", s.className)}>
      <Icon className={cx("mt-0.5 size-4 shrink-0", s.text)} />
      <div className="min-w-0">
        <p className={cx("text-[10px] font-semibold tracking-wide uppercase", s.text)}>{tip.type} · {s.label}</p>
        <p className="mt-0.5 text-sm leading-snug text-text/90">{tip.text}</p>
      </div>
    </div>
  );
}
