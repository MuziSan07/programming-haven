"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight, CircleCheck, ExternalLink, FileText, IdCard, Info, KeyRound, MapPin, OctagonAlert, Pencil, Star, Users,
  Wrench,
} from "lucide-react";
import { siGithub } from "simple-icons";
import { Badge, Card, Progress, Ring, Spinner, cx, scoreColor } from "@/components/ui";

export function GitHubMark({ className = "size-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" role="img" aria-label="GitHub">
      <path d={siGithub.path} />
    </svg>
  );
}

export const KIND_META = {
  cv: { label: "Resume", icon: FileText },
  linkedin: { label: "LinkedIn", icon: IdCard },
  github: { label: "GitHub", icon: GitHubMark },
};

const PRIORITY_TONE = { high: "bad", medium: "warn", low: "neutral" };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const LOADING_STEPS = {
  cv: ["Extracting text from your file", "Checking impact, structure and ATS keywords", "Comparing against the network's screen",
    "Rewriting your weakest lines"],
  linkedin: ["Reading your profile", "Checking headline, about and experience", "Comparing against the network's screen",
    "Rewriting your weakest lines"],
  github: ["Fetching your public repositories", "Reviewing READMEs, languages and activity",
    "Comparing against the network's screen", "Drafting fixes"],
};

