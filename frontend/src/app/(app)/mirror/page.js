"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, Send, Square, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api";
import { captureFrame } from "@/lib/frames";
import { useActiveTime } from "@/lib/useActiveTime";
import { usePersona } from "@/lib/usePersona";
import { useRecorder, useSpeaker } from "@/lib/useVoice";
import Avatar from "@/components/Avatar";
import { Button, Card, PageHeader, Spinner, cx } from "@/components/ui";

const PROMPTS = [
  "What colour am I wearing?",
  "Is my outfit professional enough for a tech interview?",
  "How are my lighting and background?",
  "Am I framed well, and is my eye contact okay?",
  "Give me a full pre-interview check.",
];

export default function MirrorPage() {
  const { persona } = usePersona();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const endRef = useRef(null);
  const [camera, setCamera] = useState("off"); // off | starting | on | denied
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const speaker = useSpeaker({ voice: persona?.voice, gender: persona?.gender });
  const recorder = useRecorder();
  useActiveTime("mirror", "");

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  async function toggleCamera() {
    if (camera === "on") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamera("off");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
      setCamera("on");
    } catch (err) {
      setCamera(err?.name === "NotAllowedError" ? "denied" : "off");
    }
  }

  async function ask(text) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    const image = camera === "on" ? captureFrame(videoRef.current, 768) : null;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: message, image }]);
    setBusy(true);
    try {
      const r = await api("/api/ai/mirror", { body: { message, image, history } });
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
      if (voiceOn) speaker.speak(r.reply);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Something went wrong: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (!blob || blob.size < 2000) return;
      setBusy(true);
      try {
        const form = new FormData();
        form.append("file", blob, blob.type.includes("mp4") ? "q.mp4" : "q.webm");
        const { text } = await api("/api/ai/transcribe", { form });
        setBusy(false);
        if (text) ask(text);
      } catch {
        setBusy(false);
      }
    } else {
      speaker.stop();
      recorder.start().catch(() => {});
    }
  }

  const name = persona?.name || "your interviewer";
  const avatarState = speaker.speaking ? "speaking" : recorder.recording ? "listening" : busy ? "thinking" : "idle";

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Test your interviewer" title={`Can ${name} see you?`}
        description={`Turn on your camera and ask ${name} anything: your outfit, colours, lighting, background, framing. A quick dress-code and setup check before the real interview.`} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="relative aspect-video bg-black">
            <video ref={videoRef} muted playsInline className={cx("h-full w-full -scale-x-100 object-cover", camera !== "on" && "hidden")} />
            {camera !== "on" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-muted">
                <CameraOff className="size-10" />
                <p className="text-sm">{camera === "denied" ? "Camera blocked. Allow it in your browser's site settings." : "Your camera is off"}</p>
              </div>
            )}
            {camera === "on" && (
              <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                <span className="size-2 animate-pulse rounded-full bg-bad" /> {name} can see you
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 p-4">
            <Button onClick={toggleCamera} loading={camera === "starting"} variant={camera === "on" ? "secondary" : "primary"}>
              {camera === "on" ? <><CameraOff className="size-4" /> Turn camera off</> : <><Camera className="size-4" /> Turn camera on</>}
            </Button>
            <p className="text-xs text-faint">Frames are sent only when you ask a question, never recorded.</p>
          </div>
        </Card>

        <Card className="flex min-h-[520px] flex-col">
          <div className="flex items-center gap-4 border-b border-line p-4">
            <Avatar persona={persona} size={88} level={speaker.level} state={avatarState} />
            <div className="flex-1">
              <p className="text-lg font-semibold">{name}</p>
              <p className="text-xs text-muted">{persona?.title}</p>
            </div>
            <button onClick={() => { setVoiceOn(!voiceOn); speaker.stop(); }} className="rounded-lg p-2 text-muted hover:text-text"
              title={voiceOn ? "Mute" : "Unmute"}>
              {voiceOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted">Turn on your camera, then try one of these:</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cx("flex gap-2", m.role === "user" && "justify-end")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail */}
                {m.image && <img src={m.image} alt="Frame sent" className="size-12 rounded-lg object-cover -scale-x-100" />}
                <p className={cx("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", m.role === "user" ? "bg-brand text-white" : "bg-surface-2")}>
                  {m.content}
                </p>
              </div>
            ))}
            {busy && <p className="flex items-center gap-2 text-xs text-muted"><Spinner className="size-3.5" /> {name} is looking…</p>}
            <div ref={endRef} />
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {PROMPTS.map((p) => (
              <button key={p} onClick={() => ask(p)} disabled={busy}
                className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-brand hover:text-text disabled:opacity-40">
                {p}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2 border-t border-line p-3">
            <button type="button" onClick={toggleMic}
              className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl",
                recorder.recording ? "bg-bad text-white" : "border border-line text-muted hover:text-text")}
              aria-label={recorder.recording ? "Stop" : "Ask by voice"}>
              {recorder.recording ? <Square className="size-4" fill="currentColor" /> : <Mic className="size-4" />}
            </button>
            <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask ${name}…`} />
            <button type="submit" disabled={busy || !input.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white disabled:opacity-40" aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
