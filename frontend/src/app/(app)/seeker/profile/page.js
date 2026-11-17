"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { CircleCheck, FileText, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, cx } from "@/components/ui";

const ROLES = ["Full Stack Developer", "Frontend Developer", "Backend Developer", "Mobile Developer", "Data Scientist",
  "AI Engineer", "DevOps Engineer", "Data Engineer", "QA Engineer"];
const ENGLISH = ["Basic", "Conversational", "Fluent", "Native"];
const AVAILABILITY = ["Immediately", "In 2 weeks", "In a month", "Over a month"];
const field = "h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none transition focus:border-brand";

function Field({ label, hint, children, className }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

function ResumeCard({ profile, onUploaded }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      onUploaded(await api("/api/seeker/resume", { form }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const view = async () => {
    const res = await api("/api/seeker/resume", { raw: true });
    window.open(URL.createObjectURL(await res.blob()), "_blank", "noopener");
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Resume</h2>
        {profile.resume && <Badge tone="ok"><CircleCheck className="size-3" /> Uploaded</Badge>}
      </div>
      {profile.resume ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
          <FileText className="size-5 shrink-0 text-brand-2" />
          <div className="min-w-0 flex-1">
            <button type="button" onClick={view} className="block truncate text-left text-sm font-medium hover:text-brand">{profile.resume.name}</button>
            <p className="text-[11px] text-faint">Uploaded {new Date(profile.resume.uploaded_at).toLocaleDateString()}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Upload your resume as a PDF or Word file. Our AI reads it during the resume screen.</p>
      )}
      <input ref={input} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <Button variant={profile.resume ? "secondary" : "primary"} className="mt-4" loading={busy} onClick={() => input.current?.click()}>
        <Upload className="size-4" /> {profile.resume ? "Replace resume" : "Upload resume"}
      </Button>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      <p className="mt-3 text-[11px] text-faint">PDF, DOCX or TXT, up to 5 MB. Use a text-based file, not a scanned image.</p>
    </Card>
  );
}

function ProfileForm({ initial, onSaved, next }) {
  const router = useRouter();
  const [form, setForm] = useState(() => ({ ...initial, skills_text: (initial.skills || []).join(", "),
    years_experience: initial.years_experience ?? "", links: { github: "", linkedin: "", portfolio: "", ...initial.links } }));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => { setSaved(false); setForm({ ...form, [k]: e.target.value }); };
  const setLink = (k) => (e) => { setSaved(false); setForm({ ...form, links: { ...form.links, [k]: e.target.value } }); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { skills_text: skillsText, resume, complete, missing, ...rest } = form;
      void resume; void complete; void missing;
      const body = { ...rest, skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean),
        years_experience: form.years_experience === "" ? null : Number(form.years_experience) };
      const res = await api("/api/seeker/profile", { method: "PUT", body });
      onSaved(res);
      setSaved(true);
      if (next && res.complete) router.push(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Headline" className="sm:col-span-2" hint="One line, e.g. Backend engineer, 6 years with Python and AWS">
            <input value={form.headline} onChange={set("headline")} maxLength={160} className={field} required />
          </Field>
          <Field label="Primary role">
            <select value={form.primary_role} onChange={set("primary_role")} className={field} required>
              <option value="">Choose a role</option>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Years of professional experience">
            <input type="number" min={0} max={50} value={form.years_experience} onChange={set("years_experience")} className={field} required />
          </Field>
          <Field label="Skills" className="sm:col-span-2" hint="Comma separated, most important first">
            <input value={form.skills_text} onChange={set("skills_text")} className={field} placeholder="Python, FastAPI, PostgreSQL, AWS" required />
          </Field>
          <Field label="English level">
            <select value={form.english_level} onChange={set("english_level")} className={field}>
              <option value="">Choose a level</option>
              {ENGLISH.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Availability">
            <select value={form.availability} onChange={set("availability")} className={field}>
              <option value="">Choose</option>
              {AVAILABILITY.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Location"><input value={form.location} onChange={set("location")} maxLength={120} className={field} placeholder="City, country" /></Field>
          <Field label="Time zone"><input value={form.timezone} onChange={set("timezone")} maxLength={60} className={field} placeholder="e.g. UTC+5" /></Field>
          <Field label="Expected rate or salary"><input value={form.expected_rate} onChange={set("expected_rate")} maxLength={80} className={field} placeholder="e.g. $40/hour" /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set("phone")} maxLength={40} className={field} /></Field>
          <Field label="GitHub"><input value={form.links.github} onChange={setLink("github")} maxLength={200} className={field} placeholder="https://github.com/…" /></Field>
          <Field label="LinkedIn"><input value={form.links.linkedin} onChange={setLink("linkedin")} maxLength={200} className={field} placeholder="https://linkedin.com/in/…" /></Field>
          <Field label="Portfolio" className="sm:col-span-2"><input value={form.links.portfolio} onChange={setLink("portfolio")} maxLength={200} className={field} /></Field>
          <Field label="About you" className="sm:col-span-2" hint="A short summary of what you've built and what you're looking for">
            <textarea value={form.summary} onChange={set("summary")} rows={5} maxLength={3000}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand" />
          </Field>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" loading={busy}>Save profile</Button>
          {saved && <span className="text-sm text-ok">Saved</span>}
        </div>
      </form>
    </Card>
  );
}

export default function SeekerProfilePage() {
  const next = useSearchParams().get("next");
  const safeNext = next && next.startsWith("/") ? next : null;
  const { data, error, loading, reload, setData } = useApi("/api/seeker/profile");
  if (loading) return <PageLoader label="Loading your profile" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader eyebrow="Job Seeker" title="Profile & resume"
        description="This is what the hiring team sees, together with your vetting results. Keep it honest and specific."
        actions={data.complete
          ? <Badge tone="ok"><CircleCheck className="size-3" /> Ready to apply</Badge>
          : <Badge tone="warn">Missing: {data.missing.join(", ")}</Badge>} />
      {safeNext && data.complete && (
        <Card className="mb-6 flex items-center justify-between gap-3 border-ok/30 bg-ok/[0.05] p-4">
          <p className="text-sm">Your profile is complete. Head back to finish your application.</p>
          <Button href={safeNext} size="sm">Continue</Button>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <ProfileForm initial={data} next={safeNext} onSaved={(p) => setData(p)} />
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ResumeCard profile={data} onUploaded={(p) => setData(p)} />
        </div>
      </div>
    </div>
  );
}
