"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ExternalLink, Link as LinkIcon, Pencil, Plus, Sparkles, Trash, Trophy, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageLoader, cx, scoreColor } from "@/components/ui";

const PHASE_TONE = { live: "ok", upcoming: "cyan", ended: "neutral" };

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm() {
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return {
    slug: "", title: "", tagline: "", accent: "#7c5cff", starts_at: toLocalInput(start.toISOString()),
    ends_at: toLocalInput(end.toISOString()), max_team_size: 1, tracks: "", tech: "", description: "", rules: "",
    prizes: [], criteria: [
      { criterion: "Impact", weight: 30, description: "How useful is it for developers?" },
      { criterion: "Technical execution", weight: 40, description: "Code quality, architecture, completeness" },
      { criterion: "Creativity", weight: 15, description: "Originality of the idea" },
      { criterion: "Presentation", weight: 15, description: "README, demo and clarity" },
    ],
    published: false,
  };
}

function fromHackathon(h) {
  return {
    slug: h.slug, title: h.title, tagline: h.tagline, accent: h.accent, starts_at: toLocalInput(h.starts_at),
    ends_at: toLocalInput(h.ends_at), max_team_size: h.max_team_size, tracks: h.tracks.join(", "),
    tech: h.tech.join(", "), description: h.description || "", rules: h.rules || "", prizes: h.prizes,
    criteria: h.criteria, published: h.published,
  };
}

const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

