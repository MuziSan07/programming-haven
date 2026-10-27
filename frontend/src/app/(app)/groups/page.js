"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Globe, KeyRound, Lock, Plus, Target, Trophy, Users, X, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader } from "@/components/ui";

const HOW_IT_WORKS = [
  { icon: Users, title: "5 to 8 people, one target", text: "Everyone is preparing for the same screen, so the practice actually overlaps." },
  { icon: Zap, title: "A weekly AI challenge", text: "Every Monday the group gets the same set of problems and a debugging round." },
  { icon: Trophy, title: "A group leaderboard", text: "See who finished what, compare weekly XP and keep each other accountable." },
];

function GroupCard({ g, onJoin, joining }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand"><Target className="size-3" />{g.target_label}</Badge>
        {!g.is_public && <Badge><Lock className="size-3" /> Private</Badge>}
        {g.role === "owner" && <Badge tone="warn">Owner</Badge>}
      </div>
      <Link href={`/groups/${g.id}`} className="mt-3 text-base font-semibold hover:text-brand">{g.name}</Link>
      {g.description ? (
        <p className="mt-1 line-clamp-3 text-sm text-muted">{g.description}</p>
      ) : (
        <p className="mt-1 text-sm text-faint">No description yet.</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Users className="size-3.5" />
          <span className="font-medium text-text tabular-nums">{g.members}/{g.max_members}</span> members
        </span>
        {g.joined ? (
          <Button size="sm" variant="secondary" href={`/groups/${g.id}`}>Open <ArrowRight className="size-3.5" /></Button>
        ) : (
          <Button size="sm" onClick={() => onJoin(g.id)} loading={joining === g.id} disabled={Boolean(joining)}>Join</Button>
        )}
      </div>
    </Card>
  );
}

function CreateGroupForm({ targets, onCancel, onCreated }) {
  const [form, setForm] = useState({ name: "", target: targets[0]?.id || "", description: "", max_members: 8, is_public: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const g = await api("/api/groups", { body: { ...form, max_members: Number(form.max_members) } });
      onCreated(g);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Card className="mb-8 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Create a study group</h2>
        <button onClick={onCancel} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="g-name">Name</label>
          <input id="g-name" className="input" value={form.name} onChange={set("name")} minLength={3} maxLength={80} required
            placeholder="e.g. Toptal React sprint, October" />
        </div>
        <div>
          <label className="label" htmlFor="g-target">Target</label>
          <select id="g-target" className="input" value={form.target} onChange={set("target")}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="g-max">Max members</label>
          <select id="g-max" className="input" value={form.max_members} onChange={set("max_members")}>
            {[5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} people</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="g-desc">Description</label>
          <textarea id="g-desc" className="input min-h-20 resize-y" value={form.description} onChange={set("description")}
            maxLength={400} placeholder="What you're preparing for, your time zone and how often you meet." />
          <p className="mt-1 text-right text-[11px] text-faint">{form.description.length}/400</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2 p-3 sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={form.is_public} onChange={set("is_public")} />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              {form.is_public ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
              {form.is_public ? "Public group" : "Private group"}
            </span>
            <span className="text-muted">
              {form.is_public ? "Listed under open groups so anyone with the same goal can join."
                : "Hidden from the list. People join with your invite code only."}
            </span>
          </span>
        </label>
        {error && <p className="text-sm text-bad sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!form.name.trim() || !form.target}>Create group</Button>
        </div>
      </form>
    </Card>
  );
}

export default function GroupsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi("/api/groups");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(null);
  const [joinError, setJoinError] = useState("");
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState("");

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function join(id) {
    setJoining(id);
    setJoinError("");
    try {
      await api(`/api/groups/${id}/join`, { method: "POST" });
      router.push(`/groups/${id}`);
    } catch (err) {
      setJoinError(err.message);
      setJoining(null);
    }
  }

  async function joinWithCode(e) {
    e.preventDefault();
    setCodeBusy(true);
    setCodeError("");
    try {
      const g = await api("/api/groups/join-code", { body: { code: code.trim() } });
      router.push(`/groups/${g.id}`);
    } catch (err) {
      setCodeError(err.message);
      setCodeBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Study groups" title="Prepare together, not alone"
        description="Small accountability groups for people chasing the same screen. Solve the weekly challenge, compare progress and talk through solutions."
        actions={!creating && <Button onClick={() => setCreating(true)}><Plus className="size-4" /> Create group</Button>} />

      {creating && (
        <CreateGroupForm targets={data.targets} onCancel={() => setCreating(false)}
          onCreated={(g) => router.push(`/groups/${g.id}`)} />
      )}

      <div className="mb-10 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
          {HOW_IT_WORKS.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand/15 text-brand"><Icon className="size-4.5" /></span>
              <p className="mt-3 text-sm font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </Card>
        <Card className="p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-brand-2" /> Join with invite code</p>
          <p className="mt-1 text-xs text-muted">Got a code from a friend? Private groups can only be joined this way.</p>
          <form onSubmit={joinWithCode} className="mt-4 flex gap-2">
            <input className="input font-mono tracking-widest uppercase" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="A1B2C3D4" maxLength={16} aria-label="Invite code" />
            <Button type="submit" loading={codeBusy} disabled={code.trim().length < 4}>Join</Button>
          </form>
          {codeError && <p className="mt-2 text-xs text-bad">{codeError}</p>}
        </Card>
      </div>

      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">My groups <Badge>{data.mine.length}</Badge></h2>
        {data.mine.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <Users className="size-8 text-faint" />
            <p className="font-medium">You&apos;re not in a group yet</p>
            <p className="max-w-md text-sm text-muted">Join an open group below or create your own and invite friends with the code.</p>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.mine.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">Open groups <Badge tone="ok">{data.open.length}</Badge></h2>
        {joinError && <p className="mb-3 text-sm text-bad">{joinError}</p>}
        {data.open.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <Globe className="size-8 text-faint" />
            <p className="font-medium">No open groups with free seats</p>
            <p className="max-w-md text-sm text-muted">Be the first: create a public group for your target and others will find it here.</p>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.open.map((g) => <GroupCard key={g.id} g={g} onJoin={join} joining={joining} />)}
          </div>
        )}
      </section>
    </div>
  );
}
