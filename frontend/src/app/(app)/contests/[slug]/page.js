"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ChevronLeft, CircleCheck, CircleX, Clock, Lock, Medal, Target, Timer, Trophy, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, DIFFICULTY_TONE, ErrorState, PageLoader, cx } from "@/components/ui";
import ContestLeaderboard from "@/components/compete/ContestLeaderboard";
import ContestSolver from "@/components/compete/ContestSolver";
import StartContestButton from "@/components/compete/StartContestButton";
import { CountdownBlocks, PHASE, countdown, formatCountdown, formatDate, useNow } from "@/components/compete/time";

export default function ContestPage() {
  const { slug } = useParams();
  const { user, setUser } = useAuth();
  const { data, error, loading, reload, setData } = useApi(`/api/contests/${slug}`);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const refresh = () => api(`/api/contests/${slug}`).then(setData, () => {});

  if (data.phase === "ended") return <FinalView contest={data} meId={user?.id} />;
  if (!data.entry) {
    return <PreStart contest={data} onStarted={(d) => { setData((prev) => ({ ...prev, ...d })); refresh(); }} />;
  }
  return <Arena contest={data} meId={user?.id} setData={setData} setUser={setUser} refresh={refresh} />;
}

function BackLink() {
  return (
    <Link href="/contests" className="flex items-center gap-1 text-sm text-muted hover:text-text">
      <ChevronLeft className="size-4" /> Contests
    </Link>
  );
}

function PreStart({ contest, onStarted }) {
  const now = useNow();
  const upcoming = contest.phase === "upcoming";
  const c = countdown(upcoming ? contest.starts_at : contest.ends_at, now);
  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <BackLink />
      <Card className="mt-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PHASE[contest.phase].tone}>{PHASE[contest.phase].label}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted"><Users className="size-3.5" /> {contest.participants} competing</span>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{contest.title}</h1>
        <p className="mt-2 text-sm text-muted">
          Four DSA problems worth {contest.max_score} points in total. The problems stay hidden until you start.
        </p>

        <p className="mt-6 text-xs font-semibold tracking-wider text-muted uppercase">{upcoming ? "Opens in" : "Contest closes in"}</p>
        <div className="mt-2"><CountdownBlocks c={c} /></div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <Timer className="size-4 text-warn" />
            <p className="mt-2 text-sm font-semibold">{contest.duration_minutes} minutes</p>
            <p className="text-xs text-muted">Personal timer, starts on confirm, no pausing.</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <Target className="size-4 text-brand" />
            <p className="mt-2 text-sm font-semibold">Points first</p>
            <p className="text-xs text-muted">Then fewest penalty minutes breaks ties.</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <Clock className="size-4 text-bad" />
            <p className="mt-2 text-sm font-semibold">Penalty</p>
            <p className="text-xs text-muted">Solve time + 5 minutes per wrong submission.</p>
          </div>
        </div>

        <div className="mt-8">
          {upcoming ? (
            <Button disabled><Lock className="size-4" /> Not open yet</Button>
          ) : (
            <StartContestButton contest={contest} onStarted={onStarted} size="lg" />
          )}
        </div>
      </Card>
    </div>
  );
}

