"use client";

import { useState } from "react";
import { Award, Bug, CircleQuestionMark, Heart, MessagesSquare, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, cx } from "@/components/ui";

export const POST_KINDS = {
  question: { label: "Question", icon: CircleQuestionMark, tone: "cyan" },
  discussion: { label: "Discussion", icon: MessagesSquare, tone: "brand" },
  problem: { label: "Problem", icon: Bug, tone: "warn" },
  achievement: { label: "Achievement", icon: Award, tone: "ok" },
};

export function KindBadge({ kind }) {
  const k = POST_KINDS[kind] || POST_KINDS.discussion;
  const Icon = k.icon;
  return <Badge tone={k.tone}><Icon className="size-3" />{k.label}</Badge>;
}

export function AuthorLine({ author, at, children }) {
  if (!author) return <span className="text-xs text-faint">[deleted]</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-[10px]
        font-bold text-white">{author.name[0]}</span>
      <span className="font-medium text-text">{author.name}</span>
      <span className="rounded bg-surface-3 px-1.5 text-[10px]">Lv {author.level}</span>
      {at && <span className="text-faint">· {at}</span>}
      {children}
    </span>
  );
}

/** Toggle a like on a post or comment, optimistically. */
export function LikeButton({ targetType, targetId, liked: initialLiked, count: initialCount, disabled }) {
  const [state, setState] = useState({ liked: initialLiked, count: initialCount });
  const [busy, setBusy] = useState(false);

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || disabled) return;
    const optimistic = { liked: !state.liked, count: state.count + (state.liked ? -1 : 1) };
    setState(optimistic);
    setBusy(true);
    try {
      const r = await api("/api/community/like", { body: { target_type: targetType, target_id: targetId } });
      setState({ liked: r.liked, count: r.like_count });
    } catch {
      setState(state);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={toggle} disabled={disabled}
      className={cx("flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition disabled:opacity-40",
        state.liked ? "text-bad" : "text-muted hover:bg-surface-2 hover:text-text")}
      aria-pressed={state.liked} aria-label="Like">
      <Heart className="size-4" fill={state.liked ? "currentColor" : "none"} />
      {state.count}
    </button>
  );
}

/** Explains what the AI moderator decided, shown to the author (and admins). */
export function ModerationNotice({ moderation, className }) {
  if (!moderation || moderation.status === "published") return null;
  const pending = moderation.status === "pending";
  return (
    <div className={cx("flex gap-2 rounded-xl border px-3 py-2 text-sm",
      pending ? "border-warn/40 bg-warn/10 text-warn" : "border-bad/40 bg-bad/10 text-bad", className)}>
      {pending ? <ShieldCheck className="mt-0.5 size-4 shrink-0" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0" />}
      <div>
        <p className="font-medium">
          {pending ? "Waiting for review: only you can see this for now" : moderation.status === "removed"
            ? "Removed by a moderator" : "Not published by our AI moderator"}
        </p>
        {moderation.reason && <p className="text-xs opacity-90">{moderation.reason}</p>}
        {!pending && moderation.status === "rejected" && (
          <p className="mt-1 text-xs opacity-80">Programming Haven is for tech. Edit it to focus on a technical question,
            problem or achievement and it will be checked again.</p>
        )}
      </div>
    </div>
  );
}
