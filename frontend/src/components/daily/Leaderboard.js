"use client";

import { Trophy, Users } from "lucide-react";
import TechLogo from "@/components/TechLogo";
import { Card, cx } from "@/components/ui";

const MEDALS = {
  1: { ring: "#e8b84a", bg: "rgba(232,184,74,0.14)", text: "#f2cd72", label: "Gold" },
  2: { ring: "#aab4c5", bg: "rgba(170,180,197,0.14)", text: "#c9d1de", label: "Silver" },
  3: { ring: "#c98450", bg: "rgba(201,132,80,0.14)", text: "#e0a177", label: "Bronze" },
};

function RankBadge({ rank }) {
  const medal = MEDALS[rank];
  if (!medal) {
    return <span className="flex size-8 items-center justify-center text-sm font-semibold tabular-nums text-muted">{rank}</span>;
  }
  return (
    <span title={medal.label} className="flex size-8 items-center justify-center rounded-full text-sm font-bold tabular-nums"
      style={{ background: medal.bg, color: medal.text, boxShadow: `inset 0 0 0 1.5px ${medal.ring}` }}>
      {rank}
    </span>
  );
}

function Row({ row, pinned }) {
  return (
    <li className={cx("flex items-center gap-3 px-5 py-3", row.me && "bg-brand/[0.07]", pinned && "border-t border-dashed border-line")}>
      <RankBadge rank={row.rank} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {row.name}
          {row.me && <span className="ml-2 text-xs font-normal text-brand">You</span>}
        </p>
        <p className="text-[11px] text-faint">Level {row.level}</p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="font-mono text-sm tabular-nums">{row.time_after_reset}</p>
        <p className="text-[11px] text-faint">after reset</p>
      </div>
      <div className="w-16 text-right">
        <p className="text-sm tabular-nums">{row.attempts}</p>
        <p className="text-[11px] text-faint">attempt{row.attempts === 1 ? "" : "s"}</p>
      </div>
      <TechLogo slug={row.language} label={row.language} size={26} />
    </li>
  );
}

export default function Leaderboard({ rows, myRow, solvers }) {
  const showPinned = myRow && !rows.some((r) => r.me);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold"><Trophy className="size-4 text-warn" /> Today&apos;s leaderboard</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted"><Users className="size-3.5" /> {solvers} solved</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-medium">Nobody has solved it yet</p>
          <p className="mt-1 text-sm text-muted">The first accepted submission takes the top spot. Earliest wins, fewer attempts break ties.</p>
        </div>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((r) => <Row key={r.rank} row={r} />)}
          {showPinned && <Row row={myRow} pinned />}
        </ol>
      )}
      <p className="border-t border-line px-5 py-3 text-[11px] text-faint">
        Ranked by time since the 00:00 UTC reset. Ties go to fewer attempts.
      </p>
    </Card>
  );
}
