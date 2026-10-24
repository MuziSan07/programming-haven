"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, CircleCheckBig, CornerDownRight, Flag, MessagesSquare, Pencil, Reply, Trash } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { timeAgo } from "@/lib/time";
import { AuthorLine, KindBadge, LikeButton, ModerationNotice } from "@/components/community/shared";
import { Button, Card, ErrorState, Markdown, PageLoader, cx } from "@/components/ui";

const MAX_INDENT = 6;

function countReplies(node) {
  return node.children.reduce((n, c) => n + 1 + countReplies(c), 0);
}

function Composer({ onSubmit, placeholder = "Add to the discussion…", autoFocus, onCancel, initial = "", submitLabel = "Comment" }) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(body);
      setBody("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea className="input min-h-20 resize-y" value={body} onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} maxLength={10000} />
      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>{busy ? "Moderating…" : submitLabel}</Button>
      </div>
    </form>
  );
}

function CommentNode({ node, depth, ctx }) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isSolution = ctx.solutionId === node.id;
  const replies = countReplies(node);

  async function act(fn) {
    try {
      await fn();
      ctx.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className={cx(depth > 0 && depth <= MAX_INDENT && "border-l-2 border-line pl-4")}>
      <div className={cx("rounded-xl p-3", isSolution && "border border-ok/40 bg-ok/5")}>
        <div className="flex flex-wrap items-center gap-2">
          <AuthorLine author={node.author} at={timeAgo(node.created_at)}>
            {node.edited_at && <span className="text-faint">(edited)</span>}
          </AuthorLine>
          {isSolution && <span className="flex items-center gap-1 text-xs font-medium text-ok"><CircleCheckBig className="size-3.5" /> Solution</span>}
          {replies > 0 && (
            <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-xs text-faint hover:text-text">
              {collapsed ? `Show ${replies} repl${replies > 1 ? "ies" : "y"}` : "Collapse"}
            </button>
          )}
        </div>
        {node.deleted ? (
          <p className="mt-1.5 text-sm text-faint italic">This comment was deleted.</p>
        ) : editing ? (
          <div className="mt-2">
            <Composer initial={node.body} submitLabel="Save" autoFocus onCancel={() => setEditing(false)}
              onSubmit={(body) => act(() => api(`/api/community/comments/${node.id}`, { method: "PATCH", body: { body } })
                .then(() => setEditing(false)))} />
          </div>
        ) : (
          <div className="mt-1.5"><Markdown className="text-[13.5px]">{node.body}</Markdown></div>
        )}
        {node.moderation && <ModerationNotice moderation={node.moderation} className="mt-2" />}
        {!node.deleted && !editing && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <LikeButton targetType="comment" targetId={node.id} liked={node.liked} count={node.like_count}
              disabled={node.status !== "published"} />
            {node.status === "published" && (
              <button onClick={() => setReplying(!replying)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text">
                <Reply className="size-3.5" /> Reply
              </button>
            )}
            {ctx.canMarkSolution && node.status === "published" && (
              <button onClick={() => act(() => api(`/api/community/posts/${ctx.postId}/solution/${node.id}`, { method: "POST" }))}
                className={cx("flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-surface-2",
                  isSolution ? "text-ok" : "text-muted hover:text-text")}>
                <CircleCheckBig className="size-3.5" /> {isSolution ? "Unmark solution" : "Mark as solution"}
              </button>
            )}
            {node.mine ? (
              <>
                <button onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" title="Edit">
                  <Pencil className="size-3.5" />
                </button>
                <button onClick={() => confirm("Delete this comment?") && act(() => api(`/api/community/comments/${node.id}`, { method: "DELETE" }))}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-bad" title="Delete">
                  <Trash className="size-3.5" />
                </button>
              </>
            ) : node.status === "published" && (
              <button onClick={() => ctx.report("comment", node.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-warn" title="Report">
                <Flag className="size-3.5" />
              </button>
            )}
          </div>
        )}
        {replying && (
          <div className="mt-2">
            {depth >= MAX_INDENT && (
              <p className="mb-1 flex items-center gap-1 text-[11px] text-faint"><CornerDownRight className="size-3" /> Replying to {node.author?.name}</p>
            )}
            <Composer autoFocus placeholder={`Reply to ${node.author?.name || "this comment"}…`} submitLabel="Reply"
              onCancel={() => setReplying(false)}
              onSubmit={(body) => act(() => api(`/api/community/posts/${ctx.postId}/comments`, { body: { body, parent_id: node.id } })
                .then(() => setReplying(false)))} />
          </div>
        )}
      </div>
      {!collapsed && node.children.length > 0 && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => <CommentNode key={child.id} node={child} depth={depth + 1} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

export default function PostPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { data: post, error, loading, reload } = useApi(`/api/community/posts/${id}`);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState("");

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function report(targetType, targetId) {
    const reason = prompt("Why are you reporting this? (optional)") ?? null;
    if (reason === null) return;
    try {
      await api("/api/community/report", { body: { target_type: targetType, target_id: targetId, reason } });
      setNotice("Thanks. Moderators will take a look.");
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await api(`/api/community/posts/${post.id}`, { method: "PATCH", body: { ...form, tags: form.tags.split(/[,\s]+/).filter(Boolean) } });
      setEditing(false);
      reload();
    } catch (err) {
      setNotice(err.message);
    }
  }

  const ctx = {
    postId: post.id, solutionId: post.solution_comment_id, reload, report,
    canMarkSolution: post.mine && post.kind === "question",
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <Link href="/community" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> Community
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={post.kind} />
          {post.hackathon && (
            <Link href={`/hackathons/${post.hackathon.slug}`} className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs text-[#b4a3ff] hover:underline">
              {post.hackathon.title}
            </Link>
          )}
          <span className="ml-auto"><AuthorLine author={post.author} at={timeAgo(post.created_at)}>
            {post.edited_at && <span className="text-faint">(edited)</span>}
          </AuthorLine></span>
        </div>

        {editing ? (
          <form onSubmit={saveEdit} className="mt-4 space-y-3">
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} minLength={5} required />
            <textarea className="input min-h-48 font-mono" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} minLength={10} required />
            <input className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="tags" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" size="sm">Save & re-check</Button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-bold">{post.title}</h1>
            <div className="mt-4"><Markdown>{post.body}</Markdown></div>
            {post.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {post.tags.map((t) => <span key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">#{t}</span>)}
              </div>
            )}
          </>
        )}
        {post.moderation && <ModerationNotice moderation={post.moderation} className="mt-4" />}

        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-line pt-3">
          <LikeButton targetType="post" targetId={post.id} liked={post.liked} count={post.like_count} disabled={post.status !== "published"} />
          <span className="flex items-center gap-1 px-2 text-xs text-muted"><MessagesSquare className="size-4" />{post.comment_count}</span>
          <span className="ml-auto flex gap-1">
            {post.mine && !editing && (
              <button onClick={() => { setForm({ title: post.title, body: post.body, tags: post.tags.join(", ") }); setEditing(true); }}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text">
                <Pencil className="size-3.5" /> Edit
              </button>
            )}
            {(post.mine || user.is_admin) && (
              <button onClick={async () => {
                if (!confirm("Delete this post and all its comments?")) return;
                await api(`/api/community/posts/${post.id}`, { method: "DELETE" });
                router.push("/community");
              }} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-bad">
                <Trash className="size-3.5" /> Delete
              </button>
            )}
            {!post.mine && post.status === "published" && (
              <button onClick={() => report("post", post.id)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-warn">
                <Flag className="size-3.5" /> Report
              </button>
            )}
          </span>
        </div>
        {notice && <p className="mt-2 text-xs text-muted">{notice}</p>}
      </Card>

      {post.status === "published" && (
        <Card className="mt-5 p-5">
          <h2 className="mb-3 font-semibold">{post.comment_count} comment{post.comment_count === 1 ? "" : "s"}</h2>
          <Composer placeholder={post.kind === "question" ? "Know the answer? Explain it with code…" : "Add to the discussion…"}
            onSubmit={(body) => api(`/api/community/posts/${post.id}/comments`, { body: { body } }).then(reload)} />
          <div className="mt-5 space-y-2">
            {post.comments.length === 0 && <p className="text-sm text-faint">No comments yet. Start the debate.</p>}
            {post.comments.map((c) => <CommentNode key={c.id} node={c} depth={0} ctx={ctx} />)}
          </div>
        </Card>
      )}
    </div>
  );
}