/** Shown while the AI review runs (5-20 s). Mounted fresh for each review so its timer starts at zero. */
export function ReviewLoading({ kind }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const steps = LOADING_STEPS[kind] || LOADING_STEPS.cv;
  const current = Math.min(steps.length - 1, Math.floor(secs / 4));
  return (
    <Card className="flex min-h-96 flex-col items-center justify-center gap-6 p-8 text-center">
      <Spinner className="size-9" />
      <div>
        <p className="font-semibold">Reviewing like a senior recruiter would</p>
        <p className="mt-1 text-sm text-muted">This usually takes 5 to 20 seconds. <span className="tabular-nums text-faint">{secs}s</span></p>
      </div>
      <ol className="w-full max-w-sm space-y-2 text-left">
        {steps.map((s, i) => (
          <li key={s} className={cx("flex items-center gap-2.5 text-sm transition",
            i < current ? "text-muted" : i === current ? "text-text" : "text-faint")}>
            {i < current ? <CircleCheck className="size-4 shrink-0 text-ok" />
              : i === current ? <Spinner className="size-4 shrink-0" />
                : <span className="size-4 shrink-0 rounded-full border border-line" />}
            {s}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function GitHubSummary({ gh }) {
  const langs = Object.entries(gh.languages || {});
  const totalLang = langs.reduce((n, [, v]) => n + v, 0) || 1;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        {gh.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gh.avatar_url} alt="" className="size-14 shrink-0 rounded-full border border-line" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{gh.name || gh.html_url?.split("/").pop()}</p>
            {gh.html_url && (
              <a href={gh.html_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted hover:text-brand">
                Profile <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {gh.bio ? <p className="mt-0.5 text-sm text-muted">{gh.bio}</p> : <p className="mt-0.5 text-sm text-warn">No bio set</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
            {gh.location && <span className="flex items-center gap-1"><MapPin className="size-3" />{gh.location}</span>}
            <span className="flex items-center gap-1"><Users className="size-3" />{gh.followers ?? 0} followers</span>
            <span>{gh.own_repos} own repos · {gh.forks} forks</span>
          </div>
        </div>
      </div>
      {langs.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold text-faint uppercase">Languages (by repo count)</p>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
            {langs.map(([l, n], i) => (
              <span key={l} style={{ width: `${(100 * n) / totalLang}%`, background: `hsl(${(i * 47 + 250) % 360} 70% 62%)` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {langs.map(([l, n], i) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: `hsl(${(i * 47 + 250) % 360} 70% 62%)` }} />
                {l} <span className="text-faint">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {gh.repos?.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold text-faint uppercase">Top repositories</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {gh.repos.slice(0, 6).map((r) => (
              <li key={r.name} className="min-w-0 rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-faint"><Star className="size-3" />{r.stars ?? 0}</span>
                </div>
                <p className={cx("mt-1 line-clamp-2 text-xs", r.description ? "text-muted" : "text-warn")}>
                  {r.description || "No description"}
                </p>
                {r.language && <p className="mt-1.5 text-[11px] text-faint">{r.language}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Section({ icon: Icon, title, tone = "text-brand", children, className }) {
  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className={cx("size-4", tone)} /> {title}</h3>
      {children}
    </Card>
  );
}

export default function ReviewResult({ result, targetLabel }) {
  const kind = KIND_META[result.kind] || KIND_META.cv;
  const fixes = [...(result.fixes || [])].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));
  const KindIcon = kind.icon;

  return (
    <div className="flex animate-fade-up flex-col gap-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Ring value={result.score} size={140} color={scoreColor(result.score)} sublabel="Screen score" />
          <div className="w-full min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand"><KindIcon className="size-3" /> {kind.label}</Badge>
              <Badge>{targetLabel}</Badge>
              {result.ai === false && <Badge tone="warn">Quick check</Badge>}
            </div>
            <p className="mt-3 text-lg leading-snug font-semibold">{result.verdict}</p>
            <p className="mt-1 truncate text-xs text-faint">
              {result.source}{result.created_at && ` · ${new Date(result.created_at).toLocaleString()}`}
            </p>
          </div>
        </div>
        {result.sections?.length > 0 && (
          <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            {result.sections.map((s) => (
              <div key={s.name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{s.name}</span>
                  <span className="tabular-nums" style={{ color: scoreColor(s.score) }}>{s.score}</span>
                </div>
                <Progress value={s.score} className="h-1.5" color={scoreColor(s.score)} />
                {s.feedback && <p className="mt-1.5 text-xs text-muted">{s.feedback}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {result.github && <GitHubSummary gh={result.github} />}

      {result.red_flags?.length > 0 && (
        <Section icon={OctagonAlert} title="Red flags" tone="text-bad" className="border-bad/30">
          <ul className="space-y-2">
            {result.red_flags.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-bad" />{f}</li>
            ))}
          </ul>
        </Section>
      )}

      {fixes.length > 0 && (
        <Section icon={Wrench} title="Fixes, most important first">
          <ol className="divide-y divide-line">
            {fixes.map((f, i) => (
              <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={PRIORITY_TONE[f.priority] || "neutral"} className="capitalize">{f.priority}</Badge>
                    <p className="text-sm font-medium">{f.issue}</p>
                  </div>
                  {f.example && (
                    <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                      <span className="text-faint">Example: </span>{f.example}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {result.rewrites?.length > 0 && (
        <Section icon={Pencil} title="Before and after" tone="text-brand-2">
          <div className="space-y-3">
            {result.rewrites.map((r, i) => (
              <div key={i} className="grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="rounded-xl border border-bad/25 bg-bad/5 p-3">
                  <p className="mb-1 text-[11px] font-semibold text-bad uppercase">Before</p>
                  <p className="text-sm text-muted">{r.before}</p>
                </div>
                <ArrowRight className="hidden size-4 self-center text-faint md:block" />
                <div className="rounded-xl border border-ok/25 bg-ok/5 p-3">
                  <p className="mb-1 text-[11px] font-semibold text-ok uppercase">After</p>
                  <p className="text-sm">{r.after}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {result.strengths?.length > 0 && (
          <Section icon={CircleCheck} title="Strengths" tone="text-ok">
            <ul className="space-y-2">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-ok" />{s}</li>
              ))}
            </ul>
          </Section>
        )}
        {result.keywords_missing?.length > 0 && (
          <Section icon={KeyRound} title="Missing keywords" tone="text-warn">
            <div className="flex flex-wrap gap-1.5">
              {result.keywords_missing.map((k) => (
                <span key={k} className="rounded-md border border-warn/30 bg-warn/5 px-2 py-0.5 text-xs text-warn">{k}</span>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-faint">
              <Info className="mt-px size-3.5 shrink-0" /> Work these in only where they are true. Screeners check.
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}
