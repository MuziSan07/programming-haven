"use client";

import { Medal } from "lucide-react";
import { Badge, cx } from "@/components/ui";

const PODIUM = ["#f5c542", "#c0c0c0", "#cd7f32"];

/** Contest standings: rank, name, solved, score, penalty. */
export default function ContestLeaderboard({ rows, meId, maxScore, compact = false }) {
  if (!rows?.length) {
    return <p className="p-4 text-sm text-faint">No one has started this contest yet. Be the first on the board.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[340px]">
        <div className="grid grid-cols-[3rem_1fr_3.5rem_4rem_4.5rem] items-center gap-2 border-b border-line px-4 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
          <span>Rank</span><span>Name</span><span className="text-right">Solved</span>
          <span className="text-right">Score</span><span className="text-right">Penalty</span>
        </div>
        {rows.map((r) => {
          const me = r.user.id === meId;
          return (
            <div key={r.user.id}
              className={cx("grid grid-cols-[3rem_1fr_3.5rem_4rem_4.5rem] items-center gap-2 border-t border-line/60 px-4 text-sm",
                compact ? "py-2" : "py-2.5", me && "bg-brand/10 font-semibold shadow-[inset_3px_0_0_var(--color-brand)]")}>
              <span className="flex items-center gap-1 font-mono text-muted tabular-nums">
                {r.rank <= 3 ? <Medal className="size-4" style={{ color: PODIUM[r.rank - 1] }} /> : `#${r.rank}`}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{r.user.name}</span>
                {me && <Badge tone="brand">You</Badge>}
                {!compact && <span className="hidden text-xs font-normal text-faint sm:inline">Lv {r.user.level}</span>}
              </span>
              <span className="text-right font-mono text-muted tabular-nums">{r.solved}</span>
              <span className="text-right font-mono tabular-nums">
                {r.score}{maxScore ? <span className="text-faint">/{maxScore}</span> : null}
              </span>
              <span className="text-right font-mono text-muted tabular-nums">{r.penalty}m</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
