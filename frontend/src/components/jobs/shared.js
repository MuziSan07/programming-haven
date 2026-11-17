"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight, Briefcase, CalendarClock, ClipboardCheck, FileSearch, FolderGit2, MapPin, Mic, Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, Markdown, cx } from "@/components/ui";

export const STAGE_META = {
  resume: { icon: FileSearch, label: "AI resume screen", color: "#22d3ee" },
  interview: { icon: Mic, label: "AI interview", color: "#ec4899" },
  test: { icon: ClipboardCheck, label: "Proctored test", color: "#7c5cff" },
  project: { icon: FolderGit2, label: "Take-home project", color: "#a78bfa" },
};

export const STATUS_TONE = {
  vetting: "brand", vetted: "cyan", shortlisted: "ok", submitted: "ok", hired: "ok",
  rejected: "neutral", not_selected: "neutral", withdrawn: "neutral",
};

export function timeAgo(iso) {
  const days = Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function stageLength(s) {
  if (s.minutes) return `${s.minutes} min`;
  if (s.days) return `${s.days} days`;
  return "instant";
}

export function JobFacts({ job, className }) {
  const facts = [
    [MapPin, job.location],
    [Briefcase, `${job.employment_type} · ${job.seniority}`],
    job.salary && [Wallet, job.salary],
    job.closes_on && [CalendarClock, `Closes ${new Date(`${job.closes_on}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`],
  ].filter(Boolean);
  return (
    <div className={cx("flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted", className)}>
      {facts.map(([Icon, text]) => (
        <span key={text} className="flex items-center gap-1.5"><Icon className="size-3.5" /> {text}</span>
      ))}
    </div>
  );
}

export function JobCard({ job, href }) {
  return (
    <Link href={href} className="group card flex flex-col p-5 transition hover:border-brand/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold group-hover:text-brand">{job.title}</h3>
          <p className="mt-0.5 text-sm text-muted">{job.company}</p>
        </div>
        <span className="shrink-0 text-[11px] text-faint">{timeAgo(job.posted_at)}</span>
      </div>
      {job.summary && <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted">{job.summary}</p>}
      <JobFacts job={job} className="mt-3" />
      {job.skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.skills.slice(0, 6).map((s) => <Badge key={s}>{s}</Badge>)}
        </div>
      )}
    </Link>
  );
}

export function Pipeline({ stages, compact }) {
  return (
    <ol className={cx("grid gap-2", !compact && "sm:grid-cols-2")}>
      {stages.map((s, i) => {
        const meta = STAGE_META[s.type];
        const Icon = meta.icon;
        return (
          <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${meta.color}1f`, color: meta.color }}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{i + 1}. {s.title}</p>
              <p className="text-[11px] text-muted">{meta.label} · {stageLength(s)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The apply box: sign-up prompt for visitors, a nudge for learner accounts, the form for Job Seekers. */
function ApplyPanel({ job, basePath }) {
  const { user } = useAuth();
  const router = useRouter();
  const seeker = user?.account_type === "seeker";
  const profile = useApi(seeker ? "/api/seeker/profile" : null);
  const apps = useApi(seeker ? "/api/applications" : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const back = encodeURIComponent(`${basePath}/${job.id}`);

  if (!job.accepting) {
    return <p className="text-sm text-muted">This role is no longer accepting applications.</p>;
  }
  if (!user) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Applying is free. Create a Job Seeker account, add your profile and resume, then apply.</p>
        <Button href={`/register?type=seeker&next=${back}`} className="w-full">Sign up as a Job Seeker to apply</Button>
        <Button href={`/login?next=${back}`} variant="secondary" className="w-full">I already have an account</Button>
      </div>
    );
  }
  if (!seeker) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        You&apos;re signed in with a learning account. Applications need a separate Job Seeker account: sign out and
        sign up as a Job Seeker with another email.
      </p>
    );
  }
  if (profile.loading || apps.loading) return <p className="text-sm text-muted">Checking your profile…</p>;
  const existing = apps.data?.applications.find((a) => a.job.id === job.id);
  if (existing) {
    return (
      <div className="space-y-3">
        <Badge tone={STATUS_TONE[existing.status]}>{existing.status_label}</Badge>
        <Button href={`/seeker/applications/${existing.id}`} className="w-full">Open my application <ArrowRight className="size-4" /></Button>
      </div>
    );
  }
  if (profile.data && !profile.data.complete) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Finish your profile before applying. Missing: {profile.data.missing.join(", ")}.</p>
        <Button href={`/seeker/profile?next=${back}`} className="w-full">Complete my profile</Button>
      </div>
    );
  }

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const app = await api(`/api/jobs/${job.id}/apply`, { body: { cover_note: note } });
      router.push(`/seeker/applications/${app.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <label className="block text-sm text-muted" htmlFor="cover">Why are you a good fit? <span className="text-faint">(optional)</span></label>
      <textarea id="cover" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={3000}
        className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
        placeholder="Two or three sentences about the most relevant thing you've built." />
      {error && <p className="text-sm text-bad">{error}</p>}
      <Button onClick={apply} loading={busy} className="w-full">Apply and start vetting</Button>
      <p className="text-[11px] leading-relaxed text-faint">Your resume and profile go to the Programming Haven team. Vetting starts as soon as you apply.</p>
    </div>
  );
}

export function JobDetail({ job, basePath = "/jobs" }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <div>
          <p className="text-sm text-muted">{job.company}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{job.title}</h1>
          <JobFacts job={job} className="mt-3" />
          {job.skills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">{job.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
          )}
        </div>
        <Card className="p-6 sm:p-8"><Markdown>{job.description}</Markdown></Card>
        <div>
          <h2 className="mb-1 font-semibold">How vetting works for this role</h2>
          <p className="mb-4 text-sm text-muted">Every applicant goes through the same steps, run by our AI vetting system. You take each step when you&apos;re ready.</p>
          <Pipeline stages={job.stages} />
        </div>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Apply for this role</h2>
          <ApplyPanel job={job} basePath={basePath} />
        </Card>
      </div>
    </div>
  );
}

export function JobBoard({ jobs, hrefFor }) {
  const [query, setQuery] = useState("");
  const [seniority, setSeniority] = useState("");
  const q = query.trim().toLowerCase();
  const shown = jobs.filter((j) => (!seniority || j.seniority === seniority) && (!q
    || [j.title, j.company, j.location, j.summary, ...j.skills].join(" ").toLowerCase().includes(q)));
  const levels = [...new Set(jobs.map((j) => j.seniority))];
  return (
    <div>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title, skill or location"
          className="h-10 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-brand" />
        <select value={seniority} onChange={(e) => setSeniority(e.target.value)}
          className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-brand">
          <option value="">All levels</option>
          {levels.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      {shown.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {jobs.length ? "No roles match that search." : "No open roles right now. Check back soon."}
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((j) => <JobCard key={j.id} job={j} href={hrefFor(j)} />)}
        </div>
      )}
    </div>
  );
}
