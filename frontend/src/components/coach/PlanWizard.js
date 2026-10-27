"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Compass, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import TechLogo from "@/components/TechLogo";
import { Button, Card, cx } from "@/components/ui";
import { LANGUAGES, ROLES } from "./meta";

const STEPS = ["Target", "Role & language", "Schedule"];

function StepBar({ step }) {
  return (
    <ol className="mb-6 flex items-center gap-2">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            i < step ? "bg-ok/20 text-ok" : i === step ? "bg-brand text-white" : "bg-surface-3 text-faint")}>
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cx("hidden text-xs font-medium sm:block", i === step ? "text-text" : "text-muted")}>{label}</span>
          {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
        </li>
      ))}
    </ol>
  );
}

function Slider({ id, label, value, min, max, unit, onChange, hint }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label" htmlFor={id}>{label}</label>
        <span className="text-lg font-bold tabular-nums">{value} <span className="text-xs font-normal text-muted">{unit}</span></span>
      </div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#7c5cff]" />
      <div className="mt-1 flex justify-between text-[11px] text-faint"><span>{min}</span>{hint && <span>{hint}</span>}<span>{max}</span></div>
    </div>
  );
}

export default function PlanWizard({ targets, onboarding, onCreated }) {
  const { user, setUser } = useAuth();
  const initialRole = user?.target_role || ROLES[0];
  const roles = ROLES.includes(initialRole) ? ROLES : [initialRole, ...ROLES];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ target: "", target_role: initialRole, language: "python", weeks: 6, hours_per_week: 10 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const chosen = targets.find((t) => t.id === form.target);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await api("/api/coach/plan", { body: form });
      if (user && user.target_role !== form.target_role) setUser({ ...user, target_role: form.target_role });
      onCreated(res.plan);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const daily = Math.round((form.hours_per_week * 60) / 6);
  const intensity = form.hours_per_week >= 25 ? "Intensive" : form.hours_per_week >= 12 ? "Steady" : "Light";

  return (
    <div className="mx-auto max-w-4xl animate-fade-up">
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold tracking-widest text-brand uppercase">Career Coach</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {onboarding ? `Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Let's build your plan.` : "Build your study plan"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {onboarding
            ? "Answer three quick questions and your coach turns them into a day-by-day plan for the network you are aiming at. It adjusts every week from your real results."
            : "Pick where you are applying and how much time you have. The coach schedules problems, questions, mock interviews and tests around that pipeline, and re-plans weekly from your results."}
        </p>
      </div>

      <Card className="p-5 sm:p-7">
        <StepBar step={step} />

        {step === 0 && (
          <div className="animate-fade-up">
            <h2 className="flex items-center gap-2 font-semibold"><Target className="size-4 text-brand" /> Where are you applying?</h2>
            <p className="mt-1 text-sm text-muted">Each network screens differently. The plan mirrors its pipeline.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((t) => {
                const active = form.target === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => set("target", t.id)}
                    className={cx("relative flex flex-col rounded-2xl border p-4 text-left transition",
                      active ? "border-brand bg-brand/10 ring-2 ring-brand/30" : "border-line bg-surface-2 hover:border-faint")}>
                    {active && <CircleCheck className="absolute top-3 right-3 size-4 text-brand" />}
                    <span className="pr-6 font-semibold">{t.label}</span>
                    <ol className="mt-3 space-y-1.5">
                      {t.pipeline.map((p, i) => (
                        <li key={p} className="flex items-start gap-2 text-xs text-muted">
                          <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] text-faint">{i + 1}</span>
                          {p}
                        </li>
                      ))}
                    </ol>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-up space-y-6">
            <div>
              <label className="label" htmlFor="role">Target role</label>
              <select id="role" className="input" value={form.target_role} onChange={(e) => set("target_role", e.target.value)}>
                {roles.map((r) => <option key={r}>{r}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-faint">Decides which question topics and interview styles get priority.</p>
            </div>
            <div>
              <p className="label">Language for coding rounds</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LANGUAGES.map((l) => (
                  <button key={l.id} type="button" onClick={() => set("language", l.id)}
                    className={cx("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                      form.language === l.id ? "border-brand bg-brand/10" : "border-line bg-surface-2 hover:border-faint")}>
                    <TechLogo slug={l.id} size={30} />
                    <span className="font-medium">{l.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-up">
            <div className="grid gap-6 sm:grid-cols-2">
              <Slider id="weeks" label="Plan length" value={form.weeks} min={2} max={16} unit="weeks"
                onChange={(v) => set("weeks", v)} hint="6 is typical" />
              <Slider id="hours" label="Study time" value={form.hours_per_week} min={3} max={50} unit="h / week"
                onChange={(v) => set("hours_per_week", v)} hint={intensity} />
            </div>
            <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold"><Compass className="size-4 text-brand-2" /> Your plan</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[["Target", chosen?.label || "-"], ["Role", form.target_role],
                  ["Total", `${form.weeks * form.hours_per_week} hours`], ["Per study day", `about ${daily} min`]].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-faint">{k}</dt>
                    <dd className="truncate font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted">Six study days a week plus a light review day. Early weeks build foundations; later weeks are full mock pipelines.</p>
            </div>
          </div>
        )}

        {error && <p className="mt-5 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft className="size-4" /> Back</Button>
          ) : <span />}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !form.target}>
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} loading={busy}>
              {busy ? "Building your plan" : <>Build my plan <ArrowRight className="size-4" /></>}
            </Button>
          )}
        </div>
        {busy && <p className="mt-3 text-right text-xs text-faint">Analysing your progress and scheduling every day. This takes a few seconds.</p>}
      </Card>
    </div>
  );
}
