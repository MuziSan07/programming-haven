"use client";

import { useMemo, useState } from "react";
import {
  BookOpen, Brain, CircleCheck, Database, Download, Eye, EyeOff, LayoutDashboard, Plus, RotateCcw, Save, Search,
  Shield, ShieldCheck, Trash, TriangleAlert, Upload, Users, X,
} from "lucide-react";
import { API_URL, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import CodeEditor from "@/components/CodeEditor";
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, Spinner, cx } from "@/components/ui";

const KINDS = [
  { id: "track", label: "Tracks" }, { id: "lesson", label: "Lessons" }, { id: "problem", label: "DSA problems" },
  { id: "test", label: "Mock tests" }, { id: "question", label: "Questions" }, { id: "project", label: "Projects" },
  { id: "knowledge", label: "Knowledge base" }, { id: "persona", label: "Interviewers" },
];

// Starting points for "New item", matching backend/app/content/seed/SCHEMA.md
const TEMPLATES = {
  track: { id: "new-track", title: "New Track", icon: "📘", color: "#7c5cff", available: true,
    description: "One sentence.", units: [{ id: "new-u1", title: "Foundations", description: "Short", level: "Basic" }] },
  lesson: { id: "new-lesson", track_id: "python", unit_id: "py-u1", title: "New lesson", minutes: 5, steps: [
    { type: "concept", title: "Heading", body: "Explanation with `inline code`.", code: "print('hello')" },
    { type: "mcq", question: "Which is correct?", options: ["A", "B", "C", "D"], answer: 0, explanation: "Why A." },
    { type: "code", language: "python", prompt: "Print 42.", starter: "# your code\n", solution: "print(42)\n",
      expected_output: "42" }] },
  problem: { slug: "new-problem", title: "New Problem", difficulty: "Medium", pattern: "Arrays & Hashing",
    companies: [], description: "Describe the task. Use `backticks` for identifiers.",
    examples: [{ input: "nums = [1,2]", output: "3" }], constraints: ["1 <= nums.length <= 10^5"],
    function: { python: "solve", javascript: "solve" },
    starter: { python: "def solve(nums):\n    pass\n", javascript: "function solve(nums) {\n}\n" },
    compare: "exact", complexity: "O(n) time, O(1) space", hints: ["Nudge", "Technique", "Outline"],
    tests: [{ input: [[1, 2]], output: 3 }, { input: [[5]], output: 5 }, { input: [[0]], output: 0, hidden: true },
      { input: [[-1, 1]], output: 0, hidden: true }, { input: [[2, 2, 2]], output: 6, hidden: true }],
    solutions: { python: "def solve(nums):\n    return sum(nums)\n", javascript: "function solve(nums) {\n  return nums.reduce((a, b) => a + b, 0);\n}\n" } },
  test: { id: "new-test", title: "New Mock Test", style: "Company-style", difficulty: "Hard", description: "One or two sentences.",
    duration_minutes: 60, pass_mark: 70, languages: ["python", "javascript"],
    mcq: [{ id: "n1", question: "Question?", options: ["A", "B", "C", "D"], answer: 0, explanation: "Why." }],
    coding: ["two-sum"] },
  question: { id: "q-new-001", topic: "Python", level: "Intermediate", type: "mcq", question: "Question?",
    options: ["A", "B", "C", "D"], answer: 0, explanation: "Why.", tags: [], companies: [] },
  project: { id: "proj-new", title: "New Take-Home", niche: "Backend", level: "Intermediate", hours: 8,
    summary: "One sentence.", brief: "The scenario.\n\nMore detail.", requirements: ["Requirement"], stretch: [],
    deliverables: ["Public Git repo", "README"], tech: [], companies: [],
    rubric: [{ criterion: "Correctness", weight: 50, description: "..." }, { criterion: "Code quality", weight: 50, description: "..." }] },
  knowledge: { id: "kb-new-doc", title: "New knowledge doc", tags: [], content: "Plain text the AI interviewer can use." },
  persona: { id: "new-persona", name: "Name", gender: "female", title: "Engineering Manager", voice: "autumn",
    browser_voice: "female", personality: "Describe tone and style.",
    appearance: { skin: "#f1c7a3", hair: "#3b2416", hair_style: "long", outfit: "#7c5cff", accent: "#22d3ee", lips: "#c45a6a" } },
};

