"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Send, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api";
import { useSpeaker } from "@/lib/useVoice";
import Avatar from "./Avatar";
import { Spinner, cx } from "./ui";

const IDLE_AFTER = 75; // seconds without code changes before the companion nudges
const IDLE_COOLDOWN = 120;

/**
 * Playful coding companion. Pops in on open, when the learner is idle and stuck, after failed runs,
 * on Accepted and when they come back from another tab. Learners can chat with it any time.
 */
export function useCompanion({ slug, language, codeRef }) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const historyRef = useRef([]);
  const lastChangeRef = useRef(0);
  const lastNudgeRef = useRef(0);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const call = useCallback(async (event, extra = {}) => {
    setBusy(true);
    try {
      const r = await api("/api/dsa/companion", {
        body: { slug, language, code: codeRef.current || "", event, history: historyRef.current.slice(-10), ...extra },
      });
      const msg = { role: "assistant", content: r.message, event };
      historyRef.current = [...historyRef.current, { role: "assistant", content: r.message }];
      setMessages((m) => [...m, msg]);
      if (!openRef.current) setUnread((u) => u + 1);
      return r.message;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [slug, language, codeRef]);

  const notify = useCallback((event, extra) => {
    lastNudgeRef.current = Date.now();
    return call(event, extra);
  }, [call]);

  const send = useCallback((text) => {
    const message = text.trim();
    if (!message) return null;
    historyRef.current = [...historyRef.current, { role: "user", content: message }];
    setMessages((m) => [...m, { role: "user", content: message }]);
    return call("chat", { message });
  }, [call]);

  const codeChanged = useCallback(() => {
    lastChangeRef.current = Date.now();
  }, []);

  // Greeting shortly after opening, then idle nudges while the learner is stuck
  useEffect(() => {
    lastChangeRef.current = Date.now();
    lastNudgeRef.current = Date.now();
    const greet = setTimeout(() => notify("open"), 1500);
    const idle = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastChangeRef.current > IDLE_AFTER * 1000 && now - lastNudgeRef.current > IDLE_COOLDOWN * 1000) {
        notify("idle");
      }
    }, 5000);
    return () => {
      clearTimeout(greet);
      clearInterval(idle);
    };
  }, [notify]);

  return {
    messages, busy, open, unread, notify, send, codeChanged,
    setOpen: (v) => { setOpen(v); if (v) setUnread(0); },
  };
}

export function CompanionPanel({ companion, persona }) {
  const { messages, busy, open, unread, setOpen, send } = companion;
  const [input, setInput] = useState("");
  const speaker = useSpeaker({ voice: persona?.voice, gender: persona?.gender });
  const [voiceOn, setVoiceOn] = useState(false);
  const endRef = useRef(null);
  const spokenRef = useRef(0);
  const last = messages[messages.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy, open]);

  useEffect(() => {
    if (!voiceOn || last?.role !== "assistant" || spokenRef.current === messages.length) return;
    spokenRef.current = messages.length;
    speaker.speak(last.content);
  }, [voiceOn, last, messages.length, speaker]);

  const name = persona?.name || "Coach";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full border border-brand/40 bg-surface p-1.5 pr-4
          shadow-2xl transition hover:scale-105 lg:bottom-6"
        aria-label={`Open ${name}`}>
        <Avatar persona={persona} size={44} state={busy ? "thinking" : "idle"} />
        <span className="text-sm font-medium">{name}</span>
        {unread > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-bad text-[10px] font-bold text-white">{unread}</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed right-4 bottom-20 z-40 flex w-[min(360px,calc(100vw-2rem))] animate-pop flex-col overflow-hidden
      rounded-2xl border border-brand/30 bg-surface shadow-2xl lg:bottom-6">
      <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-3 py-2">
        <Avatar persona={persona} size={48} level={speaker.level}
          state={speaker.speaking ? "speaking" : busy ? "thinking" : "idle"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{name}</p>
          <p className="truncate text-[11px] text-muted">{busy ? "typing…" : "Watching your code"}</p>
        </div>
        <button onClick={() => { setVoiceOn(!voiceOn); speaker.stop(); }} className="rounded-lg p-1.5 text-muted hover:text-text"
          title={voiceOn ? "Mute voice" : "Speak replies"}>
          {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted hover:text-text" aria-label="Minimise">
          <ChevronDown className="size-4" />
        </button>
      </div>
      <div className="max-h-72 min-h-28 space-y-3 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div key={i} className={cx("flex animate-fade-up", m.role === "user" && "justify-end")}>
            <p className={cx("max-w-[88%] rounded-2xl px-3 py-2 text-sm",
              m.role === "user" ? "bg-brand text-white" : "bg-surface-2")}>{m.content}</p>
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-xs text-muted"><Spinner className="size-3.5" /> {name} is thinking…</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); setInput(""); }} className="flex gap-2 border-t border-line p-2">
        <input className="input py-2" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Talk to ${name}…`} />
        <button type="submit" disabled={busy || !input.trim()}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white disabled:opacity-40" aria-label="Send">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