function HackathonForm({ initial, id, onDone, onCancel }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const weightTotal = form.criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);

  const updateRow = (key, i, field, value) =>
    setForm({ ...form, [key]: form[key].map((row, j) => (j === i ? { ...row, [field]: value } : row)) });
  const removeRow = (key, i) => setForm({ ...form, [key]: form[key].filter((_, j) => j !== i) });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        ...form, max_team_size: Number(form.max_team_size), tracks: splitList(form.tracks), tech: splitList(form.tech),
        starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(),
        criteria: form.criteria.map((c) => ({ ...c, weight: Number(c.weight) })),
      };
      const saved = await api(id ? `/api/admin/hackathons/${id}` : "/api/admin/hackathons", { method: id ? "PUT" : "POST", body });
      onDone(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <button onClick={onCancel} className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft className="size-4" /> Back</button>
      <h2 className="text-lg font-semibold">{id ? "Edit hackathon" : "New hackathon"}</h2>
      <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="h-title">Title</label>
          <input id="h-title" className="input" value={form.title} onChange={set("title")} required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor="h-slug">Slug (URL)</label>
          <input id="h-slug" className="input font-mono" value={form.slug} onChange={set("slug")} required pattern="[a-z0-9][a-z0-9-]*"
            placeholder="haven-launch-2026" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="h-tag">Tagline</label>
          <input id="h-tag" className="input" value={form.tagline} onChange={set("tagline")} />
        </div>
        <div>
          <label className="label" htmlFor="h-start">Starts</label>
          <input id="h-start" type="datetime-local" className="input" value={form.starts_at} onChange={set("starts_at")} required />
        </div>
        <div>
          <label className="label" htmlFor="h-end">Ends (submission deadline)</label>
          <input id="h-end" type="datetime-local" className="input" value={form.ends_at} onChange={set("ends_at")} required />
        </div>
        <div>
          <label className="label" htmlFor="h-team">Max team size</label>
          <input id="h-team" type="number" min={1} max={10} className="input" value={form.max_team_size} onChange={set("max_team_size")} />
        </div>
        <div>
          <label className="label" htmlFor="h-accent">Accent colour</label>
          <div className="flex gap-2">
            <input id="h-accent" type="color" className="h-10 w-14 rounded-lg border border-line bg-surface-2" value={form.accent} onChange={set("accent")} />
            <input className="input font-mono" value={form.accent} onChange={set("accent")} pattern="#[0-9a-fA-F]{6}" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="h-tracks">Tracks (comma-separated)</label>
          <input id="h-tracks" className="input" value={form.tracks} onChange={set("tracks")} placeholder="AI, Web, Mobile" />
        </div>
        <div>
          <label className="label" htmlFor="h-tech">Suggested tech (comma-separated)</label>
          <input id="h-tech" className="input" value={form.tech} onChange={set("tech")} placeholder="Python, React, FastAPI" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="h-desc">Description (Markdown)</label>
          <textarea id="h-desc" className="input min-h-32 font-mono text-xs" value={form.description} onChange={set("description")} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="h-rules">Rules (Markdown)</label>
          <textarea id="h-rules" className="input min-h-24 font-mono text-xs" value={form.rules} onChange={set("rules")} />
        </div>

        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="label mb-0">Prizes {form.prizes.length === 0 && <span className="normal-case text-faint">(none: community hackathon)</span>}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, prizes: [...form.prizes, { place: "", reward: "" }] })}>
              <Plus className="size-3.5" /> Add prize
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {form.prizes.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" placeholder="1st place" value={p.place} onChange={(e) => updateRow("prizes", i, "place", e.target.value)} required />
                <input className="input" placeholder="$500 + mentorship" value={p.reward} onChange={(e) => updateRow("prizes", i, "reward", e.target.value)} required />
                <Button type="button" size="sm" variant="ghost" onClick={() => removeRow("prizes", i)} aria-label="Remove prize"><Trash className="size-3.5" /></Button>
              </div>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="label mb-0">
              Judging criteria · <span className={cx("normal-case", weightTotal === 100 ? "text-ok" : "text-bad")}>total {weightTotal}/100</span>
            </span>
            <Button type="button" size="sm" variant="ghost"
              onClick={() => setForm({ ...form, criteria: [...form.criteria, { criterion: "", weight: 0, description: "" }] })}>
              <Plus className="size-3.5" /> Add criterion
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {form.criteria.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_90px_2fr_auto]">
                <input className="input" placeholder="Criterion" value={c.criterion} onChange={(e) => updateRow("criteria", i, "criterion", e.target.value)} required />
                <input className="input" type="number" min={0} max={100} value={c.weight} onChange={(e) => updateRow("criteria", i, "weight", e.target.value)} />
                <input className="input" placeholder="What judges look for" value={c.description || ""} onChange={(e) => updateRow("criteria", i, "description", e.target.value)} />
                <Button type="button" size="sm" variant="ghost" onClick={() => removeRow("criteria", i)} aria-label="Remove criterion"><Trash className="size-3.5" /></Button>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.published} onChange={set("published")} className="size-4 accent-[#7c5cff]" />
          Published (visible to members)
        </label>
        {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={busy} disabled={form.criteria.length > 0 && weightTotal !== 100}>{id ? "Save changes" : "Create hackathon"}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function ReviewDetails({ review }) {
  const [open, setOpen] = useState(false);
  if (!review) return <span className="text-xs text-faint">Not judged</span>;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-brand hover:underline">
        AI review {review.overall_score != null && `· ${review.overall_score}`}
        <ChevronDown className={cx("size-3 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-surface-2 p-3 text-xs">
          {review.summary && <p className="text-text/90">{review.summary}</p>}
          {review.criteria?.map((c) => (
            <p key={c.criterion}><span className="font-semibold">{c.criterion}: {c.score}</span> <span className="text-muted">{c.comment}</span></p>
          ))}
          {review.strengths?.length > 0 && <p className="text-ok">+ {review.strengths.join(" · ")}</p>}
          {review.weaknesses?.length > 0 && <p className="text-warn">− {review.weaknesses.join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}

function ScoreEditor({ s, onSaved }) {
  const [score, setScore] = useState(s.score ?? "");
  const [rank, setRank] = useState(s.rank ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = String(score) !== String(s.score ?? "") || String(rank) !== String(s.rank ?? "");

  async function save() {
    setBusy(true);
    try {
      await api(`/api/admin/hackathons/submissions/${s.id}`, {
        method: "PATCH", body: { score: score === "" ? null : Number(score), rank: rank === "" ? null : Number(rank) },
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input className="input w-16 px-2 py-1 text-xs" type="number" min={0} max={100} placeholder="score" value={score}
        onChange={(e) => setScore(e.target.value)} aria-label="Score" />
      <input className="input w-14 px-2 py-1 text-xs" type="number" min={1} placeholder="rank" value={rank}
        onChange={(e) => setRank(e.target.value)} aria-label="Rank" />
      {dirty && <Button size="sm" onClick={save} loading={busy}>Save</Button>}
    </div>
  );
}

function Participants({ id, onBack }) {
  const { data, error, loading, reload } = useApi(`/api/admin/hackathons/${id}/participants`);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const h = data.hackathon;

  async function act(kind) {
    setBusy(kind);
    setMessage("");
    try {
      if (kind === "judge") {
        const r = await api(`/api/admin/hackathons/${id}/judge`, { method: "POST" });
        setMessage(`AI judged ${r.judged} submission${r.judged === 1 ? "" : "s"}.`);
      } else {
        await api(`/api/admin/hackathons/${id}/results?publish=${kind === "publish"}`, { method: "POST" });
        setMessage(kind === "publish" ? "Results published." : "Results hidden.");
      }
      reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted hover:text-text"><ChevronLeft className="size-4" /> All hackathons</button>
      <Card className="flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{h.title}</h2>
          <p className="text-xs text-muted">{data.enrollments.length} enrolled · {data.submissions.length} submitted</p>
        </div>
        <Button variant="secondary" onClick={() => act("judge")} loading={busy === "judge"} disabled={!data.submissions.length}>
          <Sparkles className="size-4" /> Run AI judging
        </Button>
        {h.results_published ? (
          <Button variant="ghost" onClick={() => act("unpublish")} loading={busy === "unpublish"}>Unpublish results</Button>
        ) : (
          <Button onClick={() => act("publish")} loading={busy === "publish"} disabled={!data.submissions.length}>
            <Trophy className="size-4" /> Publish results
          </Button>
        )}
        {message && <p className="w-full text-sm text-muted">{message}</p>}
      </Card>

      <Card className="overflow-x-auto">
        <h3 className="border-b border-line px-5 py-3 text-sm font-semibold">Submissions</h3>
        {data.submissions.length === 0 ? <p className="p-5 text-sm text-faint">No submissions yet.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr><th className="px-4 py-2">Project</th><th className="px-4 py-2">Author</th><th className="px-4 py-2">Review</th><th className="px-4 py-2">Score / rank</th></tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {data.submissions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.title}</p>
                    <p className="mt-0.5 line-clamp-2 max-w-xs text-xs text-muted">{s.summary}</p>
                    <div className="mt-1 flex gap-2 text-xs">
                      <a href={s.repo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-2 hover:underline"><LinkIcon className="size-3" /> repo</a>
                      {s.demo_url && <a href={s.demo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-2 hover:underline"><ExternalLink className="size-3" /> demo</a>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.author.name}{s.track && <p className="text-faint">{s.track}</p>}</td>
                  <td className="px-4 py-3">
                    <ReviewDetails review={s.ai_review} />
                    {s.score != null && <p className="mt-1 text-xs font-semibold" style={{ color: scoreColor(s.score) }}>Final {Math.round(s.score)}</p>}
                  </td>
                  <td className="px-4 py-3"><ScoreEditor key={`${s.score}-${s.rank}`} s={s} onSaved={reload} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <h3 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-semibold"><Users className="size-4" /> Enrollments</h3>
        {data.enrollments.length === 0 ? <p className="p-5 text-sm text-faint">Nobody has enrolled yet.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr><th className="px-4 py-2">Member</th><th className="px-4 py-2">Team</th><th className="px-4 py-2">Track</th><th className="px-4 py-2">Joined</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.enrollments.map((e) => (
                <tr key={e.user.id}>
                  <td className="px-4 py-2.5">{e.user.name}<p className="text-xs text-faint">{e.user.email}</p></td>
                  <td className="px-4 py-2.5 text-muted">{e.team_name || "Solo"}</td>
                  <td className="px-4 py-2.5 text-muted">{e.track || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-faint">{new Date(e.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function HackathonsTab() {
  const { data, error, loading, reload } = useApi("/api/admin/hackathons");
  const [view, setView] = useState({ mode: "list" }); // list | new | edit | participants

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (view.mode === "new" || view.mode === "edit") {
    return (
      <HackathonForm key={view.id || "new"} id={view.id} initial={view.mode === "edit" ? fromHackathon(view.h) : emptyForm()}
        onCancel={() => setView({ mode: "list" })} onDone={() => { reload(); setView({ mode: "list" }); }} />
    );
  }
  if (view.mode === "participants") {
    return <Participants id={view.id} onBack={() => { reload(); setView({ mode: "list" }); }} />;
  }

  async function remove(h) {
    if (!window.confirm(`Delete "${h.title}"? Enrollments and submissions will be deleted too.`)) return;
    await api(`/api/admin/hackathons/${h.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Create and run online hackathons. Published hackathons appear to all members.</p>
        <Button onClick={() => setView({ mode: "new" })}><Plus className="size-4" /> New hackathon</Button>
      </div>
      {data.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">No hackathons yet. Create the first one.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((h) => (
            <Card key={h.id} className="relative overflow-hidden p-5">
              <div className="absolute inset-y-0 left-0 w-1" style={{ background: h.accent }} />
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={PHASE_TONE[h.phase]} className="capitalize">{h.phase}</Badge>
                <Badge tone={h.published ? "ok" : "neutral"}>{h.published ? "Published" : "Draft"}</Badge>
                {h.results_published && <Badge tone="warn">Results out</Badge>}
                {!h.has_prize && <Badge tone="brand">No prize</Badge>}
              </div>
              <h3 className="mt-3 font-semibold">{h.title}</h3>
              <p className="text-xs text-muted">{new Date(h.starts_at).toLocaleString()} → {new Date(h.ends_at).toLocaleString()}</p>
              <p className="mt-2 text-xs text-faint">{h.enrolled_count} enrolled · {h.submission_count} submissions</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setView({ mode: "participants", id: h.id })}><Users className="size-3.5" /> Participants</Button>
                <Button size="sm" variant="ghost" onClick={() => setView({ mode: "edit", id: h.id, h })}><Pencil className="size-3.5" /> Edit</Button>
                <Button size="sm" variant="ghost" href={`/hackathons/${h.slug}`}><ExternalLink className="size-3.5" /> View</Button>
                <Button size="sm" variant="danger" onClick={() => remove(h)}><Trash className="size-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
