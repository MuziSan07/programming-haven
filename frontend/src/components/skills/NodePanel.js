"use client";

import { ArrowRight, Lock, X } from "lucide-react";
import { Badge, Button, Card, Progress, cx } from "@/components/ui";
import { STATUS } from "./SkillGraph";

const STATUS_TONE = { mastered: "ok", in_progress: "brand", available: "neutral", locked: "neutral" };
const BRANCH_UNIT = { dsa: "problems solved", languages: "lessons completed", topics: "questions answered correctly" };

function NodeLink({ node, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect(node.id)}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-surface-2">
      <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS[node.status].color }} />
      <span className="min-w-0 flex-1 truncate">{node.label}</span>
      <span className="text-xs tabular-nums text-muted">{node.mastery}%</span>
    </button>
  );
}

export default function NodePanel({ node, byId, unlock, onSelect, onClose }) {
  const parents = node.parents.map((id) => byId.get(id)).filter(Boolean);
  const children = node.children.map((id) => byId.get(id)).filter(Boolean);
  const weak = parents.filter((p) => p.kind !== "track" && p.kind !== "group" && p.mastery < unlock);
  const s = STATUS[node.status];
  const practiseLabel = node.branch === "dsa"
    ? node.assessment_only ? "Open assessments" : node.next_problem ? `Practise: ${node.next_problem}` : "Browse problems"
    : node.branch === "languages" ? "Open lessons" : "Practise questions";

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-widest text-faint uppercase">
            {node.track || node.group || ({ dsa: "DSA pattern", languages: "Language track", topics: "Topic group" })[node.branch]}
          </p>
          <h3 className="mt-1 text-lg font-semibold leading-snug">{node.label}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close panel"
          className="rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-text">
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <p className="text-4xl font-bold tabular-nums" style={{ color: node.mastery > 0 ? s.color : undefined }}>
          {node.mastery}<span className="text-lg text-faint">%</span>
        </p>
        <Badge tone={STATUS_TONE[node.status]}>
          {node.status === "locked" && <Lock className="size-3" />}{s.label}
        </Badge>
      </div>
      <Progress value={node.mastery} className="mt-3" color={s.color} />
      <p className="mt-2 text-xs text-muted">
        {node.done}/{node.total} {BRANCH_UNIT[node.branch]}
        {node.accuracy != null && ` · ${node.accuracy}% accuracy over ${node.attempted} questions`}
      </p>

      {node.description && <p className="mt-4 text-sm text-muted">{node.description}</p>}
      {node.difficulty_mix && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {Object.entries(node.difficulty_mix).map(([d, n]) => (
            <span key={d} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted">{n} {d}</span>
          ))}
        </div>
      )}

      {node.status === "locked" && weak.length > 0 && (
        <p className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          Unlocks when {weak.map((p) => p.label).join(" and ")} reach{weak.length === 1 ? "es" : ""} {unlock}% mastery.
          You can still practise it now.
        </p>
      )}

      <Button href={node.href} className="mt-5 w-full">
        <span className="truncate">{practiseLabel}</span> <ArrowRight className="size-4" />
      </Button>
      {node.browse_href && node.browse_href !== node.href && (
        <Button href={node.browse_href} variant="ghost" size="sm" className="mt-2 w-full">Browse all {node.label} problems</Button>
      )}

      {[["Builds on", parents], ["Leads to", children]].map(([title, list]) => list.length > 0 && (
        <div key={title} className="mt-5">
          <p className="mb-1 text-[11px] font-semibold tracking-widest text-faint uppercase">{title}</p>
          <div className={cx("-mx-2", list.length > 6 && "max-h-48 overflow-y-auto")}>
            {list.map((n) => <NodeLink key={n.id} node={n} onSelect={onSelect} />)}
          </div>
        </div>
      ))}
    </Card>
  );
}
