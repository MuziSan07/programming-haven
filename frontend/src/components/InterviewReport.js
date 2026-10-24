"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronRight, FileText, RotateCcw, Star, TrendingUp, Trophy } from "lucide-react";
import { Badge, Button, Card, Progress, Ring, cx, scoreColor } from "./ui";

const VERDICT_TONE = { "Strong pass": "ok", "Likely to pass": "ok", Borderline: "warn", "Needs work": "bad" };

function label(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function InterviewReport({ session }) {
  const f = session.feedback;
  const [open, setOpen] = useState(0);

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-widest text-brand uppercase">Interview report</p>
          <h1 className="mt-1 text-3xl font-bold">{session.title}</h1>
          <p className="mt-1 text-sm text-muted">{session.level} {session.role} · with {session.interviewer}</p>
        </div>
        <Button href={`/interview?kind=${session.kind}`} variant="secondary"><RotateCcw className="size-4" /> Practise again</Button>
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
                  {t.role === "candidate" ? "You" : session.interviewer}
                </p>
                {t.content}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
