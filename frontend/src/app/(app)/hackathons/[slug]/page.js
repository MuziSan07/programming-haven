"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Calendar, ChevronLeft, CircleCheck, Code, ExternalLink, Gift, Link as LinkIcon, Medal, MessageSquare, Trophy, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, Markdown, PageLoader, Progress, cx, scoreColor } from "@/components/ui";
import { countdown, localDate, useNow } from "../time";

const PHASE_TONE = { live: "ok", upcoming: "cyan", ended: "neutral" };
const MEDALS = ["#f5c542", "#c0c7d1", "#cd7f32"];

function Countdown({ h }) {
  const now = useNow();
  if (h.phase === "ended") {
    return <p className="text-sm text-muted">Ended {localDate(h.ends_at)}</p>;
  }
  const c = countdown(h.phase === "upcoming" ? h.starts_at : h.ends_at, now);
  const units = [["days", c.days], ["hrs", c.hours], ["min", c.minutes], ["sec", c.seconds]];
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-widest text-white/70 uppercase">
        {h.phase === "upcoming" ? "Starts in" : "Submissions close in"}
      </p>
      <div className="flex gap-2">
        {units.map(([label, v]) => (
          <div key={label} className="min-w-16 rounded-xl bg-black/30 px-3 py-2 text-center backdrop-blur">
            <p className="font-mono text-2xl font-bold tabular-nums">{String(v).padStart(2, "0")}</p>
            <p className="text-[10px] text-white/70 uppercase">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Prizes({ prizes }) {
  if (!prizes.length) {
    return (
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-semibold"><Gift className="size-4 text-brand" /> Prizes</h2>
        <p className="mt-2 text-sm text-muted">No cash prize: bragging rights, XP and a community badge.</p>
      </Card>
    );
  }
  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-semibold"><Gift className="size-4 text-warn" /> Prizes</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {prizes.map((p, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-2 p-4 text-center">
            <Medal className="mx-auto size-7" style={{ color: MEDALS[i] || "var(--color-muted)" }} />
            <p className="mt-2 text-xs text-muted">{p.place}</p>
            <p className="font-semibold">{p.reward}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EnrollCard({ h, onChange }) {
  const [team, setTeam] = useState(h.enrollment?.team_name || "");
  const [track, setTrack] = useState(h.enrollment?.track || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ended = h.phase === "ended";

  async function save(method) {
    setBusy(true);
    setError("");
    try {
      onChange(await api(`/api/hackathons/${h.slug}/enroll`, method === "DELETE"
        ? { method: "DELETE" } : { body: { team_name: team, track } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Users className="size-4 text-brand-2" /> {h.enrollment ? "You're enrolled" : "Join this hackathon"}
        {h.enrollment && <CircleCheck className="size-4 text-ok" />}
      </h2>
      {ended && !h.enrollment ? (
        <p className="mt-2 text-sm text-muted">Enrollment is closed.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="team">Team name <span className="normal-case text-faint">(optional, max {h.max_team_size} {h.max_team_size === 1 ? "person" : "people"})</span></label>
            <input id="team" className="input" value={team} onChange={(e) => setTeam(e.target.value)} disabled={ended} placeholder="Solo" />
          </div>
          {h.tracks.length > 0 && (
            <div>
              <label className="label" htmlFor="track">Track</label>
              <select id="track" className="input" value={track} onChange={(e) => setTrack(e.target.value)} disabled={ended}>
                <option value="">Choose a track</option>
                {h.tracks.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          )}
          {!ended && (
            <div className="flex gap-2">
              <Button onClick={() => save("POST")} loading={busy} className="flex-1">{h.enrollment ? "Update" : "Enroll"}</Button>
              {h.enrollment && !h.my_submission && (
                <Button variant="ghost" onClick={() => save("DELETE")} disabled={busy}>Leave</Button>
              )}
            </div>
          )}
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </Card>
  );
}

function SubmissionCard({ h, onSubmitted }) {
  const { setUser } = useAuth();
  const mine = h.my_submission;
  const [form, setForm] = useState({
    title: mine?.title || "", track: mine?.track || h.enrollment?.track || "", repo_url: mine?.repo_url || "",
    demo_url: mine?.demo_url || "", summary: mine?.summary || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      const r = await api(`/api/hackathons/${h.slug}/submit`, { body: form });
      setUser(r.user);
      setOk(r.first ? "Submitted! +75 XP" : "Submission updated");
      onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-semibold"><Code className="size-4 text-brand" /> {mine ? "Your submission" : "Submit your project"}</h2>
      {mine && (
        <p className="mt-1 text-xs text-faint">Submitted {localDate(mine.created_at)} · last updated {localDate(mine.updated_at)}</p>
      )}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="title">Project title</label>
          <input id="title" className="input" value={form.title} onChange={set("title")} required minLength={3} />
        </div>
        {h.tracks.length > 0 ? (
          <div>
            <label className="label" htmlFor="strack">Track</label>
            <select id="strack" className="input" value={form.track} onChange={set("track")}>
              <option value="">None</option>
              {h.tracks.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        ) : <div />}
        <div>
          <label className="label" htmlFor="repo">Repository URL</label>
          <input id="repo" className="input" type="url" value={form.repo_url} onChange={set("repo_url")} required placeholder="https://github.com/…" />
        </div>
        <div>
          <label className="label" htmlFor="demo">Demo URL <span className="normal-case text-faint">(optional)</span></label>
          <input id="demo" className="input" type="url" value={form.demo_url} onChange={set("demo_url")} placeholder="https://…" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="summary">What did you build? <span className="normal-case text-faint">({form.summary.trim().length}/30 min)</span></label>
          <textarea id="summary" className="input min-h-32" value={form.summary} onChange={set("summary")} required minLength={30}
            placeholder="The problem, your solution, the tech stack, and what you'd do next." />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={busy} disabled={form.summary.trim().length < 30}>{mine ? "Update submission" : "Submit project"}</Button>
          {ok && <span className="text-sm text-ok">{ok}</span>}
        </div>
        {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad sm:col-span-2">{error}</p>}
      </form>
    </Card>
  );
}

function SubmissionRow({ s, rank }) {
  const medal = rank && rank <= 3 ? MEDALS[rank - 1] : null;
  return (
    <div className={cx("flex items-center gap-4 rounded-xl border p-4", medal ? "border-warn/30 bg-warn/5" : "border-line")}>
      {rank ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: medal ? `${medal}33` : "var(--color-surface-3)", color: medal || "var(--color-muted)" }}>
          {medal ? <Trophy className="size-5" /> : `#${rank}`}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{s.title}</p>
        <p className="text-xs text-muted">by {s.author.name}{s.track && ` · ${s.track}`}</p>
        {!rank && <p className="mt-1 line-clamp-2 text-sm text-text/80">{s.summary}</p>}
      </div>
      {s.score != null && rank && (
        <span className="text-lg font-bold tabular-nums" style={{ color: scoreColor(s.score) }}>{Math.round(s.score)}</span>
      )}
      <div className="flex shrink-0 gap-1">
        <a href={s.repo_url} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-muted hover:text-text" title="Repository">
          <LinkIcon className="size-4" />
        </a>
        {s.demo_url && (
          <a href={s.demo_url} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-muted hover:text-text" title="Demo">
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function HackathonPage() {
  const { slug } = useParams();
  const { data: h, error, loading, reload, setData } = useApi(`/api/hackathons/${slug}`);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const totalWeight = h.criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0) || 1;

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <Link href="/hackathons" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> All hackathons
      </Link>

      <div className="relative overflow-hidden rounded-2xl p-6 text-white sm:p-8"
        style={{ background: `linear-gradient(120deg, ${h.accent}, #0d1220 85%)` }}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PHASE_TONE[h.phase]} className="capitalize">{h.phase}</Badge>
          {h.has_prize ? <Badge tone="warn"><Gift className="size-3" /> Prizes</Badge> : <Badge tone="brand">Community hackathon</Badge>}
          {h.enrollment && <Badge tone="ok"><CircleCheck className="size-3" /> You&apos;re in</Badge>}
        </div>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{h.title}</h1>
        {h.tagline && <p className="mt-2 max-w-2xl text-white/80">{h.tagline}</p>}
        <div className="mt-6 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <Countdown h={h} />
          <div className="flex gap-4 text-sm text-white/80">
            <span className="flex items-center gap-1"><Users className="size-4" /> {h.enrolled_count} enrolled</span>
            <span className="flex items-center gap-1"><Code className="size-4" /> {h.submission_count} submitted</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {h.description && (
            <Card className="p-6">
              <h2 className="mb-2 font-semibold">About</h2>
              <Markdown>{h.description}</Markdown>
            </Card>
          )}
          <Prizes prizes={h.prizes} />
          {h.rules && (
            <Card className="p-6">
              <h2 className="mb-2 font-semibold">Rules</h2>
              <Markdown>{h.rules}</Markdown>
            </Card>
          )}
          {h.criteria.length > 0 && (
            <Card className="p-6">
              <h2 className="font-semibold">Judging criteria</h2>
              <div className="mt-4 space-y-4">
                {h.criteria.map((c) => (
                  <div key={c.criterion}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{c.criterion}</span>
                      <span className="text-muted">{c.weight}%</span>
                    </div>
                    <Progress value={(100 * Number(c.weight || 0)) / totalWeight} color={h.accent} />
                    {c.description && <p className="mt-1 text-xs text-muted">{c.description}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {h.phase === "live" && h.enrollment && <SubmissionCard key={h.my_submission?.updated_at || "new"} h={h} onSubmitted={reload} />}

          {h.leaderboard ? (
            <Card className="p-6">
              <h2 className="flex items-center gap-2 font-semibold"><Trophy className="size-4 text-warn" /> Results</h2>
              <div className="mt-4 space-y-2">
                {h.leaderboard.map((s) => <SubmissionRow key={s.id} s={s} rank={s.rank} />)}
              </div>
            </Card>
          ) : h.gallery ? (
            <Card className="p-6">
              <h2 className="font-semibold">Submissions</h2>
              <p className="mt-1 text-xs text-muted">Judging in progress. Results will appear here.</p>
              <div className="mt-4 space-y-2">
                {h.gallery.length === 0 ? <p className="text-sm text-faint">No submissions.</p>
                  : h.gallery.map((s) => <SubmissionRow key={s.id} s={s} />)}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <EnrollCard key={JSON.stringify(h.enrollment)} h={h} onChange={setData} />
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Calendar className="size-4 text-brand-2" /> Timeline</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Starts</dt><dd>{localDate(h.starts_at)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Ends</dt><dd>{localDate(h.ends_at)}</dd></div>
            </dl>
          </Card>
          {(h.tracks.length > 0 || h.tech.length > 0) && (
            <Card className="p-6">
              {h.tracks.length > 0 && (
                <>
                  <h2 className="font-semibold">Tracks</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.tracks.map((t) => <span key={t} className="rounded-md bg-brand/15 px-2 py-0.5 text-xs text-[#b4a3ff]">{t}</span>)}
                  </div>
                </>
              )}
              {h.tech.length > 0 && (
                <>
                  <h2 className={cx("font-semibold", h.tracks.length > 0 && "mt-4")}>Suggested tech</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.tech.map((t) => <span key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{t}</span>)}
                  </div>
                </>
              )}
            </Card>
          )}
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4 text-brand" /> Discussion</h2>
            <p className="mt-1 text-sm text-muted">
              {h.discussion_count ? `${h.discussion_count} post${h.discussion_count === 1 ? "" : "s"} from participants.` : "Find teammates, ask questions, share progress."}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button href={`/community/new?hackathon=${h.id}`} size="sm">Start a discussion</Button>
              <Button href={`/community?hackathon=${h.id}`} variant="secondary" size="sm">View discussion</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
