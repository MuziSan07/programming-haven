"use client";

import { Fragment } from "react";
import { ArrowDown, ArrowUp, Clock, Info, Lock, Minus, Shield, TrendingUp, Zap } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Badge, Card, ErrorState, PageHeader, PageLoader, cx } from "@/components/ui";
import { CountdownBlocks, countdown, useNow } from "@/components/compete/time";

const OUTCOME = {
  promoted: { label: "Promoted", tone: "ok", icon: ArrowUp },
  demoted: { label: "Demoted", tone: "bad", icon: ArrowDown },
  stayed: { label: "Stayed", tone: "neutral", icon: Minus },
};

function TierLadder({ tiers, current }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-max gap-2">
        {tiers.map((t, i) => {
          const isCurrent = i === current;
          const locked = i > current;
          return (
            <li key={t.name}
              className={cx("flex w-24 flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition",
                isCurrent ? "bg-surface-2" : "border-line bg-surface", locked && "opacity-40")}
              style={isCurrent ? { borderColor: t.color, boxShadow: `0 0 0 1px ${t.color}` } : undefined}>
              <span className="relative flex size-10 items-center justify-center rounded-xl"
                style={{ background: `${t.color}22`, color: t.color }}>
                <Shield className="size-5" fill={isCurrent ? t.color : "none"} fillOpacity={0.25} />
                {locked && <Lock className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-surface p-0.5 text-faint" />}
              </span>
              <span className={cx("text-xs font-semibold", isCurrent ? "text-text" : "text-muted")}>{t.name}</span>
              {isCurrent && <span className="text-[10px] font-medium tracking-wider uppercase" style={{ color: t.color }}>You</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ZoneDivider({ label, tone }) {
  return (
    <div className={cx("flex items-center gap-2 px-4 py-1.5 text-[11px] font-semibold tracking-wider uppercase",
      tone === "ok" ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>
      {tone === "ok" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />} {label}
    </div>
  );
}

function Standings({ rows, color }) {
  const firstDemote = rows.findIndex((r) => r.zone === "demote");
  const lastPromote = rows.findLastIndex((r) => r.zone === "promote");
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[3rem_1fr_4rem_5rem] items-center gap-2 border-b border-line px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
        <span>Rank</span><span>Name</span><span className="text-right">Level</span><span className="text-right">Week XP</span>
      </div>
      <div>
        {rows.map((r, i) => (
          <Fragment key={r.user.id}>
            {i === 0 && r.zone === "promote" && <ZoneDivider label="Promotion zone" tone="ok" />}
            {i === lastPromote + 1 && lastPromote >= 0 && r.zone === "safe" && (
              <div className="px-4 py-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">Safe zone</div>
            )}
            {i === firstDemote && <ZoneDivider label="Demotion zone" tone="bad" />}
            <div className={cx("grid grid-cols-[3rem_1fr_4rem_5rem] items-center gap-2 border-t border-line/60 px-4 py-2.5 text-sm",
              r.zone === "promote" && "bg-ok/5", r.zone === "demote" && "bg-bad/5",
              r.me && "relative font-semibold")}
              style={r.me ? { boxShadow: `inset 3px 0 0 ${color}`, background: `${color}14` } : undefined}>
              <span className={cx("font-mono tabular-nums", r.zone === "promote" ? "text-ok" : r.zone === "demote" ? "text-bad" : "text-muted")}>
                #{r.rank}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold">
                  {r.user.name?.[0]?.toUpperCase() || "?"}
                </span>
                <span className="truncate">{r.user.name}</span>
                {r.me && <Badge tone="brand">You</Badge>}
              </span>
              <span className="text-right text-xs text-muted">Lv {r.user.level}</span>
              <span className="text-right font-mono tabular-nums">{r.xp.toLocaleString()}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </Card>
  );
}

export default function LeaguesPage() {
  const { data, error, loading, reload } = useApi("/api/leagues/current");
  const now = useNow();
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const c = countdown(data.ends_at, now);
  const me = data.standings.find((r) => r.me);
  const last = data.last_week;
  const lastOutcome = last?.outcome ? OUTCOME[last.outcome] : null;

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <PageHeader eyebrow="Weekly league" title={`${data.tier_name} League`}
        description="Compete with up to 30 developers at your tier. Every XP you earn this week counts." />

      <TierLadder tiers={data.tiers} current={data.tier} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="order-2 lg:order-1">
          <Standings rows={data.standings} color={data.tier_color} />
        </div>

        <aside className="order-1 space-y-4 lg:order-2">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
              <Clock className="size-3.5" /> Week ends in
            </p>
            <div className="mt-3">
              {c.done ? <p className="text-sm text-muted">Finalising results. Refresh in a moment.</p> : <CountdownBlocks c={c} />}
            </div>
            {me && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                <div>
                  <p className="text-xs text-faint">Your rank</p>
                  <p className="text-lg font-bold">#{me.rank}<span className="text-sm font-normal text-faint"> / {data.standings.length}</span></p>
                </div>
                <div>
                  <p className="text-xs text-faint">Week XP</p>
                  <p className="flex items-center gap-1 text-lg font-bold"><Zap className="size-4 text-brand" />{me.xp}</p>
                </div>
              </div>
            )}
            {me && me.zone === "promote" && me.xp < data.min_xp_to_promote && (
              <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
                You are in the promotion zone, but you need {data.min_xp_to_promote - me.xp} more XP to qualify.
              </p>
            )}
          </Card>

          {last && (
            <Card className="p-5">
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">Last week</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{last.tier_name} League</p>
                  {last.rank && <p className="text-xs text-muted">Finished #{last.rank}</p>}
                </div>
                {lastOutcome && (
                  <Badge tone={lastOutcome.tone}><lastOutcome.icon className="size-3" /> {lastOutcome.label}</Badge>
                )}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
              <Info className="size-3.5" /> How leagues work
            </p>
            <ul className="mt-3 space-y-2.5 text-sm text-muted">
              <li className="flex gap-2">
                <ArrowUp className="mt-0.5 size-4 shrink-0 text-ok" />
                <span>{data.promote_count
                  ? `Top ${data.promote_count} move up a tier, with at least ${data.min_xp_to_promote} XP this week.`
                  : "This is the top tier. Hold your place by staying out of the demotion zone."}</span>
              </li>
              <li className="flex gap-2">
                <ArrowDown className="mt-0.5 size-4 shrink-0 text-bad" />
                <span>{data.demote_count ? `Bottom ${data.demote_count} drop a tier.` : "Nobody is demoted from this group."}</span>
              </li>
              <li className="flex gap-2">
                <TrendingUp className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>XP from any activity counts: lessons, DSA, interviews, tests, contests and rounds. Weeks reset Monday 00:00 UTC.</span>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