/** fetch wrapper that keeps structured 422 details ({errors: [...]}) which api() would flatten. */
async function adminRequest(path, { method = "GET", body } = {}) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    return { ok: false, errors: ["Can't reach the server."] };
  }
  const data = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data };
  const detail = data?.detail;
  const errors = Array.isArray(detail?.errors) ? detail.errors
    : typeof detail === "string" ? [detail]
      : Array.isArray(detail) ? detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`) : [`Request failed (${res.status})`];
  return { ok: false, status: res.status, errors };
}

function Stat({ label, value, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted">{label}<Icon className="size-4" /></div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value ?? "–"}</p>
    </Card>
  );
}

function Overview() {
  const { data, error, loading, reload } = useApi("/api/admin/stats");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={data.users} icon={Users} />
        <Stat label="DSA submissions" value={data.submissions} icon={Database} />
        <Stat label="Tests taken" value={data.tests_taken} icon={ShieldCheck} />
        <Stat label="Interviews" value={data.interviews} icon={Brain} />
        <Stat label="Questions answered" value={data.questions_answered} icon={CircleCheck} />
        <Stat label="Projects submitted" value={data.projects_submitted} icon={BookOpen} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Content library</h2>
          <ul className="divide-y divide-line">
            {KINDS.map((k) => (
              <li key={k.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted">{k.label}</span>
                <span className="font-semibold tabular-nums">{data.content[k.id] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Newest users</h2>
          {data.recent_users.length === 0 ? <p className="text-sm text-muted">No users yet.</p> : (
            <ul className="divide-y divide-line">
              {data.recent_users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand/20 text-xs font-bold text-brand">
                    {u.name[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted">{u.email}</span>
                  </span>
                  <span className="text-xs text-faint">{new Date(u.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ErrorList({ errors }) {
  if (!errors?.length) return null;
  return (
    <div className="max-h-48 overflow-y-auto rounded-xl border border-bad/30 bg-bad/5 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-bad"><TriangleAlert className="size-3.5" />
        {errors.length} problem{errors.length === 1 ? "" : "s"}</p>
      <ul className="space-y-1 font-mono text-[11px] text-bad">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}

function JsonEditor({ kind, item, onClose, onSaved }) {
  const isNew = !item.slug;
  const [text, setText] = useState(() => JSON.stringify(item.data, null, 2));
  const [published, setPublished] = useState(item.published ?? true);
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(null);

  function parse() {
    try {
      return JSON.parse(text);
    } catch (err) {
      setErrors([`Invalid JSON: ${err.message}`]);
      return null;
    }
  }

  async function run(action) {
    setErrors([]);
    setNotice("");
    if (action === "delete" && !window.confirm(item.source === "seed" ? "Unpublish this seed item?" : "Delete this item permanently?")) return;
    if (action === "reset" && !window.confirm("Replace your edits with the original seed version?")) return;
    const data = action === "validate" || action === "save" ? parse() : null;
    if ((action === "validate" || action === "save") && !data) return;
    setBusy(action);
    let r;
    if (action === "validate") r = await adminRequest(`/api/admin/validate/${kind}`, { method: "POST", body: { data, run_checks: true } });
    else if (action === "save") {
      r = await adminRequest(isNew ? `/api/admin/content/${kind}` : `/api/admin/content/${kind}/${encodeURIComponent(item.slug)}`,
        { method: isNew ? "POST" : "PUT", body: { data, published, run_checks: true } });
    } else if (action === "delete") r = await adminRequest(`/api/admin/content/${kind}/${encodeURIComponent(item.slug)}`, { method: "DELETE" });
    else if (action === "reset") r = await adminRequest(`/api/admin/content/${kind}/${encodeURIComponent(item.slug)}/reset`, { method: "POST" });
    setBusy(null);
    if (!r.ok) return setErrors(r.errors);
    if (action === "validate") {
      if (r.data.errors.length) setErrors(r.data.errors);
      else setNotice("Valid. All checks passed, including running the code.");
      return;
    }
    if (action === "reset") setText(JSON.stringify(r.data.data, null, 2));
    setNotice(action === "save" ? "Saved. Live for learners now." : action === "delete" ? "Done." : "Reset to seed.");
    onSaved(action === "delete" ? null : r.data);
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{isNew ? `New ${kind}` : item.title || item.slug}</p>
        {!isNew && <Badge tone={item.source === "admin" ? "brand" : "neutral"}>{item.source}</Badge>}
        <button onClick={() => setPublished(!published)}
          className={cx("flex items-center gap-1 rounded-lg px-2 py-1 text-xs", published ? "bg-ok/15 text-ok" : "bg-surface-3 text-muted")}>
          {published ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{published ? "Published" : "Hidden"}
        </button>
        <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close editor">
          <X className="size-4" />
        </button>
      </div>
      <div className="h-[55vh] min-h-80">
        <CodeEditor value={text} onChange={setText} language="json" />
      </div>
      <div className="space-y-3 border-t border-line p-4">
        <ErrorList errors={errors} />
        {notice && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck className="size-4" />{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => run("validate")} loading={busy === "validate"}>
            <ShieldCheck className="size-3.5" /> Validate & run code
          </Button>
          <Button size="sm" onClick={() => run("save")} loading={busy === "save"}><Save className="size-3.5" /> Save</Button>
          {!isNew && item.source === "admin" && (
            <Button size="sm" variant="ghost" onClick={() => run("reset")} loading={busy === "reset"}><RotateCcw className="size-3.5" /> Reset to seed</Button>
          )}
          {!isNew && (
            <Button size="sm" variant="danger" className="ml-auto" onClick={() => run("delete")} loading={busy === "delete"}>
              <Trash className="size-3.5" /> {item.source === "seed" ? "Unpublish" : "Delete"}
            </Button>
          )}
        </div>
        <p className="text-[11px] text-faint">Saving validates the item and runs its code (exercise and reference solutions). Seed items you edit become admin-owned and won&apos;t be overwritten by updates.</p>
      </div>
    </Card>
  );
}

function ImportDialog({ onClose, onDone }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  async function submit() {
    let bundle;
    try {
      bundle = JSON.parse(text);
    } catch (err) {
      return setResult({ saved: 0, errors: [`Invalid JSON: ${err.message}`] });
    }
    setBusy(true);
    const r = await adminRequest("/api/admin/import", { method: "POST", body: { bundle, run_checks: true } });
    setBusy(false);
    setResult(r.ok ? r.data : { saved: 0, errors: r.errors });
    if (r.ok && r.data.saved) onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-2xl animate-pop p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import a content bundle</h2>
          <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close"><X className="size-5" /></button>
        </div>
        <p className="mt-1 text-sm text-muted">
          A JSON object like {"{\"questions\": [...], \"problems\": [...]}"}. Existing ids are updated; every item is validated first.
        </p>
        <input type="file" accept=".json,application/json" onChange={onFile} className="mt-4 block text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-text" />
        <textarea className="input mt-3 min-h-56 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
          placeholder='{"questions": [ ... ]}' />
        {result && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-ok">{result.saved} item{result.saved === 1 ? "" : "s"} saved.</p>
            <ErrorList errors={result.errors} />
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={submit} loading={busy} disabled={!text.trim()}><Upload className="size-4" /> Import</Button>
        </div>
      </Card>
    </div>
  );
}

function ContentTab() {
  const [kind, setKind] = useState("question");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // { slug?, data, published, source, title }
  const [loadingItem, setLoadingItem] = useState(false);
  const [importing, setImporting] = useState(false);
  const list = useApi(`/api/admin/content?kind=${kind}`);

  const items = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return (list.data || []).filter((i) => !needle || i.slug.toLowerCase().includes(needle) || i.title.toLowerCase().includes(needle));
  }, [list.data, search]);

  async function open(slug) {
    setLoadingItem(true);
    const r = await adminRequest(`/api/admin/content/${kind}/${encodeURIComponent(slug)}`);
    setLoadingItem(false);
    if (r.ok) setEditing(r.data);
  }

  async function exportKind() {
    const r = await adminRequest(`/api/admin/export?kind=${kind}`);
    if (!r.ok) return;
    const blob = new Blob([JSON.stringify(r.data, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `haven-${kind}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => { setKind(k.id); setEditing(null); setSearch(""); }}
            className={cx("rounded-full px-3 py-1.5 text-xs font-medium transition",
              kind === k.id ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text")}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder={`Search ${kind}s by title or id…`} value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => setEditing({ data: structuredClone(TEMPLATES[kind]), published: true })}>
          <Plus className="size-3.5" /> New
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setImporting(true)}><Upload className="size-3.5" /> Import</Button>
        <Button size="sm" variant="secondary" onClick={exportKind}><Download className="size-3.5" /> Export</Button>
      </div>

      <div className={cx("grid gap-5", editing && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]")}>
        <Card className={cx("overflow-hidden", editing && "hidden xl:block")}>
          {list.loading ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
            <>
              <p className="border-b border-line px-4 py-2 text-xs text-muted">{items.length} item{items.length === 1 ? "" : "s"}</p>
              <ul className="max-h-[65vh] divide-y divide-line overflow-y-auto">
                {items.map((i) => (
                  <li key={i.slug}>
                    <button onClick={() => open(i.slug)}
                      className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-surface-2",
                        editing?.slug === i.slug && "bg-brand/10", !i.published && "opacity-50")}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{i.title || i.slug}</span>
                        <span className="block truncate font-mono text-[11px] text-faint">{i.slug}</span>
                      </span>
                      {(i.level || i.difficulty || i.topic || i.niche) && (
                        <span className="hidden shrink-0 text-xs text-muted sm:block">
                          {[i.topic || i.niche || i.pattern || i.track_id, i.level || i.difficulty].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <Badge tone={i.source === "admin" ? "brand" : "neutral"} className="shrink-0">{i.source}</Badge>
                      {!i.published && <EyeOff className="size-3.5 shrink-0 text-faint" />}
                    </button>
                  </li>
                ))}
                {items.length === 0 && <li className="p-8 text-center text-sm text-muted">Nothing here yet.</li>}
              </ul>
            </>
          )}
        </Card>
        {loadingItem && <div className="flex items-center justify-center p-8"><Spinner /></div>}
        {editing && !loadingItem && (
          <JsonEditor key={editing.slug || `new-${kind}`} kind={kind} item={editing} onClose={() => setEditing(null)}
            onSaved={(saved) => { list.reload(); if (saved) setEditing(saved); }} />
        )}
      </div>
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={list.reload} />}
    </div>
  );
}