function Arena({ contest, meId, setData, setUser, refresh }) {
  const problems = contest.problems || [];
  const [selected, setSelected] = useState(problems[0]?.slug);
  const now = useNow();
  const entry = contest.entry;
  const left = countdown(entry.deadline, now);
  const locked = left.done;
  const myRank = contest.leaderboard?.find((r) => r.user.id === meId)?.rank;
  const current = problems.find((p) => p.slug === selected);

  function onSubmitted(r) {
    if (r.user) setUser(r.user);
    if (r.entry) {
      setData((d) => ({
        ...d,
        entry: r.entry,
        problems: d.problems.map((p) => ({ ...p, solved: p.slug in r.entry.solved, wrong: r.entry.wrong[p.slug] || 0 })),
      }));
    }
    refresh();
  }

  return (
    <div className="-mx-4 -my-6 flex flex-col sm:-mx-6 lg:-mx-10 lg:-my-8 lg:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <BackLink />
        <span className="font-semibold">{contest.title}</span>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted">Score <span className="font-mono font-semibold text-text">{entry.score}/{contest.max_score}</span></span>
          {myRank && <span className="hidden text-muted sm:inline">Rank <span className="font-semibold text-text">#{myRank}</span></span>}
          <span className="hidden text-muted sm:inline">Penalty <span className="font-mono text-text">{entry.penalty}m</span></span>
          <span title="Your personal deadline"
            className={cx("flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-xs tabular-nums",
              locked ? "bg-bad/15 text-bad" : left.ms < 10 * 60 * 1000 ? "bg-warn/15 text-warn" : "bg-surface-2 text-text")}>
            {locked ? <Lock className="size-3.5" /> : <Clock className="size-3.5" />}
            {locked ? "Time is up" : formatCountdown(left)}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_1fr]">
        <nav className="border-b border-line lg:border-r lg:border-b-0">
          <p className="hidden px-4 pt-4 pb-2 text-[11px] font-semibold tracking-wider text-faint uppercase lg:block">Problems</p>
          <ol className="flex gap-2 overflow-x-auto p-3 lg:flex-col lg:gap-1 lg:overflow-visible lg:pt-0">
            {problems.map((p, i) => (
              <li key={p.slug} className="shrink-0">
                <button onClick={() => setSelected(p.slug)}
                  className={cx("flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition",
                    selected === p.slug ? "border-brand/60 bg-brand/10" : "border-line hover:border-brand/40 lg:border-transparent")}>
                  <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                    p.solved ? "bg-ok/15 text-ok" : p.wrong ? "bg-bad/15 text-bad" : "bg-surface-3 text-muted")}>
                    {p.solved ? <CircleCheck className="size-3.5" /> : String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block max-w-40 truncate font-medium">{p.title}</span>
                    <span className="flex items-center gap-2 text-[11px] text-faint">
                      <span className="font-mono">{p.points} pts</span>
                      {p.wrong > 0 && !p.solved && <span className="flex items-center gap-0.5 text-bad"><CircleX className="size-3" />{p.wrong}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-h-0 flex-col">
          {current ? (
            <ContestSolver key={current.slug} contestSlug={contest.slug} problemSlug={current.slug} solved={current.solved}
              locked={locked} leaderboard={contest.leaderboard} meId={meId} maxScore={contest.max_score}
              onSubmitted={onSubmitted} />
          ) : (
            <p className="p-6 text-sm text-faint">Select a problem.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FinalView({ contest, meId }) {
  const entry = contest.entry;
  const myRank = contest.leaderboard?.find((r) => r.user.id === meId)?.rank;
  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <BackLink />
      <div className="mt-4 mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge>Ended</Badge>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{contest.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatDate(contest.starts_at)} to {formatDate(contest.ends_at)} · {contest.participants} participants
          </p>
        </div>
      </div>

      {entry && (
        <Card className="mb-6 flex flex-wrap items-center gap-6 p-5">
          <div className="flex size-12 items-center justify-center rounded-xl bg-warn/15">
            {myRank && myRank <= 3 ? <Medal className="size-6 text-warn" /> : <Trophy className="size-6 text-warn" />}
          </div>
          <div>
            <p className="text-xs text-faint">Final rank</p>
            <p className="text-2xl font-bold">#{myRank ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-faint">Score</p>
            <p className="font-mono text-2xl font-bold">{entry.score}<span className="text-base text-faint">/{contest.max_score}</span></p>
          </div>
          <div>
            <p className="text-xs text-faint">Penalty</p>
            <p className="font-mono text-2xl font-bold">{entry.penalty}m</p>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold">Final standings</p>
          <ContestLeaderboard rows={contest.leaderboard} meId={meId} maxScore={contest.max_score} />
        </Card>

        <Card className="h-fit p-5">
          <p className="text-sm font-semibold">Problems</p>
          <p className="mt-1 text-xs text-muted">Practise them any time with hints and the AI coach.</p>
          <ul className="mt-4 space-y-2">
            {(contest.problems || []).map((p, i) => (
              <li key={p.slug}>
                <Link href={`/dsa/${p.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm transition hover:border-brand/50">
                  <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                    p.solved ? "bg-ok/15 text-ok" : "bg-surface-3 text-muted")}>
                    {p.solved ? <CircleCheck className="size-3.5" /> : String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="flex items-center gap-2 text-[11px] text-faint">
                      <span className="font-mono">{p.points} pts</span>
                      {p.difficulty && <Badge tone={DIFFICULTY_TONE[p.difficulty]} className="px-1.5 py-0 text-[10px]">{p.difficulty}</Badge>}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
