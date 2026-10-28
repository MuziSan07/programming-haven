"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, CircleCheck, ClipboardCheck, Clock, Code, Maximize, Play, ShieldCheck, TriangleAlert, User,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useProctor } from "@/lib/useProctor";
import CodeEditor from "@/components/CodeEditor";
import ProblemStatement from "@/components/ProblemStatement";
import TestResults from "@/components/TestResults";
import VettingBanner from "@/components/vetting/VettingBanner";
import { Badge, Button, Card, CodeBlock, ErrorState, PageLoader, RichText, cx } from "@/components/ui";

function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function CameraBox({ proctor, videoRef, className }) {
  const { camera, faces, detectorReady } = proctor;
  const faceOk = faces === 1;
  return (
    <div className={cx("relative overflow-hidden rounded-xl border border-line bg-black", className)}>
      <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
      {camera !== "on" && (
        <div className="absolute inset-0 flex items-center justify-center text-faint"><Camera className="size-8" /></div>
      )}
      {camera === "on" && (
        <span className={cx("absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          !detectorReady ? "bg-surface-3 text-muted" : faceOk ? "bg-ok/90 text-white" : "bg-bad/90 text-white")}>
          <User className="size-3" />
          {!detectorReady ? "Starting AI…" : faces === 0 ? "No face" : faces > 1 ? `${faces} faces` : "Face OK"}
        </span>
      )}
    </div>
  );
}

function PreCheck({ test, proctor, attachVideo, onStart, starting }) {
  const ready = proctor.camera === "on";
  return (
    <div className="mx-auto max-w-4xl animate-fade-up">
      <VettingBanner />
      <Badge tone="brand">{test.style}</Badge>
      <h1 className="mt-3 text-3xl font-bold">{test.title}</h1>
      <p className="mt-2 text-muted">{test.description}</p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Before you begin</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            {[[Clock, `${test.duration_minutes} minutes. The test auto-submits when time runs out.`],
              [ClipboardCheck, `${test.mcq.length} multiple-choice and ${test.coding.length} coding question(s).`],
              [Camera, "Keep your face visible. Only you should be in frame."],
              [Maximize, "Stay in fullscreen. Don't switch tabs or windows."],
              [ShieldCheck, "Pasting and copying are logged in your Integrity Report."]].map(([Icon, text]) => (
              <li key={text} className="flex gap-3"><Icon className="mt-0.5 size-4 shrink-0 text-brand-2" />{text}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">System check</h2>
          <CameraBox proctor={proctor} videoRef={attachVideo} className="mt-4 aspect-video" />
          <div className="mt-4 space-y-2 text-sm">
            <p className="flex items-center gap-2">
              {ready ? <CircleCheck className="size-4 text-ok" /> : <TriangleAlert className="size-4 text-warn" />}
              Camera {proctor.camera === "denied" ? "blocked: allow access in your browser" : ready ? "connected" : "required"}
            </p>
            <p className="flex items-center gap-2">
              {proctor.faces === 1 ? <CircleCheck className="size-4 text-ok" /> : <TriangleAlert className="size-4 text-warn" />}
              {proctor.faces === 1 ? "Face detected" : "Center your face in the frame"}
            </p>
          </div>
          {!ready ? (
            <Button className="mt-5 w-full" onClick={proctor.startCamera} loading={proctor.camera === "starting"}>
              <Camera className="size-4" /> Enable camera
            </Button>
          ) : (
            <Button className="mt-5 w-full" size="lg" onClick={onStart} loading={starting}>
              <Play className="size-4" /> Start test in fullscreen
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function TestRunnerPage() {
  const { testId } = useParams();
  const router = useRouter();
  const vettingRun = useSearchParams().get("vetting");
  const { setUser } = useAuth();
  const { data: test, error, loading, reload } = useApi(`/api/tests/${testId}`);
  const [session, setSession] = useState(null); // { attempt_id, test, endsAt }
  const [starting, setStarting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [code, setCode] = useState({});
  const [runResults, setRunResults] = useState({});
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [startError, setStartError] = useState("");
  const submittedRef = useRef(false);

  const proctor = useProctor({ active: Boolean(session) && !submitting });
  const { attachVideo } = proctor;

  async function start() {
    setStarting(true);
    setStartError("");
    try {
      const s = await api(`/api/tests/${testId}/start`, { method: "POST" });
      const initial = {};
      s.test.problems.forEach((p) => { initial[p.slug] = { language: "python", code: p.starter.python }; });
      setCode(initial);
      await proctor.enterFullscreen();
      setSession({ ...s, endsAt: Date.now() + s.test.duration_minutes * 60_000 });
      setNow(Date.now());
    } catch (err) {
      setStartError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const submit = useCallback(async () => {
    if (submittedRef.current || !session) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const result = await api(`/api/tests/attempts/${session.attempt_id}/submit`, {
        body: { answers, code, violations: proctor.violations },
      });
      setUser(result.user);
      proctor.stop();
      router.push(`/tests/result/${session.attempt_id}${vettingRun ? `?vetting=${vettingRun}` : ""}`);
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setStartError(err.message);
    }
  }, [session, answers, code, proctor, router, setUser, vettingRun]);

  // Countdown + auto-submit
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session]);

  const remaining = session ? session.endsAt - now : 0;
  useEffect(() => {
    if (session && remaining <= 0) submit();
  }, [session, remaining, submit]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!session) {
    return (
      <>
        <PreCheck test={test} proctor={proctor} attachVideo={attachVideo} onStart={start} starting={starting} />
        {startError && <p className="mt-4 text-center text-sm text-bad">{startError}</p>}
      </>
    );
  }
  if (submitting) return <PageLoader label="Grading your test" />;

  const questions = [
    ...session.test.mcq.map((q) => ({ kind: "mcq", ...q })),
    ...session.test.problems.map((p) => ({ kind: "coding", ...p })),
  ];
  const q = questions[current];
  const isAnswered = (item) => item.kind === "mcq" ? answers[item.id] !== undefined
    : code[item.slug]?.code?.trim() !== item.starter[code[item.slug]?.language || "python"].trim();
  const answeredCount = questions.filter(isAnswered).length;
  const lowTime = remaining < 5 * 60_000;

  async function runSamples() {
    const c = code[q.slug];
    setRunning(true);
    try {
      const r = await api("/api/dsa/run", { body: { slug: q.slug, language: c.language, code: c.code } });
      setRunResults((rr) => ({ ...rr, [q.slug]: r }));
    } catch (err) {
      setRunResults((rr) => ({ ...rr, [q.slug]: { status: "Error", passed: 0, total: 0, stderr: err.message, cases: [] } }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg select-none">
      <header className="flex items-center gap-4 border-b border-line px-4 py-3">
        <ShieldCheck className="size-5 text-ok" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{session.test.title}</p>
          <p className="text-xs text-muted">{answeredCount}/{questions.length} answered · Proctoring active</p>
        </div>
        <div className={cx("ml-auto flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-lg font-bold tabular-nums",
          lowTime ? "bg-bad/15 text-bad" : "bg-surface-2")}>
          <Clock className="size-4" /> {formatTime(remaining)}
        </div>
        <Badge tone={proctor.violations.length ? "warn" : "ok"} className="hidden sm:inline-flex">
          {proctor.violations.length} flag{proctor.violations.length === 1 ? "" : "s"}
        </Badge>
        <Button variant="success" onClick={() => setConfirm(true)}>Submit test</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line p-3 md:flex">
          {questions.map((item, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={cx("flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                i === current ? "bg-brand/15 text-white" : "text-muted hover:bg-surface-2")}>
              <span className={cx("flex size-6 items-center justify-center rounded-md text-xs font-semibold",
                isAnswered(item) ? "bg-ok/20 text-ok" : "bg-surface-3")}>{i + 1}</span>
              <span className="truncate">{item.kind === "mcq" ? "Multiple choice" : item.title}</span>
              {item.kind === "coding" && <Code className="ml-auto size-3.5 shrink-0" />}
            </button>
          ))}
          <CameraBox proctor={proctor} videoRef={attachVideo} className="mt-auto aspect-[4/3]" />
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {q.kind === "mcq" ? (
            <div className="mx-auto max-w-2xl p-6 sm:p-10">
              <p className="text-xs text-muted">Question {current + 1} of {questions.length}</p>
              <h2 className="mt-2 text-xl font-semibold"><RichText text={q.question} /></h2>
              {q.code && <CodeBlock code={q.code} className="mt-4" />}
              <div className="mt-6 grid gap-3">
                {q.options.map((opt, i) => (
                  <button key={i} onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                    className={cx("flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition",
                      answers[q.id] === i ? "border-brand bg-brand/10" : "border-line bg-surface hover:border-faint")}>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line font-mono text-xs">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <RichText text={opt} />
                  </button>
                ))}
              </div>
              <div className="mt-8 flex justify-between">
                <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent(current - 1)}>Previous</Button>
                <Button disabled={current === questions.length - 1} onClick={() => setCurrent(current + 1)}>Next</Button>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-0 lg:grid-cols-[40%_1fr]">
              <div className="overflow-y-auto border-r border-line p-6">
                <ProblemStatement problem={q} />
              </div>
              <div className="flex min-h-[70vh] flex-col lg:min-h-0">
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <select value={code[q.slug].language}
                    onChange={(e) => setCode((c) => ({ ...c, [q.slug]: { language: e.target.value, code: q.starter[e.target.value] } }))}
                    className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs">
                    {session.test.languages.map((l) => <option key={l} value={l}>{l === "python" ? "Python 3" : "JavaScript"}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" className="ml-auto" onClick={runSamples} loading={running}>
                    <Play className="size-3.5" /> Run samples
                  </Button>
                </div>
                <div className="min-h-[300px] flex-[3]">
                  <CodeEditor key={`${q.slug}-${code[q.slug].language}`} value={code[q.slug].code}
                    language={code[q.slug].language}
                    onChange={(v) => setCode((c) => ({ ...c, [q.slug]: { ...c[q.slug], code: v } }))} />
                </div>
                <div className="flex-[2] overflow-y-auto border-t border-line bg-surface">
                  <TestResults result={runResults[q.slug]} />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {proctor.warning && (
        <div key={proctor.warning.id}
          className="fixed top-20 left-1/2 z-50 flex -translate-x-1/2 animate-pop items-center gap-2 rounded-xl border
            border-warn/40 bg-[#2a1d06] px-4 py-3 text-sm font-medium text-warn shadow-2xl">
          <TriangleAlert className="size-4" /> {proctor.warning.text}. This was recorded.
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm animate-pop p-6">
            <h2 className="text-lg font-semibold">Submit your test?</h2>
            <p className="mt-2 text-sm text-muted">
              You answered {answeredCount} of {questions.length} questions with {formatTime(remaining)} left.
              You can&apos;t change answers after submitting.
            </p>
            {startError && <p className="mt-2 text-sm text-bad">{startError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirm(false)}>Keep working</Button>
              <Button variant="success" onClick={submit}>Submit</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
