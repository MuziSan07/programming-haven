"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { Markdown, Spinner, cx } from "./ui";

const SUGGESTIONS = ["Explain this more simply", "Give me another example", "Why is my answer wrong?"];

/** Chat with Haven, the AI tutor. `context` describes what the learner is looking at. */
export function TutorPanel({ context, onClose, className, title = "Haven AI Tutor" }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm **Haven**, your AI tutor. Ask me anything about what you're learning." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    const history = messages.slice(1);
    setMessages((m) => [...m, { role: "user", content: message }]);
    setBusy(true);
    try {
      const { reply } = await api("/api/ai/tutor", { body: { message, history, context } });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cx("flex h-full flex-col bg-surface", className)}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2">
          <Bot className="size-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted"><Sparkles className="size-3" /> Powered by AI</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Close tutor">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" && "justify-end")}>
            <div className={cx("max-w-[88%] rounded-2xl px-4 py-2.5",
              m.role === "user" ? "bg-brand text-sm text-white" : "bg-surface-2")}>
              {m.role === "user" ? m.content : <Markdown>{m.content}</Markdown>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted"><Spinner className="size-4" /> Haven is thinking…</div>
        )}
        <div ref={endRef} />
      </div>
      {messages.length < 3 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-brand hover:text-text">
              {s}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t border-line p-3">
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Haven…" />
        <button type="submit" disabled={busy || !input.trim()}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white disabled:opacity-40"
          aria-label="Send">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

/** Slide-over drawer version for lesson pages. */
export function TutorDrawer({ open, onClose, context }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-md animate-pop border-l border-line shadow-2xl">
        <TutorPanel context={context} onClose={onClose} />
      </div>
    </div>
  );
}
