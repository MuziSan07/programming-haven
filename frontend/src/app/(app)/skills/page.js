"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Code, Languages, Lock, MessageSquare, Route } from "lucide-react";
import { useApi } from "@/lib/useApi";
import NodePanel from "@/components/skills/NodePanel";
import SkillGraph, { STATUS } from "@/components/skills/SkillGraph";
import { Card, ErrorState, PageHeader, PageLoader, Progress, cx } from "@/components/ui";

const BRANCH_ICON = { dsa: Code, languages: Languages, topics: MessageSquare };
const BRANCH_LABEL = { dsa: "DSA", languages: "Languages", topics: "Interview topics" };

function Recommended({ items, onShow }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((r, i) => {
        const Icon = BRANCH_ICON[r.branch];
        return (
          <Card key={r.id} className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-faint uppercase">
                <Icon className="size-3.5" /> {BRANCH_LABEL[r.branch]}
              </span>
              <span className="text-[11px] tabular-nums text-faint">#{i + 1}</span>
            </div>
            <h3 className="mt-2 truncate font-semibold">{r.label}</h3>
            <p className="mt-0.5 text-xs text-muted">{r.reason}</p>
            <div className="mt-4 flex items-center gap-3">
              <Progress value={r.mastery} className="h-1.5 flex-1" color={STATUS[r.status].color} />
              <span className="text-xs tabular-nums text-muted">{r.mastery}%</span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={() => onShow(r)} className="text-xs font-medium text-muted transition hover:text-text">
                Show on map
              </button>
              <Link href={r.href} className="group flex items-center gap-1 text-sm font-medium text-brand">
                Practise <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
      {Object.entries(STATUS).map(([key, s]) => (
        <span key={key} className="flex items-center gap-2">
          <span className="relative flex size-4 items-center justify-center rounded-full border-2"
            style={{ borderColor: key === "available" || key === "locked" ? "var(--color-surface-3)" : s.color }}>
            {key === "mastered" && <Check className="size-2.5 text-ok" strokeWidth={3.5} />}
            {key === "locked" && <Lock className="size-2.5 text-faint" strokeWidth={3} />}
          </span>
          {s.label}
        </span>
      ))}
      <span className="flex items-center gap-2">
        <svg width="26" height="8" aria-hidden="true"><path d="M1 4 H25" stroke="var(--color-line)" strokeWidth="1.5" strokeDasharray="4 5" /></svg>
        Prerequisite not met
      </span>
    </div>
  );
}

function BranchSummary({ summary, branch, unlock }) {
  const b = summary.branches[branch];
  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold tracking-widest text-faint uppercase">{BRANCH_LABEL[branch]}</p>
      <p className="mt-2 text-4xl font-bold tabular-nums">{b.mastery}<span className="text-lg text-faint">%</span></p>
      <p className="text-xs text-muted">average mastery across {b.nodes} skills</p>
      <div className="mt-5 space-y-2.5">
        {["mastered", "in_progress", "available", "locked"].map((k) => (
          <div key={k} className="flex items-center gap-3 text-sm">
            <span className="size-2 rounded-full" style={{ background: STATUS[k].color }} />
            <span className="flex-1 text-muted">{STATUS[k].label}</span>
            <span className="tabular-nums">{b[k]}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-faint">
        Select a skill to see what it builds on and where it leads. A skill unlocks once each prerequisite reaches {unlock}%
        mastery; 80% counts as mastered.
      </p>
    </Card>
  );
}

export default function SkillsPage() {
  const { data, error, loading, reload } = useApi("/api/skills/tree");
  const [branch, setBranch] = useState("dsa");
  const [selectedId, setSelectedId] = useState(null);

  const byId = useMemo(() => new Map((data?.nodes || []).map((n) => [n.id, n])), [data]);
  const branchNodes = useMemo(() => (data?.nodes || []).filter((n) => n.branch === branch), [data, branch]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const selected = selectedId ? byId.get(selectedId) : null;
  const { summary, thresholds } = data;

  function switchBranch(id) {
    setBranch(id);
    setSelectedId(null);
  }
  function selectNode(id) {
    const node = id && byId.get(id);
    if (node && node.branch !== branch) setBranch(node.branch);
    setSelectedId(id);
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <PageHeader eyebrow="Skill tree" title="Your interview skill map"
        description="Every pattern, language and interview topic as one map. Mastery comes from what you actually solved, completed and answered, so the map always shows the honest picture."
        actions={(
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-2.5">
            <Route className="size-4 text-brand" />
            <div>
              <p className="text-sm font-semibold tabular-nums">{summary.mastered}/{Object.values(summary.branches).reduce((n, b) => n + b.nodes, 0)}</p>
              <p className="text-[11px] text-muted">skills mastered</p>
            </div>
            <div className="h-8 w-px bg-line" />
            <div>
              <p className="text-sm font-semibold tabular-nums">{summary.mastery}%</p>
              <p className="text-[11px] text-muted">overall</p>
            </div>
          </div>
        )} />

      {data.recommended.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Recommended next</h2>
          <Recommended items={data.recommended} onShow={(r) => selectNode(r.id)} />
        </section>
      )}

      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
          {data.branches.map((b) => {
            const Icon = BRANCH_ICON[b.id];
            const s = summary.branches[b.id];
            return (
              <button key={b.id} type="button" onClick={() => switchBranch(b.id)}
                className={cx("flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
                  branch === b.id ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
                <Icon className="size-4" /> {b.label}
                <span className="text-xs tabular-nums text-faint">{s.mastered}/{s.nodes}</span>
              </button>
            );
          })}
        </div>
        <Legend />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <SkillGraph key={branch} nodes={branchNodes} selectedId={selected?.branch === branch ? selectedId : null}
            onSelect={setSelectedId} />
        </Card>
        <div className="hidden lg:block">
          {selected ? (
            <NodePanel node={selected} byId={byId} unlock={thresholds.unlock} onSelect={selectNode}
              onClose={() => setSelectedId(null)} />
          ) : (
            <BranchSummary summary={summary} branch={branch} unlock={thresholds.unlock} />
          )}
        </div>
      </div>

      {/* Bottom sheet on small screens */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto p-3 lg:hidden">
          <div className="shadow-2xl shadow-black/60">
            <NodePanel node={selected} byId={byId} unlock={thresholds.unlock} onSelect={selectNode}
              onClose={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
