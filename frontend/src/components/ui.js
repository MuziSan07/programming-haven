"use client";

import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const BUTTON_VARIANTS = {
  primary:
    "bg-brand text-white hover:bg-brand/90 shadow-[0_8px_30px_-10px] shadow-brand/60 disabled:shadow-none",
  secondary: "bg-surface-2 text-text border border-line hover:bg-surface-3",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  success: "bg-ok text-white hover:bg-ok/90",
  danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
};

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function Button({ variant = "primary", size = "md", href, loading, className, children, ...props }) {
  const classes = cx(
    "inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition active:scale-[0.98]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} disabled={loading || props.disabled} {...props}>
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cx("card", className)} {...props}>
      {children}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-surface-3 text-muted",
  brand: "bg-brand/15 text-[#b4a3ff]",
  cyan: "bg-brand-2/15 text-brand-2",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

export function Badge({ tone = "neutral", className, children }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
      BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export const DIFFICULTY_TONE = { Easy: "ok", Medium: "warn", Hard: "bad", Expert: "brand" };
export const LEVEL_TONE = { Basic: "ok", Intermediate: "cyan", Advanced: "warn", Expert: "bad" };

export function Progress({ value, className, color }) {
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color || "linear-gradient(90deg, var(--color-brand), var(--color-brand-2))",
        }}
      />
    </div>
  );
}

export function scoreColor(score) {
  if (score >= 75) return "var(--color-ok)";
  if (score >= 50) return "var(--color-warn)";
  return "var(--color-bad)";
}

/** Circular score gauge. */
export function Ring({ value, size = 140, stroke = 12, label, sublabel, color }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c5cff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color || "url(#ring-grad)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums" style={{ fontSize: size / 4.5 }}>
          {label ?? Math.round(v)}
        </span>
        {sublabel && <span className="text-xs text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

export function Spinner({ className }) {
  return <LoaderCircle className={cx("size-5 animate-spin text-brand", className)} />;
}

export function PageLoader({ label = "Loading" }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
      <Spinner className="size-7" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <p className="max-w-md text-sm text-bad">{error?.message || String(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-widest text-brand uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Markdown({ children, className }) {
  return (
    <div className={cx("prose-haven", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ""}</ReactMarkdown>
    </div>
  );
}

/** Inline `code` in plain content strings from the backend. */
export function RichText({ text, className }) {
  const parts = (text || "").split(/(`[^`]+`)/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-2">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export function CodeBlock({ code, className }) {
  return (
    <pre className={cx("overflow-x-auto rounded-xl border border-line bg-bg p-4 font-mono text-[13px] leading-6",
      className)}>
      <code>{code}</code>
    </pre>
  );
}
