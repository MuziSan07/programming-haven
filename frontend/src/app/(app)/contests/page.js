"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Calendar, CircleAlert, Clock, Swords, Target, Timer, Trophy, Users } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader } from "@/components/ui";
import StartContestButton from "@/components/compete/StartContestButton";
import { PHASE, countdown, formatCountdown, formatDate, useNow } from "@/components/compete/time";

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] tracking-wider text-faint uppercase"><Icon className="size-3.5" />{label}</p>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function FeaturedContest({ contest, now }) {
  const router = useRouter();
  const target = contest.phase === "upcoming" ? contest.starts_at : contest.ends_at;
  const c = countdown(target, now);
  const entry = contest.entry;
  const myTime = entry ? countdown(entry.deadline, now) : null;
  const active = entry && !myTime.done;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PHASE[contest.phase].tone}>
              {contest.phase === "live" && <span className="size-1.5 rounded-full bg-ok" />}
              {PHASE[contest.phase].label}
            </Badge>
            <Badge tone="brand">Weekly</Badge>
            {entry && <Badge tone={active ? "warn" : "neutral"}>{active ? "In progress" : "Finished"}</Badge>}
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">{contest.title}</h2>
          <p className="mt-1 text-sm text-muted">
            Four problems of rising difficulty. Open {formatDate(contest.starts_at)} to {formatDate(contest.ends_at)}.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Clock} label={contest.phase === "upcoming" ? "Starts in" : "Ends in"} value={formatCountdown(c)} />
            <Stat icon={Users} label="Participants" value={contest.participants} />
            <Stat icon={Target} label="Max score" value={contest.max_score} />
            <Stat icon={Timer} label="Your timer" value={`${contest.duration_minutes} min`} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {contest.phase === "live" && !entry && (
              <StartContestButton contest={contest} onStarted={() => router.push(`/contests/${contest.slug}`)} />
            )}
            {entry && (
              <Button href={`/contests/${contest.slug}`}>
                {active ? "Resume contest" : "View results"} <ArrowRight className="size-4" />
              </Button>
            )}
            {!entry && contest.phase !== "live" && (
              <Button variant="secondary" href={`/contests/${contest.slug}`}>View contest</Button>
            )}
            {entry && (
              <span className="text-sm text-muted">
                Score <span className="font-mono font-semibold text-text">{entry.score}/{contest.max_score}</span>
                {active && <> · <span className="font-mono text-warn">{formatCountdown(myTime)}</span> left</>}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface-2 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold"><CircleAlert className="size-4 text-warn" /> Rules</p>
          <ul className="mt-3 space-y-2.5 text-sm text-muted">
            <li><span className="text-text">{contest.duration_minutes}-minute personal timer.</span> It starts when you
              press Start and never runs past the contest end.</li>
            <li><span className="text-text">Ranking:</span> total points first, then fewest penalty minutes.</li>
            <li><span className="text-text">Penalty</span> = minutes from your start to each solve + 5 per wrong submission
              on problems you solve.</li>
            <li>Problems are hidden until you start. No hints or editorials during the contest.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function PastContest({ contest }) {
  return (
    <Link href={`/contests/${contest.slug}`}
      className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-brand/50 sm:flex-row sm:items-center">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3">
        <Trophy className="size-5 text-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{contest.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <Calendar className="size-3.5" /> {formatDate(contest.starts_at)} to {formatDate(contest.ends_at)}
        </p>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1"><Users className="size-3.5" />{contest.participants}</span>
        {contest.entry ? (
          <span>You scored <span className="font-mono font-semibold text-text">{contest.entry.score}/{contest.max_score}</span></span>
        ) : (
          <span className="text-faint">Did not enter</span>
        )}
        <ArrowRight className="size-4" />
      </div>
    </Link>
  );
}

export default function ContestsPage() {
  const { data, error, loading, reload } = useApi("/api/contests");
  const now = useNow();
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const contests = data.contests;
  const featured = contests.find((c) => c.phase === "live") || contests.find((c) => c.phase === "upcoming");
  const past = contests.filter((c) => c !== featured && c.phase === "ended");

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <PageHeader eyebrow="Contests" title="Weekly contest"
        description="A timed, four-problem DSA round every week, the closest thing to a real online assessment. Top 3 earn the Podium badge." />

      {featured ? (
        <FeaturedContest contest={featured} now={now} />
      ) : (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Swords className="size-10 text-brand" />
          <p className="text-lg font-semibold">No contest running</p>
          <p className="max-w-md text-sm text-muted">A new weekly contest opens every Monday at 00:00 UTC.</p>
        </Card>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">Past contests <Badge>{past.length}</Badge></h2>
          <div className="space-y-3">
            {past.map((c) => <PastContest key={c.slug} contest={c} />)}
          </div>
        </section>
      )}
    </div>
  );
}
