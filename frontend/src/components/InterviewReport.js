"use client";

import { useState } from "react";
import {
  ArrowRight, Bug, Check, ChevronRight, CirclePlay, FileText, Flame, Gauge, MessagesSquare, RotateCcw, Star, TrendingUp,
  Trophy, UsersRound,
} from "lucide-react";
import { Badge, Button, Card, Progress, Ring, cx, scoreColor } from "./ui";

const VERDICT_TONE = { "Strong pass": "ok", "Likely to pass": "ok", Borderline: "warn", "Needs work": "bad" };

function label(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function InterviewReport({ session }) {
  const f = session.feedback;
  const [open, setOpen] = useState(0);
  const speakerNames = Object.fromEntries((session.panel || []).map((p) => [p.id, p.name]));
  const answered = session.transcript.some((t) => t.role === "candidate");

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      {f.terminated && (
        <div className="mb-6 rounded-2xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          <p className="font-semibold">This interview was terminated for an integrity violation.</p>
          <p className="mt-1 text-bad/80">{f.summary}</p>
        </div>
      )}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-widest text-brand uppercase">Interview report</p>
          <h1 className="mt-1 text-3xl font-bold">{session.title}</h1>
          <p className="mt-1 text-sm text-muted">{session.level} {session.role} · with {session.interviewer}</p>
          {(session.stress || session.mode === "panel" || session.mode === "pair") && (
            <div className="mt-2 flex flex-wrap gap-2">
              {session.stress && <Badge tone="bad"><Flame className="size-3" /> Stress mode</Badge>}
              {session.mode === "panel" && <Badge tone="cyan"><UsersRound className="size-3" /> Panel interview</Badge>}
              {session.mode === "pair" && f.round && <Badge tone="cyan"><Bug className="size-3" /> {f.round.title}</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {answered && (
            <Button href={`/interview/${session.id}/replay`}><CirclePlay className="size-4" /> Watch replay</Button>
          )}
          <Button href={`/interview?kind=${session.kind}`} variant="secondary"><RotateCcw className="size-4" /> Practise again</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col items-center p-6 text-center">
          <Ring value={f.overall_score} size={160} color={scoreColor(f.overall_score)} sublabel="out of 100" />
          <Badge tone={VERDICT_TONE[f.verdict] || "neutral"} className="mt-4 text-sm">
            <Trophy className="size-3.5" /> {f.verdict}
          </Badge>
          {f.ai === false && <p className="mt-3 text-xs text-warn">Estimated offline. Connect AI for full grading.</p>}
        </Card>
        <Card className="p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold"><FileText className="size-4 text-brand" /> Panel summary</h2>
          <p className="mt-2 text-sm leading-relaxed text-text/90">{f.summary}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {Object.entries(f.scores || {}).map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">{label(k)}</span>
                  <span className="font-semibold tabular-nums">{v}</span>
                </div>
                <Progress value={v} color={scoreColor(v)} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {(f.composure != null || f.bug_found != null) && (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {f.bug_found != null && (
            <Card className={cx("p-6", f.composure == null && "md:col-span-2")}>
              <h2 className="flex items-center gap-2 font-semibold"><Bug className="size-4 text-brand" /> Pair programming result</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Badge tone={f.bug_found ? "ok" : "bad"} className="text-sm">{f.bug_found ? "Bug found and fixed" : "Bug not fixed"}</Badge>
                {f.tests && <span className="text-sm text-muted">{f.tests.passed}/{f.tests.total} tests passing at the end</span>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {["collaboration", "communication"].map((k) => f.scores?.[k] != null && (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted">{label(k)}</span>
                      <span className="font-semibold tabular-nums">{f.scores[k]}</span>
                    </div>
                    <Progress value={f.scores[k]} color={scoreColor(f.scores[k])} />
                  </div>
                ))}
              </div>
              {f.bug_found && f.explanation && <p className="mt-4 text-sm leading-relaxed text-text/85">{f.explanation}</p>}
            </Card>
          )}
          {f.composure != null && (
            <Card className={cx("flex items-center gap-5 p-6", f.bug_found == null && "md:col-span-2")}>
              <Ring value={f.composure} size={96} stroke={8} color={scoreColor(f.composure)} />
              <div>
                <h2 className="flex items-center gap-2 font-semibold"><Gauge className="size-4 text-bad" /> Composure under pressure</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-text/90">{f.composure_note}</p>
              </div>
            </Card>
          )}
        </div>
      )}

      {(f.technical_view || f.hr_view) && (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {[[f.technical_view, session.panel?.[0], "Technical view"], [f.hr_view, session.panel?.[1], "Behavioural view"]].map(([text, p, title]) => text && (
            <Card key={title} className="p-6">
              <h2 className="flex items-center gap-2 font-semibold"><MessagesSquare className="size-4 text-brand-2" /> {title}</h2>
              <p className="mt-0.5 text-xs text-faint">{p ? `${p.name}, ${p.title}` : "Panelist"}</p>
              <p className="mt-2 text-sm leading-relaxed text-text/90">{text}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-semibold text-ok"><Star className="size-4" /> Strengths</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {f.strengths?.map((s) => <li key={s} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ok" />{s}</li>)}
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-semibold text-warn"><TrendingUp className="size-4" /> How to improve</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {f.improvements?.map((s) => <li key={s} className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-warn" />{s}</li>)}
          </ul>
        </Card>
      </div>

      {f.question_feedback?.length > 0 && (
        <Card className="mt-5 p-6">
          <h2 className="mb-4 font-semibold">Question by question</h2>
          <div className="space-y-2">
            {f.question_feedback.map((q, i) => (
              <div key={i} className="rounded-xl border border-line">
                <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center gap-3 p-4 text-left">
                  <ChevronRight className={cx("size-4 shrink-0 text-muted transition", open === i && "rotate-90")} />
                  <span className="flex-1 text-sm font-medium">{q.question}</span>
                  <span className="flex shrink-0 gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cx("size-3.5", n <= q.rating ? "fill-warn text-warn" : "text-faint")} />
                    ))}
                  </span>
                </button>
                {open === i && (
                  <div className="space-y-3 border-t border-line p-4 text-sm">
                    <p className="text-text/90">{q.comment}</p>
                    {q.better_answer && (
                      <div className="rounded-xl bg-brand/10 p-3">
                        <p className="mb-1 text-xs font-semibold text-brand">A stronger answer</p>
                        <p className="text-text/90">{q.better_answer}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-5 p-6">
        <h2 className="mb-4 font-semibold">Transcript</h2>
        <div className="space-y-3">
          {session.transcript.map((t, i) => (
            <div key={i} className={cx("flex", t.role === "candidate" && "justify-end")}>
              <div className={cx("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                t.role === "candidate" ? "bg-brand/20" : "bg-surface-2")}>
                <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
                  {t.role === "candidate" ? "You" : speakerNames[t.speaker] || session.panel?.[0]?.name || session.interviewer}
                </p>
                <span className="whitespace-pre-wrap">{t.role === "candidate" ? t.content.split("\n\n[Code at this moment")[0] : t.content}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
