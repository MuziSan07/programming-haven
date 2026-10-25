"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Brain, Camera, Clock, Globe, Laptop, MessageSquare, Mic, MonitorUp, ShieldAlert, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { usePersona } from "@/lib/usePersona";
import Avatar from "@/components/Avatar";
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, cx, scoreColor } from "@/components/ui";

const KIND_ICON = { technical: Brain, "live-coding": Laptop, behavioral: MessageSquare, english: Globe, "system-design": Target };
const ROLES = ["Full Stack Developer", "Frontend Developer", "Backend Developer", "Mobile Developer",
  "AI / ML Engineer", "Data Scientist", "DevOps Engineer"];
const LEVELS = ["Junior", "Mid-level", "Senior"];

export default function InterviewSetupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, setUser } = useAuth();
  const { persona, personas } = usePersona();
  const kinds = useApi("/api/interviews/kinds");
  const history = useApi("/api/interviews");
  const banInfo = useApi("/api/interviews/ban");
  const ban = banInfo.data?.ban;
  const [kind, setKind] = useState(params.get("kind") || "technical");
  const [role, setRole] = useState(user?.target_role || ROLES[0]);
  const [level, setLevel] = useState("Mid-level");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  if (kinds.loading) return <PageLoader />;
  if (kinds.error) return <ErrorState error={kinds.error} onRetry={kinds.reload} />;

  async function start() {
    setStarting(true);
    setError("");
    try {
      const s = await api("/api/interviews", { body: { kind, role, level, persona_id: persona?.id } });
      router.push(`/interview/${s.id}`);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  }

  async function choosePersona(id) {
    try {
      setUser(await api("/api/auth/me", { method: "PATCH", body: { persona_id: id } }));
    } catch (err) {
      setError(err.message);
    }
  }

  const name = persona?.name || "your interviewer";
  const selectedKind = kinds.data.find((k) => k.id === kind);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="AI Interviews" title={`Interview with ${name}`}
        description="A voice-first AI interviewer that sees you, adapts to your answers and keeps a real hiring bar, then grades you like a panel at a top remote network." />

      {ban && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-bad/40 bg-bad/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-bad" />
          <div>
            <p className="font-semibold text-bad">AI interviews are locked</p>
            <p className="mt-1 text-text/80">{ban.reason}.</p>
            <p className="mt-1 text-text/80">
              {ban.permanent ? "This is a permanent lock after repeated violations. Contact support to restore access."
                : <>You can start a new interview after <span className="font-medium">{new Date(ban.ends_at).toLocaleString()}</span>. Each further violation locks you out for longer: 24 hours, 3 days, 1 week, 1 month, then permanently.</>}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {kinds.data.map((k) => {
              const Icon = KIND_ICON[k.id] || Mic;
              return (
                <button key={k.id} onClick={() => setKind(k.id)}
                  className={cx("card flex flex-col p-5 text-left transition",
                    kind === k.id ? "border-brand bg-brand/10 ring-2 ring-brand/30" : "hover:border-faint")}>
                  <div className="flex items-center justify-between">
                    <Icon className={cx("size-6", kind === k.id ? "text-brand" : "text-muted")} />
                    <span className="flex items-center gap-1 text-xs text-muted"><Clock className="size-3" />~{k.minutes} min</span>
                  </div>
                  <p className="mt-4 font-semibold">{k.title}</p>
                  <p className="mt-1 text-sm text-muted">{k.description}</p>
                  <p className="mt-3 flex items-center gap-2 text-xs text-faint">
                    {k.questions} questions
                    {k.mode === "live" && (
                      <span className="flex items-center gap-1 text-warn"><Camera className="size-3" /><Mic className="size-3" /><MonitorUp className="size-3" /> camera, mic & screen</span>
                    )}
                  </p>
                </button>
              );
            })}
          </div>

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="role">Role</label>
              <select id="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="level">Seniority</label>
              <select id="level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                {LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
          </Card>
        </div>

        <Card className="flex flex-col items-center p-6 text-center">
          <Avatar persona={persona} size={180} />
          <p className="mt-4 text-lg font-semibold">{name}</p>
          <p className="text-sm text-muted">{persona?.title || "AI Interviewer"}</p>
          {personas.length > 1 && (
            <div className="mt-3 flex gap-2">
              {personas.map((p) => (
                <button key={p.id} onClick={() => choosePersona(p.id)}
                  className={cx("rounded-full border px-3 py-1 text-xs", p.id === persona?.id ? "border-brand bg-brand/15 text-text" : "border-line text-muted hover:text-text")}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <ul className="mt-5 w-full space-y-2 text-left text-sm text-muted">
            <li className="flex gap-2"><Mic className="size-4 shrink-0 text-brand-2" /> Answer by voice or typing</li>
            <li className="flex gap-2"><Camera className="size-4 shrink-0 text-brand-2" /> Turn on your camera and {name} can see you</li>
            <li className="flex gap-2"><Brain className="size-4 shrink-0 text-brand-2" /> Adaptive follow-up questions</li>
            <li className="flex gap-2"><Target className="size-4 shrink-0 text-brand-2" /> Scored report with model answers</li>
          </ul>
          <Button size="lg" className="mt-6 w-full" onClick={start} loading={starting} disabled={Boolean(ban)}>
            Start interview <ArrowRight className="size-4" />
          </Button>
          {error && <p className="mt-3 text-sm text-bad">{error}</p>}
          <p className="mt-3 text-xs text-faint">
            {selectedKind?.mode === "live" ? "You'll be asked to turn on your camera and share your screen." : "Use headphones for the best experience."}
          </p>
        </Card>
      </div>

      {history.data?.length > 0 && (
        <Card className="mt-8 p-6">
          <h2 className="mb-4 font-semibold">Past interviews</h2>
          <ul className="divide-y divide-line">
            {history.data.map((s) => (
              <li key={s.id}>
                <Link href={`/interview/${s.id}`} className="flex items-center gap-3 py-3 text-sm hover:text-brand">
                  <span className="flex-1">{s.title} <span className="text-faint">· {s.role}</span></span>
                  {s.completed ? (
                    <>
                      <Badge tone={s.score >= 70 ? "ok" : s.score >= 50 ? "warn" : "bad"}>{s.verdict}</Badge>
                      <span className="w-14 text-right font-bold" style={{ color: scoreColor(s.score) }}>{s.score}/100</span>
                    </>
                  ) : <Badge>In progress</Badge>}
                  <span className="hidden w-24 text-right text-xs text-faint sm:block">{new Date(s.created_at).toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
