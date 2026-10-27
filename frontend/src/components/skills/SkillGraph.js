"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Lock, Minus, Plus } from "lucide-react";
import { NODE_H, NODE_W, computeLayout, edgePath } from "./layout";

export const STATUS = {
  mastered: { label: "Mastered", color: "var(--color-ok)" },
  in_progress: { label: "In progress", color: "var(--color-brand)" },
  available: { label: "Available", color: "var(--color-muted)" },
  locked: { label: "Locked", color: "var(--color-faint)" },
};

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;
const ZOOMS = [0.7, 0.85, 1, 1.15];

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function Node({ node, pos, selected, related, dimmed, onSelect }) {
  const s = STATUS[node.status];
  const aggregate = node.kind === "track" || node.kind === "group";
  const locked = node.status === "locked";
  const cx = pos.x + 28;
  const cy = pos.y + NODE_H / 2;
  return (
    <g role="button" tabIndex={0} aria-label={`${node.label}, ${s.label}, ${node.mastery}% mastery`}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(node.id); } }}
      className="cursor-pointer outline-none"
      style={{ opacity: dimmed ? 0.35 : locked ? 0.62 : 1, transition: "opacity 200ms" }}>
      <title>{`${node.label}: ${node.mastery}% (${node.done}/${node.total})`}</title>
      {selected && (
        <rect x={pos.x - 4} y={pos.y - 4} width={NODE_W + 8} height={NODE_H + 8} rx={17}
          fill="none" stroke="var(--color-brand)" strokeOpacity={0.45} strokeWidth={2} />
      )}
      <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={14}
        fill={aggregate ? "var(--color-surface-2)" : "var(--color-surface)"}
        stroke={selected ? "var(--color-brand)" : related ? "var(--color-muted)" : node.status === "mastered"
          ? "color-mix(in srgb, var(--color-ok) 45%, transparent)"
          : node.status === "in_progress" ? "color-mix(in srgb, var(--color-brand) 45%, transparent)" : "var(--color-line)"}
        strokeWidth={selected ? 1.75 : 1.25} />
      {aggregate && <rect x={pos.x} y={pos.y + 14} width={3} height={NODE_H - 28} rx={1.5} fill={s.color} />}

      <circle cx={cx} cy={cy} r={RING_R} fill="none" stroke="var(--color-surface-3)" strokeWidth={3.5} />
      {node.mastery > 0 && (
        <circle cx={cx} cy={cy} r={RING_R} fill="none" stroke={s.color} strokeWidth={3.5} strokeLinecap="round"
          strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - node.mastery / 100)}
          transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dashoffset 800ms ease-out" }} />
      )}
      {locked ? (
        <Lock x={cx - 7} y={cy - 7} width={14} height={14} color="var(--color-faint)" strokeWidth={2.25} />
      ) : node.status === "mastered" ? (
        <Check x={cx - 7} y={cy - 7} width={14} height={14} color="var(--color-ok)" strokeWidth={3} />
      ) : (
        <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={600}
          fill={node.mastery > 0 ? "var(--color-text)" : "var(--color-faint)"} className="tabular-nums">
          {node.mastery}
        </text>
      )}

      <text x={pos.x + 54} y={pos.y + 24} fontSize={13} fontWeight={600} fill="var(--color-text)">
        {truncate(node.label, 18)}
      </text>
      <text x={pos.x + 54} y={pos.y + 41} fontSize={11} fill="var(--color-muted)">
        {aggregate ? `${node.done}/${node.total} · overview` : `${node.done}/${node.total} · ${s.label}`}
      </text>
    </g>
  );
}

export default function SkillGraph({ nodes, selectedId, onSelect }) {
  const layout = useMemo(() => computeLayout(nodes), [nodes]);
  const [zoom, setZoom] = useState(2);
  const scrollRef = useRef(null);
  const drag = useRef(null);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const selected = selectedId ? byId.get(selectedId) : null;
  const related = new Set(selected ? [...selected.parents, ...(layout.children.get(selected.id) || [])] : []);
  const scale = ZOOMS[zoom];

  // Mouse drag to pan; touch keeps native scrolling
  function onPointerDown(e) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = scrollRef.current;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    scrollRef.current.scrollLeft = d.left - dx;
    scrollRef.current.scrollTop = d.top - dy;
  }
  function endDrag() {
    const d = drag.current;
    // Swallow the click that ends a drag so panning never selects a node
    if (d?.moved) setTimeout(() => { drag.current = null; }, 0);
    else drag.current = null;
  }
  function select(id) {
    if (drag.current?.moved) return;
    onSelect(id === selectedId ? null : id);
  }

  return (
    <div className="relative">
      <div ref={scrollRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="max-h-[68vh] min-h-[320px] cursor-grab overflow-auto overscroll-contain active:cursor-grabbing"
        style={{
          backgroundImage: "radial-gradient(var(--color-line) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}>
        <svg width={layout.width * scale} height={layout.height * scale}
          viewBox={`0 0 ${layout.width} ${layout.height}`} className="block select-none"
          onClick={(e) => { if (e.target === e.currentTarget && !drag.current?.moved) onSelect(null); }}>
          <g>
            {layout.edges.map(({ from, to }) => {
              const a = layout.positions.get(from);
              const b = layout.positions.get(to);
              const child = byId.get(to);
              const parent = byId.get(from);
              const hot = selected && (from === selected.id || to === selected.id);
              const stroke = hot ? "var(--color-brand)" : parent.status === "mastered" ? "var(--color-ok)" : "var(--color-line)";
              return (
                <path key={`${from}>${to}`} d={edgePath(a, b)} fill="none" stroke={stroke}
                  strokeOpacity={hot ? 0.9 : parent.status === "mastered" ? 0.5 : 1}
                  strokeWidth={hot ? 2 : 1.5} strokeDasharray={child.status === "locked" && !hot ? "4 5" : undefined} />
              );
            })}
          </g>
          {nodes.map((n) => (
            <Node key={n.id} node={n} pos={layout.positions.get(n.id)} selected={n.id === selectedId}
              related={related.has(n.id)} dimmed={!!selected && n.id !== selectedId && !related.has(n.id)}
              onSelect={select} />
          ))}
        </svg>
      </div>
      <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-lg border border-line bg-surface/90 backdrop-blur">
        <button type="button" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}
          className="flex size-8 items-center justify-center text-muted transition hover:bg-surface-2 hover:text-text disabled:opacity-40">
          <Minus className="size-4" />
        </button>
        <span className="flex w-12 items-center justify-center border-x border-line text-[11px] tabular-nums text-muted">
          {Math.round(scale * 100)}%
        </span>
        <button type="button" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1}
          onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
          className="flex size-8 items-center justify-center text-muted transition hover:bg-surface-2 hover:text-text disabled:opacity-40">
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
