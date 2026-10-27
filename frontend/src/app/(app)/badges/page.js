"use client";

import { Award, ClipboardCheck, Rocket } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Button, Card, ErrorState, PageHeader, PageLoader, Progress } from "@/components/ui";
import BadgeCard, { TIER_STYLE } from "@/components/badges/BadgeCard";
import CertificateCard from "@/components/badges/CertificateCard";

function Certificates() {
  const { data, error, loading, reload } = useApi("/api/certificates");
  if (loading) return <PageLoader label="Loading certificates" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const certs = data.certificates;

  if (!certs.length) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center text-center">
          <Award className="size-10 text-warn" />
          <p className="mt-3 text-lg font-semibold">No certificates yet</p>
          <p className="mt-1 max-w-lg text-sm text-muted">
            Certificates are public, verifiable proof you can put on LinkedIn or send to a recruiter. There are two ways to earn one.
          </p>
        </div>
        <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <ClipboardCheck className="size-5 text-brand-2" />
            <p className="mt-2 text-sm font-semibold">Pass a proctored mock test</p>
            <p className="mt-1 text-xs text-muted">Pass with an integrity score of 80 or higher.</p>
            <Button size="sm" variant="secondary" href="/tests" className="mt-3">Browse tests</Button>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <Rocket className="size-5 text-brand" />
            <p className="mt-2 text-sm font-semibold">Place top 3 in a hackathon</p>
            <p className="mt-1 text-xs text-muted">Podium finishers get a certificate once results are published.</p>
            <Button size="sm" variant="secondary" href="/hackathons" className="mt-3">See hackathons</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {certs.map((c) => <CertificateCard key={c.id} cert={c} />)}
    </div>
  );
}

export default function BadgesPage() {
  const { data, error, loading, reload } = useApi("/api/badges");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const badges = data.badges;
  const byTier = Object.keys(TIER_STYLE).map((t) => ({
    tier: t, earned: badges.filter((b) => b.tier === t && b.earned).length, total: badges.filter((b) => b.tier === t).length,
  }));
  const sorted = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned)
    || (b.progress / b.threshold) - (a.progress / a.threshold));

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Achievements" title="Badges & certificates"
        description="Badges track your milestones across the platform. Certificates are verifiable proof of skill you can share with employers." />

      <section>
        <Card className="mb-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm text-muted">Badges earned</p>
            <p className="text-3xl font-bold tabular-nums">{data.earned}<span className="text-lg font-normal text-faint"> / {data.total}</span></p>
            <Progress value={(data.earned / data.total) * 100} className="mt-3 max-w-sm" />
          </div>
          <div className="flex gap-3">
            {byTier.map(({ tier, earned, total }) => (
              <div key={tier} className="min-w-20 rounded-xl border border-line bg-surface-2 px-3 py-2 text-center">
                <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: TIER_STYLE[tier].color }}>
                  {TIER_STYLE[tier].label}
                </p>
                <p className="font-mono text-sm font-semibold">{earned}/{total}</p>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((b) => <BadgeCard key={b.id} badge={b} />)}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-1 text-lg font-semibold">Certificates</h2>
        <p className="mb-4 text-sm text-muted">Each certificate has a public verification page anyone can open, no account needed.</p>
        <Certificates />
      </section>
    </div>
  );
}
