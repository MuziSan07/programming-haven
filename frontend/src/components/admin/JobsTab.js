"use client";

import { useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowUp, BriefcaseBusiness, ExternalLink, FileText, Pencil, Plus, Trash, Users, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, Markdown, PageLoader, cx, scoreColor } from "@/components/ui";
import { STAGE_META, STATUS_TONE, timeAgo } from "@/components/jobs/shared";

const field = "mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand";
const JOB_TONE = { draft: "neutral", open: "ok", closed: "warn" };
const STATUS_TEXT = {
  vetting: "Vetting", vetted: "Vetted", shortlisted: "Shortlisted", submitted: "Sent to hiring team", hired: "Hired",
  rejected: "Rejected", not_selected: "Failed vetting", withdrawn: "Withdrawn",
};
const REC_TONE = { "Strong yes": "ok", Yes: "ok", Maybe: "warn", No: "bad" };

const EMPTY_JOB = {
  title: "", client_name: "", show_client: false, location: "Remote", employment_type: "Full-time",
  seniority: "Mid-level", salary: "", skills: [], summary: "", description: "", role: "Full Stack Developer",
  language: "python", status: "draft", openings: 1, closes_on: "",
};

function Label({ text, children, className }) {
  return <label className={cx("block text-xs text-muted", className)}>{text}{children}</label>;
}

// ---------------------------------------------------------------- the stage builder

function StageRow({ stage, index, total, blocks, onChange, onMove, onRemove }) {
  const meta = STAGE_META[stage.type];
  const Icon = meta.icon;
  const set = (patch) => onChange({ ...stage, ...patch });
  const test = blocks.tests.find((t) => t.id === stage.test);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-3 sm:flex-row sm:items-end">
      <span className="flex size-9 shrink-0 items-center justify-center self-start rounded-lg sm:self-center"
        style={{ background: `${meta.color}1f`, color: meta.color }}><Icon className="size-4" /></span>
      <Label text="Stage" className="sm:w-44">
        <select className={field} value={stage.type} onChange={(e) => onChange({ type: e.target.value })}>
          {blocks.types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </Label>
      {stage.type === "interview" && (
        <Label text="Interview" className="flex-1">
          <select className={field} value={stage.kind || ""} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">Choose…</option>
            {blocks.interviews.map((k) => <option key={k.kind} value={k.kind}>{k.label} ({k.minutes} min)</option>)}
          </select>
        </Label>
      )}
      {stage.type === "test" && (
        <Label text="Test" className="flex-1">
          <select className={field} value={stage.test || ""} onChange={(e) => set({ test: e.target.value })}>
            <option value="">Choose…</option>
            {blocks.tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.minutes} min)</option>)}
          </select>
        </Label>
      )}
      {stage.type === "project" && (
        <>
          <Label text="Project" className="flex-1">
            <select className={field} value={stage.project || ""} onChange={(e) => set({ project: e.target.value || null })}>
              <option value="">Pick automatically for the role</option>
              {blocks.projects.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.level}, {p.hours} h)</option>)}
            </select>
          </Label>
          <Label text="Days" className="sm:w-20">
            <input type="number" min={1} max={21} className={field} value={stage.days ?? 5} onChange={(e) => set({ days: Number(e.target.value) })} />
          </Label>
        </>
      )}
      {stage.type === "resume" && <p className="flex-1 pb-2 text-xs text-muted">Runs automatically when the candidate reaches it.</p>}
      {stage.type === "test" ? (
        <p className="pb-2 text-xs text-muted sm:w-24">Pass {test ? test.pass_mark : "-"}</p>
      ) : (
        <Label text="Pass mark" className="sm:w-24">
          <input type="number" min={1} max={100} className={field} value={stage.pass ?? ""}
            onChange={(e) => set({ pass: e.target.value === "" ? null : Number(e.target.value) })} />
        </Label>
      )}
      <div className="flex gap-1 self-end">
        <Button type="button" size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="size-3.5" /></Button>
        <Button type="button" size="sm" variant="ghost" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="size-3.5" /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove} aria-label="Remove stage"><Trash className="size-3.5" /></Button>
      </div>
    </li>
  );
}

