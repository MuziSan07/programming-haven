"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, CircleCheck, Flag, Gavel, ShieldAlert, Trash } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { timeAgo } from "@/lib/time";
import { Badge, Button, Card, ErrorState, PageLoader, cx } from "@/components/ui";

const FILTERS = [
  ["pending", "Needs review"], ["reported", "Reported"], ["rejected", "Rejected by AI"],
  ["published", "Published"], ["removed", "Removed"], ["all", "All"],
];
const STATUS_TONE = { published: "ok", pending: "warn", rejected: "bad", removed: "neutral" };

function QueueItem({ item, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const m = item.moderation || {};

  async function decide(action) {
    setBusy(action);
    try {
      await api(`/api/admin/moderation/${item.type}/${item.id}`, { body: { action, note } });
      onDone();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={item.type === "post" ? "brand" : "cyan"}>{item.type}</Badge>
        <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
        <span className="text-muted">{item.author.name} · {timeAgo(item.created_at)}</span>
        {item.reports.length > 0 && (
          <span className="flex items-center gap-1 text-warn"><Flag className="size-3.5" /> {item.reports.length} report{item.reports.length > 1 ? "s" : ""}</span>
        )}
        <Link href={`/community/${item.post_id}`} className="ml-auto text-brand hover:underline">Open thread</Link>
      </div>
      <p className="mt-2 font-medium">{item.title}</p>
      <p className="mt-1 line-clamp-4 text-sm whitespace-pre-wrap text-muted">{item.body}</p>

      <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <Bot className="size-3.5 text-brand-2" />
          {m.ai ? "AI moderator" : "Heuristic (AI offline)"}: <span className="uppercase">{m.verdict || "n/a"}</span>
          {typeof m.confidence === "number" && <span className="text-faint">· {Math.round(m.confidence * 100)}% confident</span>}
          {(m.categories || []).map((c) => <Badge key={c} tone="bad">{c.replace("_", " ")}</Badge>)}
        </p>
        {m.reason && <p className="mt-1 text-muted">{m.reason}</p>}
        {m.admin_action && <p className="mt-1 text-faint">Admin decision: {m.admin_action}{m.admin_note ? `: ${m.admin_note}` : ""}</p>}
        {item.reports.filter((r) => r.reason).map((r, i) => <p key={i} className="mt-1 text-warn">Report: {r.reason}</p>)}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs py-1.5 text-xs" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note to the author (optional)" />
        <Button size="sm" variant="success" loading={busy === "approve"} onClick={() => decide("approve")} disabled={item.status === "published"}>
          <CircleCheck className="size-3.5" /> Approve
        </Button>
        <Button size="sm" variant="secondary" loading={busy === "reject"} onClick={() => decide("reject")} disabled={item.status === "rejected"}>
          <ShieldAlert className="size-3.5" /> Reject
        </Button>
        <Button size="sm" variant="danger" loading={busy === "remove"} onClick={() => decide("remove")} disabled={item.status === "removed"}>
          <Trash className="size-3.5" /> Remove
        </Button>
      </div>
    </Card>
  );
}

export default function ModerationTab() {
  const [status, setStatus] = useState("pending");
  const { data, error, loading, reload } = useApi(`/api/admin/moderation?status=${status}`);

  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
        <Gavel className="mt-0.5 size-5 shrink-0 text-brand" />
        <p>Every post and comment is checked by the AI moderator before it goes live. Off-topic, spam and abusive content is
          rejected automatically; unclear items and anything reported by 3+ members wait here for you.</p>
      </div>
      {data?.stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[["Published", data.stats.published, "text-ok"], ["Needs review", data.stats.pending, "text-warn"],
            ["Rejected", data.stats.rejected, "text-bad"], ["Removed", data.stats.removed, "text-muted"],
            ["Open reports", data.stats.reported, "text-warn"]].map(([k, v, c]) => (
            <Card key={k} className="p-3">
              <p className="text-[11px] text-muted">{k}</p>
              <p className={cx("text-xl font-bold tabular-nums", c)}>{v}</p>
            </Card>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)}
            className={cx("rounded-full px-3 py-1.5 text-xs font-medium", status === k ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text")}>
            {label}
          </button>
        ))}
      </div>
      {loading ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : data.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Nothing here. The community is behaving. ✨</Card>
      ) : (
        <div className="space-y-3">{data.items.map((i) => <QueueItem key={`${i.type}-${i.id}`} item={i} onDone={reload} />)}</div>
      )}
    </div>
  );
}
