"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard, Mic, MonitorUp, MonitorX, PhoneOff, Send, Square, Video, VideoOff, Volume2, VolumeX,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { captureFrame } from "@/lib/frames";
import { formatDuration, useActiveTime } from "@/lib/useActiveTime";
import { useApi } from "@/lib/useApi";
import { useRecorder, useSpeaker } from "@/lib/useVoice";
import Avatar from "@/components/Avatar";
import CodeEditor from "@/components/CodeEditor";
import InterviewReport from "@/components/InterviewReport";
import ProblemStatement from "@/components/ProblemStatement";
import { Badge, Button, ErrorState, PageLoader, Spinner, cx } from "@/components/ui";

/** Camera + screen-share streams with frame capture for the vision model. */
function useMedia() {
  const camRef = useRef(null);
  const screenRef = useRef(null);
  const camStream = useRef(null);
  const screenStream = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [error, setError] = useState("");

  const attach = (el, stream) => {
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  };
  const camVideo = useCallback((el) => { camRef.current = el; attach(el, camStream.current); }, []);
  const screenVideo = useCallback((el) => { screenRef.current = el; attach(el, screenStream.current); }, []);

  const startCamera = useCallback(async () => {
    try {
      camStream.current = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540 } });
      attach(camRef.current, camStream.current);
      setCameraOn(true);
      setError("");
    } catch {
      setError("Camera unavailable. Allow camera access in your browser.");
    }
  }, []);
  const stopCamera = useCallback(() => {
    camStream.current?.getTracks().forEach((t) => t.stop());
    camStream.current = null;
    setCameraOn(false);
  }, []);
  const startScreen = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      screenStream.current = stream;
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        screenStream.current = null;
        setScreenOn(false);
      });
      attach(screenRef.current, stream);
      setScreenOn(true);
      setError("");
    } catch {
      setError("Screen sharing was cancelled.");
    }
  }, []);
  const stopScreen = useCallback(() => {
    screenStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current = null;
    setScreenOn(false);
  }, []);

  useEffect(() => () => {
    camStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const frames = useCallback(() => [
    camStream.current && captureFrame(camRef.current, 512),
    screenStream.current && captureFrame(screenRef.current, 1024, 0.6),
  ].filter(Boolean), []);

  return { camVideo, screenVideo, cameraOn, screenOn, error, startCamera, stopCamera, startScreen, stopScreen, frames };
}

function Room({ initial, onFinished }) {
  const { setUser } = useAuth();
  const live = initial.mode === "live";
  const persona = initial.persona;
  const [session, setSession] = useState(initial);
  const [phase, setPhase] = useState("idle"); // idle | speaking | listening | transcribing | thinking | grading
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState(() => initial.problem?.starter?.python || "");
  const [language, setLanguage] = useState("python");
  const speaker = useSpeaker({ voice: persona?.voice, gender: persona?.gender });
  const recorder = useRecorder();
  const {
    camVideo, screenVideo, cameraOn, screenOn, error: mediaError, startCamera, stopCamera, startScreen, stopScreen, frames,
  } = useMedia();
  const timer = useActiveTime("interview", String(initial.id));
  const spokenRef = useRef(-1);
  const transcriptEnd = useRef(null);

  const lastIndex = session.transcript.length - 1;
  const last = session.transcript[lastIndex];

  // Live rounds start with the camera on, like a real 1:1
  useEffect(() => {
    if (live) startCamera();
  }, [live, startCamera]);

  // Speak each new interviewer message once
  useEffect(() => {
    if (last?.role !== "interviewer" || spokenRef.current === lastIndex) return;
    spokenRef.current = lastIndex;
    setPhase("speaking");
    speaker.speak(last.content).then(() => setPhase((p) => (p === "speaking" ? "idle" : p)));
  }, [last, lastIndex, speaker]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.transcript.length, phase]);

  const sendAnswer = useCallback(async (text) => {
    const answer = text.trim();
    if (!answer) return;
    setDraft("");
    setError("");
    setSession((s) => ({ ...s, transcript: [...s.transcript, { role: "candidate", content: answer }] }));
    setPhase("thinking");
    try {
      const body = { text: answer, images: frames() };
      if (live) Object.assign(body, { code, language });
      setSession(await api(`/api/interviews/${session.id}/reply`, { body }));
    } catch (err) {
      setError(err.message);
      setPhase("idle");
    }
  }, [session.id, frames, live, code, language]);

  async function toggleMic() {
    setError("");
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (!blob || blob.size < 2000) {
        setPhase("idle");
        setError("We didn't catch that. Hold the mic a little longer.");
        return;
      }
      setPhase("transcribing");
      try {
        const form = new FormData();
        form.append("file", blob, blob.type.includes("mp4") ? "answer.mp4" : "answer.webm");
        const { text } = await api("/api/ai/transcribe", { form });
        if (text) await sendAnswer(text);
        else {
          setPhase("idle");
          setError("No speech detected. Try again or type your answer.");
        }
      } catch (err) {
        setPhase("idle");
        setTyping(true);
        setError(err.message);
      }
    } else {
      speaker.stop();
      try {
        await recorder.start();
        setPhase("listening");
      } catch {
        setTyping(true);
        setError("Microphone unavailable. Type your answer instead.");
      }
    }
  }

  async function finish() {
    speaker.stop();
    if (recorder.recording) await recorder.stop();
    stopCamera();
    stopScreen();
    setPhase("grading");
    try {
      const result = await api(`/api/interviews/${session.id}/end`, { method: "POST" });
      if (result.user) setUser(result.user);
      onFinished(result);
    } catch (err) {
      setError(err.message);
      setPhase("idle");
    }
  }

  if (phase === "grading") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Avatar persona={persona} size={170} state="thinking" />
        <p className="text-lg font-semibold">The panel is reviewing your interview…</p>
        <p className="text-sm text-muted">Scoring each answer and writing model answers for you.</p>
        <Spinner className="size-6" />
      </div>
    );
  }

  const name = session.interviewer;
  const avatarState = phase === "speaking" ? "speaking" : phase === "listening" ? "listening"
    : phase === "thinking" || phase === "transcribing" ? "thinking" : "idle";
  const statusText = {
    speaking: `${name} is speaking…`, listening: "Listening… tap to finish your answer",
    transcribing: "Transcribing your answer…", thinking: `${name} is thinking…`,
    idle: session.done ? "Interview complete" : "Your turn: tap the mic to answer",
  }[phase];
  const busy = ["thinking", "transcribing"].includes(phase);
  const asked = Math.min(session.questions_asked, session.questions_total);

  const controls = !session.done ? (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex items-center gap-4">
        <button onClick={() => setTyping(!typing)} disabled={busy}
          className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-text
            disabled:opacity-40" title="Type instead">
          <Keyboard className="size-5" />
        </button>
        <button onClick={toggleMic} disabled={busy}
          className={cx("relative flex size-[72px] items-center justify-center rounded-full text-white transition disabled:opacity-40",
            recorder.recording ? "bg-bad" : "bg-brand hover:scale-105")}
          aria-label={recorder.recording ? "Stop recording" : "Start answering"}>
          {recorder.recording && (
            <span className="absolute inset-0 rounded-full bg-bad/40"
              style={{ transform: `scale(${1 + recorder.level * 0.6})`, transition: "transform 80ms" }} />
          )}
          {busy ? <Spinner className="size-7 text-white" /> : recorder.recording
            ? <Square className="relative size-6" fill="currentColor" /> : <Mic className="size-7" />}
        </button>
        <div className="size-11" />
      </div>
      {typing && (
        <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); sendAnswer(draft); }}>
          <textarea className="input min-h-16 resize-none" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your answer…" disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAnswer(draft); } }} />
          <Button type="submit" disabled={busy || !draft.trim()} className="h-auto"><Send className="size-4" /></Button>
        </form>
      )}
    </div>
  ) : (
    <Button size="lg" onClick={finish}>Get my feedback report</Button>
  );

  const transcript = (
    <div className="space-y-3">
      {session.transcript.map((t, i) => (
        <div key={i} className={cx("flex", t.role === "candidate" && "justify-end")}>
          <div className={cx("max-w-[90%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
            t.role === "candidate" ? "bg-brand text-white" : "bg-surface-2")}>
            {t.role === "candidate" ? t.content.split("\n\n[Code at this moment")[0] : t.content}
          </div>
        </div>
      ))}
      {phase === "thinking" && <p className="flex items-center gap-2 text-xs text-muted"><Spinner className="size-3.5" /> Thinking…</p>}
      <div ref={transcriptEnd} />
    </div>
  );

  return (
    <div className="-mx-4 -my-6 flex flex-col sm:-mx-6 lg:-mx-10 lg:-my-8 lg:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-1.5 rounded-full bg-bad/15 px-2.5 py-0.5 text-xs font-semibold text-bad">
          <span className="size-1.5 animate-pulse rounded-full bg-bad" /> LIVE
        </span>
        <p className="truncate text-sm font-semibold">{session.title}</p>
        <Badge className="hidden sm:inline-flex">Question {asked}/{session.questions_total}</Badge>
        <span className="ml-auto font-mono text-sm text-muted tabular-nums" title="Focused time">{formatDuration(timer.seconds)}</span>
        <Button size="sm" variant="ghost" onClick={() => { speaker.setMuted(!speaker.muted); speaker.stop(); }}
          title={speaker.muted ? `Unmute ${name}` : `Mute ${name}`}>
          {speaker.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
        <Button size="sm" variant={cameraOn ? "secondary" : "ghost"}
          onClick={cameraOn ? stopCamera : startCamera}
          title={cameraOn ? `Turn camera off (${name} can see you)` : `Turn camera on so ${name} can see you`}>
          {cameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
        </Button>
        {live && (
          <Button size="sm" variant={screenOn ? "secondary" : "ghost"}
            onClick={screenOn ? stopScreen : startScreen} title="Share your screen">
            {screenOn ? <MonitorUp className="size-4 text-ok" /> : <MonitorX className="size-4" />}
            <span className="hidden sm:inline">{screenOn ? "Sharing" : "Share screen"}</span>
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={finish} disabled={busy || session.transcript.every((t) => t.role !== "candidate")}>
          <PhoneOff className="size-3.5" /> End & get report
        </Button>
      </div>

      {live ? (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_400px]">
          <div className="flex min-h-0 flex-col border-r border-line">
            <details className="border-b border-line" open>
              <summary className="cursor-pointer px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">Problem</summary>
              <div className="max-h-[32vh] overflow-y-auto px-5 pb-4">{session.problem && <ProblemStatement problem={session.problem} />}</div>
            </details>
            <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
              <select value={language} onChange={(e) => { setLanguage(e.target.value); setCode(session.problem?.starter?.[e.target.value] || ""); }}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1">
                <option value="python">Python 3</option>
                <option value="javascript">JavaScript</option>
              </select>
              <span className="text-faint">{name} sees this editor{screenOn ? " and your shared screen" : ""} with every answer.</span>
            </div>
            <div className="h-[50vh] min-h-0 lg:h-auto lg:flex-1">
              <CodeEditor value={code} onChange={setCode} language={language} />
            </div>
          </div>
          <aside className="flex min-h-0 flex-col bg-surface">
            <div className="flex items-center gap-3 border-b border-line p-3">
              <Avatar persona={persona} level={speaker.level} state={avatarState} size={96} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{name}</p>
                <p className={cx("text-xs", phase === "listening" ? "text-ok" : "text-muted")}>{statusText}</p>
              </div>
              <div className="relative aspect-video w-28 overflow-hidden rounded-lg border border-line bg-black">
                <video ref={camVideo} muted playsInline className={cx("h-full w-full -scale-x-100 object-cover", !cameraOn && "hidden")} />
                {!cameraOn && <VideoOff className="absolute inset-0 m-auto size-5 text-faint" />}
              </div>
            </div>
            <video ref={screenVideo} muted playsInline className="hidden" />
            {!screenOn && (
              <button onClick={startScreen} className="m-3 flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2
                text-left text-xs text-warn">
                <MonitorUp className="size-4 shrink-0" /> {name} asked you to share your screen. Click to share.
              </button>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{transcript}</div>
            <div className="border-t border-line p-3">{controls}</div>
            {(error || mediaError) && <p className="px-3 pb-3 text-xs text-bad">{error || mediaError}</p>}
          </aside>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_380px]">
          <div className="relative flex flex-col items-center justify-center gap-5 overflow-hidden px-4 py-8"
            style={{ background: "radial-gradient(ellipse at center, rgba(124,92,255,0.06), transparent 65%)" }}>
            <Avatar persona={persona} level={speaker.level} state={avatarState} size={250} />
            <div className="text-center">
              <p className="text-lg font-semibold">{name}</p>
              <p className={cx("mt-1 text-sm", phase === "listening" ? "text-ok" : "text-muted")}>{statusText}</p>
            </div>
            {last?.role === "interviewer" && (
              <p className="max-w-2xl rounded-2xl border border-line bg-surface/80 px-5 py-4 text-center text-[15px]
                leading-relaxed backdrop-blur">{last.content}</p>
            )}
            <div className="w-full max-w-2xl">{controls}</div>
            {(error || mediaError) && <p className="text-sm text-bad">{error || mediaError}</p>}
            <div className={cx("absolute right-4 bottom-4 aspect-video w-36 overflow-hidden rounded-xl border border-line bg-black sm:w-48",
              !cameraOn && "hidden")}>
              <video ref={camVideo} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{name} can see you</span>
            </div>
          </div>
          <aside className="flex min-h-0 flex-col border-l border-line bg-surface">
            <p className="border-b border-line px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">Live transcript</p>
            <div className="max-h-[50vh] flex-1 overflow-y-auto p-4 lg:max-h-none">{transcript}</div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function InterviewRoomPage() {
  const { id } = useParams();
  const { data, error, loading, reload, setData } = useApi(`/api/interviews/${id}`);
  if (loading) return <PageLoader label="Connecting to your interviewer" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (data.feedback) return <InterviewReport session={data} />;
  return <Room initial={data} onFinished={setData} />;
}
