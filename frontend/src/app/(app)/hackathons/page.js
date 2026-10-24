"use client";

import Link from "next/link";
import { CircleCheck, Clock, Code, Gift, Rocket, Trophy, Users } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Badge, Card, ErrorState, PageHeader, PageLoader } from "@/components/ui";
import { TechChip } from "@/components/TechLogo";
import { countdown, shortCountdown, useNow } from "./time";

const PHASES = [
  { id: "live", label: "Live now", tone: "ok" },
  { id: "upcoming", label: "Upcoming", tone: "cyan" },
  { id: "ended", label: "Ended", tone: "neutral" },
];

function HackathonCard({ h, now }) {
  const target = h.phase === "upcoming" ? h.starts_at : h.ends_at;
  const c = countdown(target, now);
  return (
    <Link href={`/hackathons/${h.slug}`}
      className="card group relative flex flex-col overflow-hidden p-6 transition hover:-translate-y-0.5 hover:border-brand/50">
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: h.accent }} />
      <div className="flex flex-wrap items-center gap-2">
        {h.has_prize ? (
          <Badge tone="warn"><Gift className="size-3" /> {h.prizes[0]?.reward} prize</Badge>
        ) : (
          <Badge tone="brand">Community hackathon</Badge>
        )}
        {h.enrollment && <Badge tone="ok"><CircleCheck className="size-3" /> You&apos;re in</Badge>}
      </div>
      <h3 className="mt-4 text-lg font-semibold group-hover:text-brand">{h.title}</h3>
      {h.tagline && <p className="mt-1 text-sm text-muted">{h.tagline}</p>}
      {(h.tracks.length > 0 || h.tech.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {h.tracks.map((t) => <span key={`t-${t}`} className="rounded-md bg-brand/15 px-2 py-0.5 text-[11px] text-[#b4a3ff]">{t}</span>)}
          {h.tech.slice(0, 5).map((t) => <TechChip key={`x-${t}`} name={t} />)}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Users className="size-3.5" />{h.enrolled_count}</span>
          <span className="flex items-center gap-1"><Code className="size-3.5" />{h.submission_count}</span>
        </span>
        {h.phase === "ended" ? (
          <span>{h.results_published ? <span className="flex items-center gap-1 text-warn"><Trophy className="size-3.5" /> Results out</span> : "Judging"}</span>
        ) : (
          <span className="flex items-center gap-1 font-mono tabular-nums text-text">
            <Clock className="size-3.5" />{h.phase === "upcoming" ? "Starts in " : "Ends in "}{shortCountdown(c)}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function HackathonsPage() {
  const { data, error, loading, reload } = useApi("/api/hackathons");
  const now = useNow();
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Hackathons" title="Build, ship, get noticed"
        description="Online hackathons run by Programming Haven. Enroll, build during the live window, submit your repo and climb the leaderboard." />
      {data.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Rocket className="size-10 text-brand" />
          <p className="text-lg font-semibold">No hackathons yet</p>
          <p className="max-w-md text-sm text-muted">Hackathons are announced by the Programming Haven team. Check back soon or keep sharpening your skills.</p>
        </Card>
      ) : (
        PHASES.map(({ id, label, tone }) => {
          const items = data.filter((h) => h.phase === id);
          if (!items.length) return null;
          return (
            <section key={id} className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                {label} <Badge tone={tone}>{items.length}</Badge>
              </h2>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {items.map((h) => <HackathonCard key={h.id} h={h} now={now} />)}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
