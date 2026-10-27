"use client";

import Avatar from "@/components/Avatar";
import { cx } from "@/components/ui";

/**
 * Two panelists side by side. `voices` maps persona id -> { level, utterance } from that persona's speaker;
 * `speakingId` is whoever is talking right now.
 */
export default function PanelStage({ panel, speakingId, voices, phase, size = 220 }) {
  return (
    <div className="flex w-full flex-wrap items-start justify-center gap-4 sm:gap-8">
      {panel.map((p, i) => {
        const speaking = speakingId === p.id;
        const state = speaking ? "speaking" : phase === "listening" ? "listening"
          : phase === "thinking" || phase === "transcribing" ? "thinking" : "idle";
        return (
          <div key={p.id} className={cx("flex flex-col items-center gap-2 transition-opacity duration-300",
            speakingId && !speaking && "opacity-60")}>
            <div className={cx("rounded-2xl p-1 transition", speaking ? "bg-brand/25 ring-2 ring-brand" : "ring-1 ring-transparent")}>
              <Avatar persona={p} size={size} state={state} level={voices[p.id]?.level || 0}
                utterance={voices[p.id]?.utterance} />
            </div>
            <div className="text-center">
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                {speaking && <span className="size-1.5 animate-pulse rounded-full bg-brand" />}
                {p.name}
              </p>
              <p className="text-xs text-muted">{p.title} · {i === 0 ? "Technical lead" : "Behavioural lead"}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