function StageBuilder({ stages, setStages, blocks, locked }) {
  if (locked) {
    return (
      <div>
        <ol className="space-y-2">
          {stages.map((s, i) => (
            <li key={i} className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
              {i + 1}. {s.title || STAGE_META[s.type].label}{s.pass ? ` · pass ${s.pass}` : ""}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-faint">Candidates have applied, so the pipeline is locked. Close this job and post a new one to change it.</p>
      </div>
    );
  }
  const update = (i, s) => setStages(stages.map((x, j) => (j === i ? s : x)));
  const move = (i, d) => {
    const next = [...stages];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setStages(next);
  };
  return (
    <div>
      <ol className="space-y-2">
        {stages.map((s, i) => (
          <StageRow key={i} stage={s} index={i} total={stages.length} blocks={blocks}
            onChange={(x) => update(i, x)} onMove={(d) => move(i, d)} onRemove={() => setStages(stages.filter((_, j) => j !== i))} />
        ))}
      </ol>
      {stages.length < 6 && (
        <Button type="button" size="sm" variant="secondary" className="mt-3"
          onClick={() => setStages([...stages, { type: "interview", kind: "technical", pass: 70 }])}>
          <Plus className="size-3.5" /> Add stage
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- job editor

function JobEditor({ job, meta, onSaved, onCancel }) {
  const editing = Boolean(job?.id);
  const [form, setForm] = useState(() => (editing
    ? { ...EMPTY_JOB, ...job, closes_on: job.closes_on || "", skills_text: job.skills.join(", ") }
    : { ...EMPTY_JOB, skills_text: "" }));
  const [stages, setStages] = useState(() => (editing ? job.pipeline : meta.default_stages));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const locked = editing && job.counts?.total > 0;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { skills_text: skillsText, ...rest } = form;
    const body = {
      title: rest.title, client_name: rest.client_name, show_client: rest.show_client, location: rest.location,
      employment_type: rest.employment_type, seniority: rest.seniority, salary: rest.salary, summary: rest.summary,
      description: rest.description, role: rest.role, language: rest.language, status: rest.status,
      openings: Number(rest.openings) || 1, closes_on: rest.closes_on || null,
      skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean),
      stages: stages.map(({ type, kind, test, project, days, pass }) => ({ type, kind, test, project, days, pass })),
    };
    try {
      const saved = await api(editing ? `/api/admin/jobs/${job.id}` : "/api/admin/jobs",
        { method: editing ? "PUT" : "POST", body });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{editing ? `Edit: ${job.title}` : "Post a new job"}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}><X className="size-4" /> Cancel</Button>
      </div>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Label text="Job title" className="sm:col-span-2"><input className={field} required minLength={3} value={form.title} onChange={set("title")} placeholder="Senior Backend Engineer" /></Label>
        <Label text="One-line summary (shown on job cards)" className="sm:col-span-2"><input className={field} maxLength={400} value={form.summary} onChange={set("summary")} /></Label>
        <Label text="Seniority">
          <select className={field} value={form.seniority} onChange={set("seniority")}>{meta.options.seniority.map((s) => <option key={s}>{s}</option>)}</select>
        </Label>
        <Label text="Employment type">
          <select className={field} value={form.employment_type} onChange={set("employment_type")}>{meta.options.employment_types.map((s) => <option key={s}>{s}</option>)}</select>
        </Label>
        <Label text="Location"><input className={field} value={form.location} onChange={set("location")} /></Label>
        <Label text="Salary or rate (optional)"><input className={field} value={form.salary} onChange={set("salary")} placeholder="$4,000 to $6,000 a month" /></Label>
        <Label text="Skills (comma separated, used by the resume screen)" className="sm:col-span-2">
          <input className={field} value={form.skills_text} onChange={set("skills_text")} placeholder="Python, FastAPI, PostgreSQL" />
        </Label>
        <Label text="Openings"><input type="number" min={1} max={500} className={field} value={form.openings} onChange={set("openings")} /></Label>
        <Label text="Applications close on (optional)"><input type="date" className={field} value={form.closes_on} onChange={set("closes_on")} /></Label>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Job description <span className="font-normal text-muted">(Markdown)</span></p>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(!preview)}>{preview ? "Edit" : "Preview"}</Button>
        </div>
        {preview
          ? <div className="rounded-xl border border-line p-4"><Markdown>{form.description}</Markdown></div>
          : <textarea className={cx(field, "min-h-64 font-mono text-[13px]")} required minLength={20} value={form.description} onChange={set("description")}
              placeholder={"## About the role\n...\n\n## What you'll do\n- ...\n\n## Requirements\n- ..."} />}
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <p className="text-sm font-medium sm:col-span-2">Client <span className="font-normal text-muted">(optional, internal)</span></p>
        <Label text="Client name"><input className={field} value={form.client_name} onChange={set("client_name")} placeholder="Only the admin team sees this" /></Label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={form.show_client} onChange={set("show_client")} className="size-4 accent-[var(--color-brand)]" />
          Show the client name on the public job post
        </label>
        <p className="text-xs text-faint sm:col-span-2">When hidden, the job shows as posted by Programming Haven.</p>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <p className="text-sm font-medium">Vetting pipeline</p>
          <p className="text-xs text-muted">Candidates take these steps in order. Failing one ends their application.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="Role used for AI interviews and project picks">
            <select className={field} value={form.role} onChange={set("role")}>{meta.options.roles.map((r) => <option key={r}>{r}</option>)}</select>
          </Label>
          <Label text="Coding language">
            <select className={field} value={form.language} onChange={set("language")}><option value="python">Python</option><option value="javascript">JavaScript</option></select>
          </Label>
        </div>
        <StageBuilder stages={stages} setStages={setStages} blocks={meta.blocks} locked={locked} />
      </Card>

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <Label text="Status" className="sm:w-48">
          <select className={field} value={form.status} onChange={set("status")}>
            <option value="draft">Draft (hidden)</option><option value="open">Open (public)</option><option value="closed">Closed</option>
          </select>
        </Label>
        <div className="flex-1" />
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button type="submit" loading={busy}>{editing ? "Save changes" : "Create job"}</Button>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------- candidates

function ScoreChip({ value }) {
  if (value === null || value === undefined) return <span className="text-faint">-</span>;
  return <span className="font-semibold tabular-nums" style={{ color: scoreColor(value) }}>{Math.round(value)}</span>;
}

function CandidateDetail({ app, onChange }) {
  const [note, setNote] = useState(app.admin_note || "");
  const [feedback, setFeedback] = useState(app.feedback || "");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const p = app.candidate.profile;
  const report = app.report;

  const patch = async (body, key) => {
    setBusy(key);
    setError(null);
    try {
      onChange(await api(`/api/admin/applications/${app.id}`, { method: "PATCH", body }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const resume = async () => {
    try {
      const res = await api(`/api/admin/applications/${app.id}/resume`, { raw: true });
      window.open(URL.createObjectURL(await res.blob()), "_blank", "noopener");
    } catch (e) {
      setError(e.message);
    }
  };
  const done = !["vetting", "withdrawn"].includes(app.status);

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{app.candidate.name}</p>
          <p className="text-sm text-muted">{app.candidate.email}{p?.phone ? ` · ${p.phone}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[app.status]}>{STATUS_TEXT[app.status]}</Badge>
          {report && <Badge tone={REC_TONE[report.recommendation]}>{report.recommendation}</Badge>}
        </div>
      </div>

      {p && (
        <div className="grid gap-2 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-2">
          <p className="sm:col-span-2 font-medium">{p.headline}</p>
          <p><span className="text-muted">Role: </span>{p.primary_role} · {p.years_experience} years</p>
          <p><span className="text-muted">English: </span>{p.english_level || "-"}</p>
          <p><span className="text-muted">Location: </span>{[p.location, p.timezone].filter(Boolean).join(", ") || "-"}</p>
          <p><span className="text-muted">Available: </span>{p.availability || "-"}{p.expected_rate ? ` · ${p.expected_rate}` : ""}</p>
          <div className="sm:col-span-2 flex flex-wrap gap-1.5">{p.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
          {p.summary && <p className="sm:col-span-2 text-[13px] leading-relaxed text-muted">{p.summary}</p>}
          <div className="sm:col-span-2 flex flex-wrap gap-3 text-[13px]">
            {Object.entries(p.links || {}).filter(([, url]) => url).map(([k, url]) => (
              <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand hover:underline">
                {k} <ExternalLink className="size-3" />
              </a>
            ))}
            {p.resume && <button type="button" onClick={resume} className="flex items-center gap-1 text-brand hover:underline"><FileText className="size-3.5" /> {p.resume.name}</button>}
          </div>
        </div>
      )}
      {app.cover_note && <blockquote className="border-l-2 border-brand/40 pl-3 text-sm text-muted">{app.cover_note}</blockquote>}

      <div>
        <p className="mb-2 text-sm font-medium">Stage results</p>
        <ol className="space-y-2">
          {app.stages.map((s) => (
            <li key={s.index} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.index + 1}. {s.title}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-muted">{s.status}</span>
                  <ScoreChip value={s.score} /><span className="text-faint">/ {s.pass_mark}</span>
                </span>
              </div>
              {s.note && <p className="mt-1.5 text-[13px] text-muted">{s.note}</p>}
              {s.detail?.missing_skills?.length > 0 && (
                <p className="mt-1.5 text-[12px] text-faint">Missing: {s.detail.missing_skills.join(", ")}</p>
              )}
            </li>
          ))}
        </ol>
      </div>

      {report && (
        <div className="rounded-xl border border-line p-4 text-sm">
          <p className="font-medium">AI summary <span className="font-normal text-muted">· average {Math.round(report.overall_score)}</span></p>
          <p className="mt-2 leading-relaxed text-muted">{report.summary}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><p className="text-xs font-medium text-ok">Strengths</p><ul className="mt-1 list-disc pl-4 text-[13px] text-muted">{report.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><p className="text-xs font-medium text-warn">Risks</p><ul className="mt-1 list-disc pl-4 text-[13px] text-muted">{report.risks.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Decision</p>
        <div className="flex flex-wrap gap-2">
          {[["shortlisted", "Shortlist"], ["submitted", "Send to hiring team"], ["hired", "Mark hired"], ["rejected", "Reject"]].map(([s, label]) => (
            <Button key={s} size="sm" variant={app.status === s ? "primary" : s === "rejected" ? "danger" : "secondary"}
              disabled={(!done && s !== "rejected") || app.status === s || app.status === "withdrawn"}
              loading={busy === s} onClick={() => patch({ status: s }, s)}>{label}</Button>
          ))}
        </div>
        {!done && app.status === "vetting" && <p className="mt-2 text-xs text-faint">Vetting is still running. You can reject now, or decide once it finishes.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label text="Internal note (admin team only)">
          <textarea className={cx(field, "min-h-24")} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="secondary" className="mt-2" loading={busy === "note"} onClick={() => patch({ admin_note: note }, "note")}>Save note</Button>
        </Label>
        <Label text="Message to the candidate (shown on their application)">
          <textarea className={cx(field, "min-h-24")} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <Button size="sm" variant="secondary" className="mt-2" loading={busy === "feedback"} onClick={() => patch({ feedback }, "feedback")}>Save message</Button>
        </Label>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </Card>
  );
}

function Candidates({ jobId, onBack, onEdit }) {
  const { data, error, loading, reload, setData } = useApi(`/api/admin/jobs/${jobId}/applications`);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("all");
  if (loading) return <PageLoader label="Loading candidates" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { job, applications } = data;
  const shown = applications.filter((a) => filter === "all" || (filter === "ready" ? a.status === "vetted"
    : filter === "progress" ? a.status === "vetting" : filter === "decided" ? ["shortlisted", "submitted", "hired"].includes(a.status)
      : ["not_selected", "rejected", "withdrawn"].includes(a.status)));
  const open = applications.find((a) => a.id === openId);
  const replace = (app) => setData({ ...data, applications: data.applications.map((a) => (a.id === app.id ? app : a)) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-1 flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" /> All jobs</button>
          <h2 className="text-lg font-semibold">{job.title}</h2>
          <p className="text-sm text-muted">{job.client_name || "No client set"} · {job.counts.total || 0} applicants · ranked by status, then score</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => onEdit(job)}><Pencil className="size-3.5" /> Edit job</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[["all", "All"], ["ready", "Vetted, awaiting decision"], ["progress", "In vetting"], ["decided", "Moved forward"], ["out", "Out"]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            className={cx("rounded-lg border px-3 py-1.5 text-xs font-medium transition", filter === id ? "border-brand bg-brand/10" : "border-line text-muted hover:text-text")}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="overflow-hidden self-start">
          {shown.length === 0 ? <p className="p-6 text-sm text-muted">No candidates here yet.</p> : (
            <ul className="divide-y divide-line">
              {shown.map((a, i) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setOpenId(a.id)}
                    className={cx("flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2", openId === a.id && "bg-brand/[0.06]")}>
                    <span className="w-6 text-xs text-faint">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.candidate.name}</p>
                      <p className="truncate text-[11px] text-muted">{a.candidate.profile?.headline || a.candidate.email} · {timeAgo(a.created_at)}</p>
                    </div>
                    <div className="flex gap-0.5">
                      {a.stages.map((s) => (
                        <span key={s.index} title={`${s.title}: ${s.status}`} className={cx("size-2 rounded-full",
                          s.status === "passed" ? "bg-ok" : s.status === "failed" ? "bg-bad" : s.status === "active" ? "bg-brand" : "bg-surface-3")} />
                      ))}
                    </div>
                    <ScoreChip value={a.score} />
                    <Badge tone={STATUS_TONE[a.status]}>{STATUS_TEXT[a.status]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {open ? <CandidateDetail key={open.id} app={open} onChange={replace} />
          : <Card className="p-8 text-center text-sm text-muted">Pick a candidate to see their profile, resume, stage results and the AI summary.</Card>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the tab

export default function JobsTab() {
  const { data, error, loading, reload, setData } = useApi("/api/admin/jobs");
  const [view, setView] = useState({ name: "list" });
  if (loading) return <PageLoader label="Loading jobs" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (view.name === "edit") {
    return (
      <JobEditor job={view.job} meta={data}
        onCancel={() => setView(view.job ? { name: "candidates", jobId: view.job.id } : { name: "list" })}
        onSaved={(job) => {
          const exists = data.jobs.some((j) => j.id === job.id);
          setData({ ...data, jobs: exists ? data.jobs.map((j) => (j.id === job.id ? { ...j, ...job } : j)) : [job, ...data.jobs] });
          setView({ name: "list" });
        }} />
    );
  }
  if (view.name === "candidates") {
    return <Candidates jobId={view.jobId} onBack={() => { reload(); setView({ name: "list" }); }}
      onEdit={(job) => setView({ name: "edit", job: data.jobs.find((j) => j.id === job.id) || job })} />;
  }

  const remove = async (job) => {
    if (!window.confirm(`Delete "${job.title}"? This can't be undone.`)) return;
    try {
      await api(`/api/admin/jobs/${job.id}`, { method: "DELETE" });
      setData({ ...data, jobs: data.jobs.filter((j) => j.id !== job.id) });
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><BriefcaseBusiness className="size-4 text-brand" /> Jobs</h2>
          <p className="text-sm text-muted">Post roles for companies hiring through Programming Haven. Open jobs appear on the home page and the public job board.</p>
        </div>
        <Button onClick={() => setView({ name: "edit", job: null })}><Plus className="size-4" /> Post a job</Button>
      </div>
      {data.jobs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">No jobs yet. Post the first one.</Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {data.jobs.map((j) => (
            <div key={j.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{j.title}</p>
                  <Badge tone={JOB_TONE[j.status]}>{j.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {j.client_name || "No client"}{j.show_client ? " (shown)" : j.client_name ? " (hidden)" : ""} · {j.seniority} · {j.pipeline.length} stages · posted {timeAgo(j.posted_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1"><Users className="size-3.5" /> {j.counts.total || 0}</span>
                {j.counts.vetted > 0 && <Badge tone="cyan">{j.counts.vetted} awaiting decision</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={() => setView({ name: "candidates", jobId: j.id })}>Candidates</Button>
                <Button size="sm" variant="secondary" onClick={() => setView({ name: "edit", job: j })} aria-label="Edit job"><Pencil className="size-3.5" /></Button>
                {!j.counts.total && <Button size="sm" variant="ghost" onClick={() => remove(j)} aria-label="Delete job"><Trash className="size-3.5" /></Button>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
