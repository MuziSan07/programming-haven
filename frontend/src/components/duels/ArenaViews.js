"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight, Bot, ChevronLeft, CircleCheck, Clock, ExternalLink, Flag, Handshake, Lock, Repeat, Swords, Timer, Trophy,
  X, Zap,
} from "lucide-react";
import { Badge, Button, Card, DIFFICULTY_TONE, Progress, cx } from "@/components/ui";
import { BotTag, CopyPill, PlayerAvatar, RatingDelta, clock, shortName } from "./shared";

export function LobbyLink({ className }) {
  return (
    <Link href="/duels" className={cx("flex items-center gap-1 text-sm text-muted hover:text-text", className)}>
      <ChevronLeft className="size-4" /> Duels
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------------- waiting
export function WaitingRoom({ duel, waited, onBot, onCancel, busy, error }) {
  const botReady = waited >= 20;
  const invite = duel.is_private && duel.code;
  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      <LobbyLink />
      <Card className="mt-4 p-6 text-center sm:p-10">
        <div className="relative mx-auto flex size-28 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full border border-brand/30 [animation-duration:2.4s]" />
          <span className="absolute inset-3 rounded-full border border-line" />
          <span className="absolute inset-7 rounded-full border border-line" />
          <span className="relative flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Swords className="size-6" />
          </span>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Badge tone={DIFFICULTY_TONE[duel.difficulty]}>{duel.difficulty}</Badge>
          <Badge tone={invite ? "brand" : "neutral"}>{invite ? "Private invite" : "Quick match"}</Badge>
        </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          {invite ? "Waiting for your friend" : "Looking for an opponent"}
        </h1>
        <p className="mt-1 font-mono text-sm text-muted tabular-nums">{clock(waited)} elapsed</p>

        {invite && (
          <div className="mx-auto mt-6 max-w-sm space-y-2 text-left">
            <p className="text-xs text-muted">Send this code, or the link, to the person you want to race.</p>
            <CopyPill label="Code" display={duel.code} className="w-full" />
            <CopyPill label="Link" mono={false} display={`/duels/${duel.id}?code=${duel.code}`} className="w-full"
              getText={() => `${window.location.origin}/duels/${duel.id}?code=${duel.code}`} />
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          {botReady ? (
            <div className="w-full rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-sm text-muted">
                {invite ? "Your friend hasn't joined yet." : "No one is free at this level right now."} You can race a
                practice bot instead. It is clearly labelled as a bot and the result counts at half weight.
              </p>
              <Button className="mt-3" onClick={onBot} loading={busy === "bot"} disabled={Boolean(busy)}>
                <Bot className="size-4" /> Practice vs bot
              </Button>
            </div>
          ) : (
            <p className="text-xs text-faint">A practice bot becomes available after 20 seconds.</p>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel} loading={busy === "cancel"} disabled={Boolean(busy)}>
            <X className="size-3.5" /> Cancel
          </Button>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- countdown
export function CountdownOverlay({ duel, seconds }) {
  const n = Math.max(1, Math.ceil(seconds));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-sm">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-widest text-muted uppercase">Matched</p>
        <div className="mt-4 flex items-center justify-center gap-4 sm:gap-6">
          <Contender player={duel.me} />
          <span className="text-sm font-semibold text-faint">vs</span>
          <Contender player={duel.opponent} />
        </div>
        <p key={n} className="mt-8 animate-pop font-mono text-7xl font-bold tabular-nums">{n}</p>
        <p className="mt-2 text-sm text-muted">The problem appears when the countdown ends</p>
      </div>
    </div>
  );
}

function Contender({ player }) {
  if (!player) return null;
  return (
    <div className="flex w-32 flex-col items-center gap-2">
      <PlayerAvatar player={player} size="lg" />
      <p className="max-w-full truncate text-sm font-semibold">{shortName(player)}{player.me && <span className="text-faint"> (you)</span>}</p>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted">{player.rating}</span>
        {player.is_bot && <BotTag />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- active bar
function SideStatus({ player, align = "left" }) {
  if (!player) return <div className="flex-1" />;
  const p = player.progress || { passed: 0, total: 0, attempts: 0 };
  const solved = p.solved_at !== null && p.solved_at !== undefined;
  const pct = p.total ? (p.passed / p.total) * 100 : 0;
  const right = align === "right";
  return (
    <div className={cx("flex min-w-0 flex-1 items-center gap-2.5", right && "flex-row-reverse text-right")}>
      <PlayerAvatar player={player} size="sm" className="hidden sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <div className={cx("flex items-center gap-1.5", right && "flex-row-reverse")}>
          <span className="truncate text-sm font-semibold">{shortName(player)}</span>
          {player.is_bot && <BotTag className="shrink-0" />}
          <span className="hidden font-mono text-[11px] text-faint sm:inline">{player.rating}</span>
        </div>
        <Progress value={pct} className="mt-1.5 h-1.5"
          color={solved ? "var(--color-ok)" : player.me ? "var(--color-brand)" : "var(--color-brand-2)"} />
        <p className="mt-1 font-mono text-[11px] text-muted tabular-nums">
          {solved ? <span className="text-ok">Accepted</span> : `${p.passed}/${p.total} tests`}
          <span className="text-faint"> · {p.attempts} {p.attempts === 1 ? "attempt" : "attempts"}</span>
        </p>
      </div>
    </div>
  );
}

export function ArenaBar({ duel, remaining, onForfeit, forfeiting }) {
  const [confirming, setConfirming] = useState(false);
  const low = remaining < 5 * 60;
  return (
    <div className="border-b border-line px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LobbyLink />
        <span className="truncate text-sm font-semibold">{duel.problem?.title}</span>
        <Badge tone={DIFFICULTY_TONE[duel.difficulty]}>{duel.difficulty}</Badge>
        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span className="hidden text-xs text-muted sm:inline">Forfeit counts as a loss.</span>
              <Button size="sm" variant="danger" onClick={onForfeit} loading={forfeiting}>Confirm forfeit</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep going</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}><Flag className="size-3.5" /> Forfeit</Button>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-3 sm:gap-6">
        <SideStatus player={duel.me} />
        <span title="Time remaining"
          className={cx("flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums",
            remaining <= 0 ? "bg-bad/15 text-bad" : low ? "bg-warn/15 text-warn" : "bg-surface-2 text-text")}>
          {remaining <= 0 ? <Lock className="size-3.5" /> : <Clock className="size-3.5" />}
          {clock(remaining)}
        </span>
        <SideStatus player={duel.opponent} align="right" />
      </div>
    </div>
  );
}

const TONE_DOT = { brand: "bg-brand", warn: "bg-warn", bad: "bg-bad", ok: "bg-ok" };

/** Latest opponent activity: a transient toast plus a compact feed line under the bar. */
export function OpponentFeed({ events, now }) {
  if (!events.length) return null;
  const latest = events[0];
  const fresh = now - latest.at < 4500;
  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-1.5 text-xs text-muted">
        {events.slice(0, 3).map((e, i) => (
          <span key={e.id} className={cx("flex shrink-0 items-center gap-1.5", i > 0 && "hidden text-faint md:flex")}>
            <span className={cx("size-1.5 rounded-full", TONE_DOT[e.tone])} />{e.text}
          </span>
        ))}
      </div>
      {fresh && (
        <div key={latest.id} role="status"
          className="fixed right-4 bottom-4 z-40 flex max-w-xs animate-fade-up items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm shadow-lg">
          <span className={cx("size-2 shrink-0 rounded-full", TONE_DOT[latest.tone])} />{latest.text}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------- result
const HEADLINE = {
  win: { title: "Victory", icon: Trophy, tone: "text-ok", ring: "bg-ok/15" },
  loss: { title: "Defeat", icon: Flag, tone: "text-bad", ring: "bg-bad/15" },
  draw: { title: "Draw", icon: Handshake, tone: "text-muted", ring: "bg-surface-3" },
};

function subtitle(duel) {
  const r = duel.result;
  const opp = shortName(duel.opponent);
  if (r.forfeit) return "You forfeited this duel.";
  if (r.opponent_forfeit) return `${opp} forfeited.`;
  if (r.outcome === "win") return `You got Accepted before ${opp}.`;
  if (r.outcome === "loss") return duel.opponent?.progress?.solved_at != null ? `${opp} got Accepted first.` : "Time ran out.";
  return "Time ran out before either of you got Accepted.";
}

function ResultRow({ player }) {
  if (!player) return null;
  const p = player.progress || {};
  const solved = p.solved_at !== null && p.solved_at !== undefined;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <PlayerAvatar player={player} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{shortName(player)}</span>
          {player.me && <span className="text-xs text-faint">(you)</span>}
          {player.is_bot && <BotTag />}
        </p>
        <p className="font-mono text-[11px] text-faint">{p.passed ?? 0}/{p.total ?? 0} tests</p>
      </div>
      <div className="text-right">
        <p className={cx("flex items-center justify-end gap-1 font-mono text-sm tabular-nums", solved ? "text-ok" : "text-faint")}>
          {solved ? <><CircleCheck className="size-3.5" />{clock(p.solved_at)}</> : "Not solved"}
        </p>
        <p className="text-[11px] text-faint">{p.attempts ?? 0} {p.attempts === 1 ? "attempt" : "attempts"}</p>
      </div>
    </div>
  );
}

export function ResultScreen({ duel, onRematch, rematching, error }) {
  const r = duel.result;
  const h = HEADLINE[r.outcome] || HEADLINE.draw;
  const Icon = h.icon;
  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      <LobbyLink />
      <Card className="mt-4 overflow-hidden">
        <div className="p-6 text-center sm:p-8">
          <span className={cx("mx-auto flex size-14 items-center justify-center rounded-2xl", h.ring)}>
            <Icon className={cx("size-7", h.tone)} />
          </span>
          <h1 className={cx("mt-4 text-3xl font-bold tracking-tight", h.tone)}>{h.title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle(duel)}</p>
          {duel.problem && (
            <p className="mt-3 text-sm">
              {duel.problem.title} <Badge tone={DIFFICULTY_TONE[duel.problem.difficulty]} className="ml-1">{duel.problem.difficulty}</Badge>
            </p>
          )}
          <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
              <p className="flex items-center justify-center gap-1.5 text-[11px] tracking-wider text-faint uppercase">
                <Timer className="size-3.5" /> Rating{r.practice && " (practice)"}
              </p>
              <p className="mt-1 flex items-center justify-center gap-2 font-mono text-base font-semibold tabular-nums">
                {duel.me.rating} <RatingDelta value={r.rating_change} />
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
              <p className="flex items-center justify-center gap-1.5 text-[11px] tracking-wider text-faint uppercase">
                <Zap className="size-3.5" /> XP
              </p>
              <p className="mt-1 font-mono text-base font-semibold text-brand tabular-nums">+{r.xp}</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-line border-t border-line">
          <ResultRow player={duel.me} />
          <ResultRow player={duel.opponent} />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line p-4">
          <Button onClick={onRematch} loading={rematching}><Repeat className="size-4" /> Rematch</Button>
          <Button variant="secondary" href="/duels">Back to lobby</Button>
          {duel.problem && (
            <Button variant="ghost" href={`/dsa/${duel.problem.slug}`}>View problem <ExternalLink className="size-3.5" /></Button>
          )}
        </div>
        {error && <p className="px-4 pb-4 text-center text-sm text-bad">{error}</p>}
      </Card>
    </div>
  );
}

export function CancelledView() {
  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      <LobbyLink />
      <Card className="mt-4 flex flex-col items-center gap-3 p-10 text-center">
        <X className="size-8 text-faint" />
        <p className="text-lg font-semibold">This duel was cancelled</p>
        <p className="text-sm text-muted">No one joined before the search ended. Nothing counted toward your rating.</p>
        <Button href="/duels" className="mt-2">Back to lobby <ArrowRight className="size-4" /></Button>
      </Card>
    </div>
  );
}
