"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePersona } from "@/lib/usePersona";
import Avatar from "@/components/Avatar";
import { Button, Card, PageHeader, cx } from "@/components/ui";

const ROLES = [
  "Full Stack Developer", "Frontend Developer", "Backend Developer", "Mobile Developer",
  "AI / ML Engineer", "Data Scientist", "DevOps Engineer",
];

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const { persona, personas } = usePersona();
  const [form, setForm] = useState({ name: user.name, target_role: user.target_role, gender: user.gender || "unspecified" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(patch) {
    setSaving(true);
    setMessage("");
    try {
      setUser(await api("/api/auth/me", { method: "PATCH", body: patch }));
      setMessage("Saved");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-up">
      <PageHeader eyebrow="Settings" title="Your profile & interviewer" />

      <Card className="p-6">
        <h2 className="font-semibold">Choose your AI interviewer</h2>
        <p className="mt-1 text-sm text-muted">They run your interviews, coach you while you code and check your setup on camera.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {personas.map((p) => {
            const selected = p.id === persona?.id;
            return (
              <button key={p.id} onClick={() => save({ persona_id: p.id })} disabled={saving}
                className={cx("flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition",
                  selected ? "border-brand bg-brand/10" : "border-line hover:border-faint")}>
                <Avatar persona={p} size={96} state={selected ? "speaking" : "idle"} level={selected ? 0.3 : 0} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">{p.name} {selected && <Check className="size-4 text-brand" />}</p>
                  <p className="text-xs text-muted">{p.title}</p>
                  <p className="mt-2 line-clamp-3 text-xs text-faint">{p.personality}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-semibold">Profile</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(form); }}>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input opacity-60" value={user.email} disabled />
          </div>
          <div>
            <label className="label" htmlFor="role">Target role</label>
            <select id="role" className="input" value={form.target_role} onChange={(e) => setForm({ ...form, target_role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="gender">Gender</label>
            <select id="gender" className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="unspecified">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" loading={saving}>Save profile</Button>
            {message && <span className={cx("text-sm", message === "Saved" ? "text-ok" : "text-bad")}>{message}</span>}
          </div>
        </form>
      </Card>
    </div>
  );
}
