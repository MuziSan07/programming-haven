"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Bot, Crown, KeyRound, Medal, Swords, Trophy, UserPlus, Users, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, DIFFICULTY_TONE, ErrorState, PageHeader, PageLoader, cx } from "@/components/ui";
import { CopyPill, DIFFICULTIES, OutcomeChip, PlayerAvatar, RatingDelta } from "@/components/duels/shared";

const DIFF_TEXT = { Easy: "text-ok", Medium: "text-warn", Hard: "text-bad" };
const DIFFICULTY_NOTE ={ Easy: "Warm-up, ~5 min", Medium: "Interview level", Hard: "For the brave" };

function RatingCard({ stats }) {
  const winRate = stats.games ? Math.round((stats.wins / stats.games) * 100) : null;
  return (
    <Card className="p-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
        <Medal className="size-3.5" /> Duel rating
      </p>
      <div className="mt-2 flex items-end gap-3">
        <span className="font-mono text-4xl font-bold tabular-nums">{stats.rating}</span>
        {stats.rank && <span className="mb-1.5 text-sm text-muted">Rank <span className="font-semibold text-text">#{stats.rank}</span></span>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["Wins", stats.wins, "text-ok"], ["Losses", stats.losses, "text-bad"], ["Draws", stats.draws, "text-muted"]].map(([label, v, tone]) => (
          <div key={label} className="rounded-xl border border-line bg-surface-2 py-2">
            <p className={cx("font-mono text-lg font-semibold tabular-nums", tone)}>{v}</p>
            <p className="text-[11px] tracking-wider text-faint uppercase">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {winRate === null ? "Play your first duel to get ranked." : `${winRate}% win rate over ${stats.games} ${stats.games === 1 ? "duel" : "duels"}.`}
      </p>
    </Card>
  );
}

function QuickMatch({ onPick, busy, error }) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Swords className="size-4 text-brand" /> Quick match</h2>
      <p className="mt-1 text-sm text-muted">
        Race a random opponent on the same problem. First Accepted wins, 30 minutes on the clock.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {DIFFICULTIES.map((d) => (
          <button key={d} onClick={() => onPick(d)} disabled={Boolean(busy)}
            className="group flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-3 text-left transition hover:border-brand/50 disabled:opacity-50">
            <span>
              <Badge tone={DIFFICULTY_TONE[d]}>{d}</Badge>
              <span className="mt-1.5 block text-xs text-muted">{DIFFICULTY_NOTE[d]}</span>
            </span>
            <ArrowRight className={cx("size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-text",
              busy === `quick-${d}` && "animate-pulse text-brand")} />
          </button>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
        <Bot className="size-3.5" /> No one around? After 20 seconds you can race a clearly labelled practice bot.
      </p>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </Card>
  );
}

function InviteCard() {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState("Medium");
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      setInvite(await api("/api/duels", { body: { difficulty, private: true } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold"><UserPlus className="size-4 text-brand-2" /> Invite a friend</h2>
      {invite ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted">Share the code or link. The duel starts as soon as they join.</p>
          <CopyPill label="Code" display={invite.code} className="w-full" />
          <CopyPill label="Link" mono={false} display={`/duels/${invite.id}?code=${invite.code}`} className="w-full"
            getText={() => `${window.location.origin}/duels/${invite.id}?code=${invite.code}`} />
          <Button className="mt-1 w-full" onClick={() => router.push(`/duels/${invite.id}`)}>
            Go to the duel room <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">A private duel only someone with the code can join.</p>
          <div className="mt-4 flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
            {DIFFICULTIES.map((d) => (
              <button key={d} onClick={() => setDifficulty(d)}
                className={cx("flex-1 rounded-lg py-1.5 text-xs font-medium transition",
                  difficulty === d ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
                {d}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="mt-3 w-full" onClick={create} loading={busy}>Create invite</Button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </Card>
  );
}

function JoinCard() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/api/duels/join", { body: { code: code.trim() } });
      router.push(`/duels/${d.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-warn" /> Join with code</h2>
      <form onSubmit={join} className="mt-3 flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. K7QX2M" maxLength={16}
          aria-label="Invite code"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 font-mono text-sm tracking-widest uppercase outline-none focus:border-brand" />
        <Button type="submit" loading={busy} disabled={code.trim().length < 4}>Join</Button>
      </form>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </Card>
  );
}

function ActiveBanner({ active }) {
  const waiting = active.status === "waiting";
  return (
    <Link href={`/duels/${active.id}`}
      className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-5 py-4 transition hover:border-brand/70">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{waiting ? "You are still in the queue" : "You have a duel in progress"}</span>
        <span className="text-muted">
          {" "}· {active.difficulty}
          {active.opponent && <> vs {active.opponent.name}{active.opponent.is_bot && " (bot)"}</>}
        </span>
      </span>
      <span className="flex items-center gap-1 text-sm font-medium text-brand">{waiting ? "Open" : "Resume"} <ArrowRight className="size-4" /></span>
    </Link>
  );
}

function RecentDuels({ recent }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">Recent duels</h2>
      </div>
      {recent.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-faint">Your duel history will show up here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-5 py-3">
              <OutcomeChip outcome={d.outcome} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {d.problem ? (
                    <Link href={`/dsa/${d.problem.slug}`} className="hover:text-brand">{d.problem.title}</Link>
                  ) : "Duel"}
                </p>
                <p className="flex items-center gap-1.5 truncate text-xs text-faint">
                  vs {d.opponent?.name || "Unknown"}
                  {d.opponent?.is_bot && <Bot className="size-3" />}
                  <span>·</span>
                  <span className={DIFF_TEXT[d.difficulty]}>{d.difficulty}</span>
                </p>
              </div>
              <RatingDelta value={d.rating_change} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Leaderboard({ rows }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold"><Trophy className="size-4 text-warn" /> Ratings leaderboard</h2>
        <span className="flex items-center gap-1 text-xs text-muted"><Users className="size-3.5" />Top 50</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-faint">No ranked duels yet. Be the first on the board.</p>
      ) : (
        <ol className="max-h-[480px] divide-y divide-line overflow-y-auto">
          {rows.map((r) => (
            <li key={r.user.id} className={cx("flex items-center gap-3 px-5 py-2.5", r.me && "bg-brand/10")}>
              <span className="w-6 text-center font-mono text-xs text-faint">
                {r.rank === 1 ? <Crown className="mx-auto size-4 text-warn" /> : r.rank}
              </span>
              <PlayerAvatar player={{ name: r.user.name, me: r.me }} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {r.user.name}{r.me && <span className="text-faint"> (you)</span>}
              </span>
              <span className="hidden font-mono text-xs text-faint sm:inline">{r.wins}-{r.losses}-{r.draws}</span>
              <span className="w-12 text-right font-mono text-sm font-semibold tabular-nums">{r.rating}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default function DuelsPage() {
  const router = useRouter();
  const me = useApi("/api/duels/me");
  const board = useApi("/api/duels/leaderboard");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  if (me.loading || board.loading) return <PageLoader />;
  if (me.error) return <ErrorState error={me.error} onRetry={me.reload} />;
  if (board.error) return <ErrorState error={board.error} onRetry={board.reload} />;

  async function quick(difficulty) {
    setBusy(`quick-${difficulty}`);
    setError("");
    try {
      const d = await api("/api/duels/quick", { body: { difficulty } });
      router.push(`/duels/${d.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  const { stats, active, recent } = me.data;
  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <PageHeader eyebrow="Duels" title="1v1 coding duels"
        description="Same problem, same clock, one winner. Duels train the speed and composure live coding rounds demand." />

      {active && <ActiveBanner active={active} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <QuickMatch onPick={quick} busy={busy} error={error} />
          <div className="grid gap-5 sm:grid-cols-2">
            <InviteCard />
            <JoinCard />
          </div>
          <RecentDuels recent={recent} />
        </div>
        <div className="space-y-5">
          <RatingCard stats={stats} />
          <Card className="p-5 text-sm text-muted">
            <p className="flex items-center gap-2 font-semibold text-text"><Zap className="size-4 text-brand" /> Scoring</p>
            <ul className="mt-2 space-y-1.5">
              <li>Win <span className="text-text">+40 XP</span>, draw <span className="text-text">+15</span>, loss <span className="text-text">+10</span>.</li>
              <li>Elo rating, K=32. Practice bot duels count at K=16.</li>
              <li>Your opponent sees your test count, never your code.</li>
            </ul>
          </Card>
          <Leaderboard rows={board.data.leaderboard} />
        </div>
      </div>
    </div>
  );
}
