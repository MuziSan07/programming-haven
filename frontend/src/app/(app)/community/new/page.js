"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, Eye, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ModerationNotice, POST_KINDS } from "@/components/community/shared";
import { Button, Card, Markdown, cx } from "@/components/ui";

const PLACEHOLDERS = {
  question: "What are you trying to do, what did you try, and what happened? Include code and the exact error.",
  discussion: "Share a technical opinion or start a debate. Give your reasoning so people can push back.",
  problem: "Describe the problem, constraints and your current approach. Add code in ``` blocks.",
  achievement: "What did you achieve and how? Share what helped, so others can learn from it.",
};

export default function NewPostPage() {
  const router = useRouter();
  const params = useSearchParams();
  const hackathonId = params.get("hackathon");
  const { refresh } = useAuth();
  const [form, setForm] = useState({ kind: "question", title: "", body: "", tags: "" });
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [held, setHeld] = useState(null); // post the moderator didn't publish

  const payload = () => ({
    kind: form.kind, title: form.title, body: form.body,
    tags: form.tags.split(/[,\s]+/).filter(Boolean), ...(hackathonId && !held && { hackathon_id: Number(hackathonId) }),
  });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const post = held
        ? await api(`/api/community/posts/${held.id}`, { method: "PATCH", body: { title: form.title, body: form.body, tags: payload().tags } })
        : await api("/api/community/posts", { body: payload() });
      if (post.status === "published") {
        refresh();
        router.push(`/community/${post.id}`);
        return;
      }
      setHeld(post);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <Link href="/community" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> Community
      </Link>
      <h1 className="text-2xl font-bold">{held ? "Edit and resubmit" : "Create a post"}</h1>
      <p className="mt-1 text-sm text-muted">Keep it technical. Our AI moderator checks every post before it goes live.</p>

      {held && <ModerationNotice moderation={held.moderation} className="mt-5" />}

      <form onSubmit={submit} className="mt-6 space-y-5">
        {!held && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(POST_KINDS).map(([k, v]) => {
              const Icon = v.icon;
              return (
                <button type="button" key={k} onClick={() => setForm({ ...form, kind: k })}
                  className={cx("flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-sm font-medium transition",
                    form.kind === k ? "border-brand bg-brand/10" : "border-line hover:border-faint")}>
                  <Icon className="size-5" />{v.label}
                </button>
              );
            })}
          </div>
        )}
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" required minLength={5} maxLength={200} value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={form.kind === "achievement" ? "Passed the Turing technical interview!" : "Be specific, e.g. 'Why is my React effect running twice?'"} />
        </div>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
            <button type="button" onClick={() => setPreview(false)}
              className={cx("flex items-center gap-1 rounded-lg px-3 py-1 text-xs", !preview ? "bg-surface-3 text-text" : "text-muted")}>
              <Pencil className="size-3.5" /> Write
            </button>
            <button type="button" onClick={() => setPreview(true)}
              className={cx("flex items-center gap-1 rounded-lg px-3 py-1 text-xs", preview ? "bg-surface-3 text-text" : "text-muted")}>
              <Eye className="size-3.5" /> Preview
            </button>
            <span className="ml-auto pr-2 text-[11px] text-faint">Markdown and ``` code blocks supported</span>
          </div>
          {preview ? (
            <div className="min-h-56 p-4"><Markdown>{form.body || "_Nothing to preview yet._"}</Markdown></div>
          ) : (
            <textarea className="min-h-56 w-full resize-y bg-transparent p-4 font-mono text-sm outline-none placeholder:text-faint"
              required minLength={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder={PLACEHOLDERS[form.kind]} />
          )}
        </Card>
        <div>
          <label className="label" htmlFor="tags">Tags</label>
          <input id="tags" className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="python, fastapi, interviews (up to 5)" />
        </div>
        {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button href="/community" variant="secondary">Cancel</Button>
          <Button type="submit" loading={busy}>{busy ? "Checking with AI moderator…" : held ? "Resubmit" : "Publish"}</Button>
        </div>
      </form>
    </div>
  );
}
