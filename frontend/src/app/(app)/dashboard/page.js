"use client";

import Link from "next/link";
import {
  ArrowRight, BookOpen, CircleCheck, CircleX, ClipboardCheck, Clock, Code, Flame, Map, Mic, Trophy, Zap,
} from "lucide-react";
import { humanDuration } from "@/lib/useActiveTime";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, DIFFICULTY_TONE, ErrorState, PageLoader, Progress, Ring } from "@/components/ui";

const ACTIVITY_ICON = { submission: Code, test: ClipboardCheck, interview: Mic };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Stat({ icon: Icon, label, value, sub, color }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <Icon className="size-4" style={{ color }} />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
    </Card>
  );
}

const AREA_LABEL = { learn: "Lessons", dsa: "DSA", test: "Tests", interview: "Interviews", project: "Projects",
  questions: "Questions", mirror: "Mirror" };

function TimeCard({ time }) {
  const days = Object.entries(time.by_day);
  const max = Math.max(60, ...days.map(([, v]) => v));
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-brand-2" /> Focused practice time</h2>
        <span className="text-xs text-faint">Pauses when you switch tabs</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[["Today", time.today_seconds], ["This week", time.week_seconds], ["All time", time.total_seconds]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 py-3">
            <p className="text-xl font-bold tabular-nums">{humanDuration(v)}</p>
            <p className="text-[11px] text-muted">{k}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-24 items-end gap-2">
        {days.map(([day, v]) => (
          <div key={day} className="flex flex-1 flex-col items-center gap-1" title={`${day}: ${humanDuration(v)}`}>
            <div className="w-full rounded-t-md bg-brand/70" style={{ height: `${Math.max(4, (v / max) * 72)}px` }} />
            <span className="text-[10px] text-faint">{new Date(day + "T00:00").toLocaleDateString(undefined, { weekday: "narrow" })}</span>
          </div>
        ))}
      </div>
      {Object.keys(time.by_area).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          {Object.entries(time.by_area).sort((a, b) => b[1] - a[1]).map(([area, v]) => (
            <span key={area} className="rounded-full bg-surface-2 px-2.5 py-1">{AREA_LABEL[area] || area}: {humanDuration(v)}</span>
          ))}
        </div>
      )}
    </Card>
  );
}

function ContinueCard({ href, icon: Icon, color, eyebrow, title, meta }) {
  return (
    <Link href={href} className="card group flex items-center gap-4 p-5 transition hover:border-brand/50">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}22`,
        color }}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{eyebrow}</p>
        <p className="truncate font-semibold">{title}</p>
        {meta}
      </div>
      <ArrowRight className="size-4 text-faint transition group-hover:translate-x-1 group-hover:text-brand" />
    </Link>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi("/api/dashboard");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { user, readiness, next_lesson: lesson, next_problem: problem, activity, time } = data;
  const s = readiness.stats;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <div className="mb-8">
        <p className="text-sm text-muted">{greeting()},</p>
        <h1 className="text-3xl font-bold tracking-tight">{user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted">Training for <span className="text-text">{user.target_role}</span> roles</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="relative overflow-hidden p-6 lg:col-span-2">
          <div className="relative flex flex-col items-center gap-8 sm:flex-row">
            <Ring value={readiness.score} size={170} sublabel="Readiness" />
            <div className="w-full flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Readiness Score</h2>
                <Badge tone={readiness.score >= 80 ? "ok" : readiness.score >= 30 ? "brand" : "neutral"}>
                  {readiness.verdict}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">How prepared you are for a real screening pipeline.</p>
              <div className="mt-5 flex flex-col gap-3">
                {readiness.breakdown.map((b) => (
                  <div key={b.key}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted">{b.label} <span className="text-faint">· {b.weight}%</span></span>
                      <span className="font-medium tabular-nums">{b.value}%</span>
                    </div>
                    <Progress value={b.value} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-5">
          <Stat icon={Zap} label="Total XP" value={user.xp} sub={`Level ${user.level}`} color="#7c5cff" />
          <Stat icon={Flame} label="Day streak" value={user.streak} sub="Keep it alive!" color="#f59e0b" />
          <Stat icon={Code} label="Problems solved" value={`${s.problems_solved}/${s.problems_total}`} color="#22c55e" />
          <Stat icon={Mic} label="Interviews" value={s.interviews_completed} sub={`${s.tests_taken} tests taken`}
            color="#ec4899" />
        </div>
      </div>

      {time && <div className="mt-5"><TimeCard time={time} /></div>}

      <h2 className="mt-10 mb-4 text-lg font-semibold">Continue training</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {lesson ? (
          <ContinueCard href={`/learn/lesson/${lesson.id}`} icon={BookOpen} color="#3b82f6"
            eyebrow={`${lesson.path} · ${lesson.unit}`} title={lesson.title} />
        ) : (
          <ContinueCard href="/learn" icon={Trophy} color="#3b82f6" eyebrow="Language Paths" title="All lessons done!" />
        )}
        {problem ? (
          <ContinueCard href={`/dsa/${problem.slug}`} icon={Code} color="#22c55e" eyebrow={problem.pattern}
            title={problem.title}
            meta={<Badge tone={DIFFICULTY_TONE[problem.difficulty]} className="mt-1">{problem.difficulty}</Badge>} />
        ) : (
          <ContinueCard href="/dsa" icon={Trophy} color="#22c55e" eyebrow="DSA Track" title="Every problem solved!" />
        )}
        <ContinueCard href="/interview" icon={Mic} color="#ec4899" eyebrow="AI Interview" title="Practise with Alex" />
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Recent activity</h2>
          {activity.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted">No activity yet. Your first lesson takes 4 minutes.</p>
              <Button href="/learn" size="sm">Start learning</Button>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a, i) => {
                const Icon = ACTIVITY_ICON[a.type];
                const row = (
                  <>
                    <Icon className="size-4 text-muted" />
                    <span className="flex-1 truncate text-sm">{a.title}</span>
                    <span className={`flex items-center gap-1 text-xs font-medium ${a.good ? "text-ok" : "text-warn"}`}>
                      {a.good ? <CircleCheck className="size-3.5" /> : <CircleX className="size-3.5" />}
                      {a.detail}
                    </span>
                    <span className="hidden w-24 text-right text-xs text-faint sm:block">
                      {new Date(a.at).toLocaleDateString()}
                    </span>
                  </>
                );
                return (
                  <li key={i}>
                    {a.href ? (
                      <Link href={a.href} className="flex items-center gap-3 py-3 hover:text-brand">{row}</Link>
                    ) : (
                      <div className="flex items-center gap-3 py-3">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col p-6">
          <Map className="size-6 text-brand" />
          <h2 className="mt-3 font-semibold">Target a company</h2>
          <p className="mt-1 flex-1 text-sm text-muted">
            Follow a step-by-step path built around how Toptal, Turing, Lemon.io and others screen developers.
          </p>
          <Button href="/paths" variant="secondary" className="mt-5">
            Explore company paths <ArrowRight className="size-4" />
          </Button>
        </Card>
      </div>
    </div>
  );
}