function KnowledgeTab() {
  const list = useApi("/api/admin/content?kind=knowledge");
  const [form, setForm] = useState(null); // { slug?, id, title, tags, content, published }
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function open(slug) {
    const r = await adminRequest(`/api/admin/content/knowledge/${encodeURIComponent(slug)}`);
    if (r.ok) {
      const d = r.data.data;
      setForm({ slug, id: d.id, title: d.title, tags: (d.tags || []).join(", "), content: d.content, published: r.data.published,
        extra: d });
      setErrors([]);
      setNotice("");
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    setNotice("");
    const data = { ...(form.extra || {}), id: form.id.trim(), title: form.title.trim(), content: form.content,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    const r = await adminRequest(form.slug ? `/api/admin/content/knowledge/${encodeURIComponent(form.slug)}` : "/api/admin/content/knowledge",
      { method: form.slug ? "PUT" : "POST", body: { data, published: form.published } });
    setBusy(false);
    if (!r.ok) return setErrors(r.errors);
    setNotice("Saved. The interviewer uses this from the next conversation.");
    setForm((f) => ({ ...f, slug: data.id, extra: r.data.data }));
    list.reload();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">Interviewer knowledge</p>
          <Button size="sm" onClick={() => { setForm({ id: "kb-", title: "", tags: "", content: "", published: true }); setErrors([]); setNotice(""); }}>
            <Plus className="size-3.5" /> New doc
          </Button>
        </div>
        {list.loading ? <PageLoader /> : (
          <ul className="max-h-[65vh] divide-y divide-line overflow-y-auto">
            {(list.data || []).map((i) => (
              <li key={i.slug}>
                <button onClick={() => open(i.slug)}
                  className={cx("w-full px-4 py-3 text-left text-sm hover:bg-surface-2", form?.slug === i.slug && "bg-brand/10",
                    !i.published && "opacity-50")}>
                  <span className="block truncate font-medium">{i.title}</span>
                  <span className="block truncate font-mono text-[11px] text-faint">{i.slug}</span>
                </button>
              </li>
            ))}
            {list.data?.length === 0 && <li className="p-8 text-center text-sm text-muted">No knowledge docs yet.</li>}
          </ul>
        )}
      </Card>
      {form ? (
        <Card className="p-5">
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="kb-id">Id</label>
                <input id="kb-id" className="input font-mono" value={form.id} disabled={!!form.slug} required
                  onChange={(e) => setForm({ ...form, id: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="kb-tags">Tags (comma-separated)</label>
                <input id="kb-tags" className="input" value={form.tags} placeholder="behavioral, hinting"
                  onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="kb-title">Title</label>
              <input id="kb-title" className="input" value={form.title} required onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="kb-content">Content</label>
              <textarea id="kb-content" className="input min-h-72 resize-y leading-relaxed" value={form.content} required
                placeholder="Facts, rubrics, company processes, hinting analogies… written as plain text the interviewer can draw on."
                onChange={(e) => setForm({ ...form, content: e.target.value })} />
              <p className="mt-1 text-[11px] text-faint">{form.content.split(/\s+/).filter(Boolean).length} words · tags help the interviewer find this doc</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
              Published (used by the interviewer)
            </label>
            <ErrorList errors={errors} />
            {notice && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck className="size-4" />{notice}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>Close</Button>
              <Button type="submit" loading={busy}><Save className="size-4" /> Save doc</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
          <Brain className="size-10 text-brand" />
          <p className="font-semibold">Train your AI interviewer</p>
          <p className="max-w-sm text-sm text-muted">Knowledge docs are pulled into the interviewer&apos;s prompts: company processes,
            grading rubrics, hint analogies, dress-code guidance. Pick a doc or create a new one.</p>
        </Card>
      )}
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const { data, error, loading, reload, setData } = useApi("/api/admin/users");
  const [search, setSearch] = useState("");
  const [rowError, setRowError] = useState("");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function toggle(u) {
    setRowError("");
    const r = await adminRequest(`/api/admin/users/${u.id}`, { method: "PATCH", body: { is_admin: !u.is_admin } });
    if (!r.ok) return setRowError(r.errors.join(", "));
    setData((rows) => rows.map((x) => (x.id === u.id ? { ...x, is_admin: r.data.is_admin } : x)));
  }

  const needle = search.toLowerCase();
  const rows = data.filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-xs text-muted">{rows.length} of {data.length}</span>
      </div>
      {rowError && <p className="px-4 pt-3 text-sm text-bad">{rowError}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5">User</th><th className="px-4 py-2.5">Target role</th>
              <th className="px-4 py-2.5 text-right">XP</th><th className="px-4 py-2.5 text-right">Streak</th>
              <th className="px-4 py-2.5">Joined</th><th className="px-4 py-2.5 text-right">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5"><p className="font-medium">{u.name}</p><p className="text-xs text-muted">{u.email}</p></td>
                <td className="px-4 py-2.5 text-muted">{u.target_role}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{u.xp}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{u.streak}</td>
                <td className="px-4 py-2.5 text-xs text-faint">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => toggle(u)} disabled={u.id === me?.id}
                    className={cx("inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50",
                      u.is_admin ? "bg-brand/15 text-[#b4a3ff]" : "bg-surface-3 text-muted hover:text-text")}>
                    <Shield className="size-3.5" />{u.is_admin ? "Admin" : "Make admin"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "content", label: "Content", icon: Database },
  { id: "knowledge", label: "Interviewer knowledge", icon: Brain },
  { id: "users", label: "Users", icon: Users },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");

  if (!user?.is_admin) {
    return (
      <Card className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <Shield className="size-10 text-faint" />
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="text-sm text-muted">This area manages platform content. Ask an administrator for access if you need it.</p>
        <Button href="/dashboard" variant="secondary" size="sm">Back to dashboard</Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <PageHeader eyebrow="Admin" title="Content & platform console"
        description="Add lessons, questions, problems, mock tests, projects and interviewer knowledge without touching code. Everything is validated, and code is executed, before it goes live." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cx("flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
              tab === id ? "border-brand text-text" : "border-transparent text-muted hover:text-text")}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "content" && <ContentTab />}
      {tab === "knowledge" && <KnowledgeTab />}
      {tab === "users" && <UsersTab />}
    </div>
  );
}
