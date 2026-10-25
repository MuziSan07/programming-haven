"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

const GESTURES = ["index", "handup", "ok", "side"];

function wordTimings(text, durationMs) {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => Math.max(2, w.replace(/[^A-Za-z0-9]/g, "").length) + 1.5);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  const wtimes = [];
  const wdurations = [];
  for (const w of weights) {
    const d = (w / total) * durationMs;
    wtimes.push(t);
    wdurations.push(d * 0.9);
    t += d;
  }
  return { words, wtimes, wdurations };
}

function Stage({ persona, state, utterance, framing, onFailed, onReady }) {
  const nodeRef = useRef(null);
  const headRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Create the 3D head once per model
  useEffect(() => {
    let head = null;
    let cancelled = false;
    (async () => {
      const [{ TalkingHead }, { LipsyncEn }] = await Promise.all([
        import("@met4citizen/talkinghead"),
        import("@/lib/vendor/lipsync-en.mjs"),
      ]);
      if (cancelled || !nodeRef.current) return;
      head = new TalkingHead(nodeRef.current, {
        ttsEndpoint: "", lipsyncModules: [], lipsyncLang: "en", cameraView: framing,
        cameraRotateEnable: false, cameraZoomEnable: false, cameraPanEnable: false,
        avatarMood: "neutral", avatarIdleEyeContact: 0.6, avatarSpeakingEyeContact: 0.85, modelFPS: 30,
      });
      head.lipsync.en = new LipsyncEn();
      await head.showAvatar({ url: persona.model_url, body: persona.body || "F", avatarMood: "neutral", lipsyncLang: "en" });
      if (cancelled) {
        head.stop();
        head.dispose?.();
        return;
      }
      headRef.current = head;
      setReady(true);
      onReady();
    })().catch(() => !cancelled && onFailed());
    return () => {
      cancelled = true;
      headRef.current = null;
      try {
        head?.stop();
        head?.dispose?.();
      } catch {
        // already torn down
      }
    };
  }, [persona.model_url, persona.body, framing, onFailed, onReady]);

  // Lip-sync: the voice itself plays elsewhere, so drive visemes with a silent buffer of the same length
  useEffect(() => {
    const head = headRef.current;
    if (!ready || !head) return;
    if (!utterance) {
      head.stopSpeaking();
      return;
    }
    head.audioCtx?.resume?.();
    const durationMs = Math.max(600, utterance.duration * 1000);
    const sr = head.audioCtx.sampleRate;
    const audio = head.audioCtx.createBuffer(1, Math.ceil((sr * durationMs) / 1000), sr);
    head.speakAudio({ audio, ...wordTimings(utterance.text, durationMs) }, { lipsyncLang: "en" });
    if (durationMs > 2500) head.playGesture(GESTURES[utterance.id % GESTURES.length], 2.5);
  }, [utterance, ready]);

  // Body language for the conversation state
  useEffect(() => {
    const head = headRef.current;
    if (!ready || !head) return;
    if (state === "listening") {
      head.setMood("happy");
      head.lookAtCamera(4000);
    } else {
      head.setMood("neutral");
      if (state === "idle") head.makeEyeContact(3000);
    }
  }, [state, ready]);

  return (
    <div ref={nodeRef} className={cx("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")} />
  );
}

/**
 * Realistic 3D interviewer (TalkingHead + a rigged GLB with ARKit/viseme blend shapes).
 * Renders `fallback` until the model has loaded, or if it fails to load.
 */
export default function Avatar3D({ persona, state = "idle", utterance, size = 260, framing = "upper", fallback, className }) {
  const [status, setStatus] = useState("loading"); // loading | ready | failed
  // Stable callbacks so the 3D stage isn't rebuilt on every render
  const [onFailed] = useState(() => () => setStatus("failed"));
  const [onReady] = useState(() => () => setStatus("ready"));
  return (
    <div className={cx("relative overflow-hidden rounded-3xl border border-line", className)}
      style={{ width: size, height: Math.round(size * 1.15), background: "linear-gradient(180deg, #1b2236 0%, #0d1220 100%)" }}>
      {status !== "ready" && <div className="absolute inset-0 flex items-center justify-center">{fallback}</div>}
      {status !== "failed" && (
        <Stage key={persona.model_url} persona={persona} state={state} utterance={utterance} framing={framing}
          onFailed={onFailed} onReady={onReady} />
      )}
      {state === "speaking" && (
        <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="w-1 animate-pulse rounded-full bg-brand" style={{ height: 6 + ((i * 5) % 9), animationDelay: `${i * 120}ms` }} />
          ))}
        </span>
      )}
    </div>
  );
}
