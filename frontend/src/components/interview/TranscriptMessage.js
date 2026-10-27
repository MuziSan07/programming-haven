"use client";

import { useState } from "react";
import { Check, Copy, TextCursorInput } from "lucide-react";
import { cx } from "@/components/ui";

const FENCE = /```[\w+-]*\n?([\s\S]*?)```/g;

/** Text with fenced code blocks removed, for speaking aloud. */
export function spokenText(content) {
  return (content || "").replace(FENCE, " I've put a suggestion in the chat. ").replace(/\s+/g, " ").trim();
}

/** Split a message into text and code parts. */
function parts(content) {
  const out = [];
  let last = 0;
  for (const m of (content || "").matchAll(FENCE)) {
    if (m.index > last) out.push({ type: "text", value: content.slice(last, m.index) });
    out.push({ type: "code", value: m[1].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < (content || "").length) out.push({ type: "text", value: content.slice(last) });
  return out;
}

function Suggestion({ code, onInsert }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-line bg-bg">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1 text-[11px] text-muted">
        <span className="mr-auto font-medium">Suggested change</span>
        {onInsert && (
          <button type="button" onClick={() => onInsert(code)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-text"
            title="Insert at the cursor in the open file">
            <TextCursorInput className="size-3" /> Apply
          </button>
        )}
        <button type="button" onClick={copy} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-text">
          {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-2.5 font-mono text-xs leading-5 text-text"><code>{code}</code></pre>
    </div>
  );
}

/** One transcript bubble. `label` names the speaker (panel interviews); `onInsert` applies code suggestions. */
export default function TranscriptMessage({ turn, label, onInsert, highlight = false }) {
  const candidate = turn.role === "candidate";
  const content = candidate ? turn.content.split("\n\n[Code at this moment")[0] : turn.content;
  return (
    <div className={cx("flex", candidate && "justify-end")}>
      <div className={cx("max-w-[90%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap transition",
        candidate ? "bg-brand text-white" : "bg-surface-2", highlight && "ring-1 ring-brand/60")}>
        {label && (
          <p className={cx("mb-0.5 text-[10px] font-semibold tracking-wide uppercase", candidate ? "text-white/70" : "text-muted")}>
            {label}{turn.interrupts ? " · cuts in" : ""}
          </p>
        )}
        {candidate ? content : parts(content).map((p, i) => (p.type === "code"
          ? <Suggestion key={i} code={p.value} onInsert={onInsert} />
          : <span key={i}>{p.value.trim() ? p.value.replace(/^\n+|\n+$/g, "") : null}</span>))}
      </div>
    </div>
  );
}
