"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CircleCheckBig, Hash, MessagesSquare, Plus, Search, ShieldCheck, TrendingUp } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { timeAgo } from "@/lib/time";
import { AuthorLine, KindBadge, LikeButton, ModerationNotice, POST_KINDS } from "@/components/community/shared";
import { Button, Card, ErrorState, PageHeader, PageLoader, cx } from "@/components/ui";

const SORTS = [["hot", "Hot"], ["new", "New"], ["top", "Top"], ["unanswered", "Unanswered"]];

function PostCard({ post }) {
  return (
    <Link href={`/community/${post.id}`} className="card block p-5 transition hover:border-brand/50">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={post.kind} />
        {post.solution_comment_id && (
          <span className="flex items-center gap-1 text-xs font-medium text-ok"><CircleCheckBig className="size-3.5" /> Solved</span>
        )}
        <span className="ml-auto"><AuthorLine author={post.author} at={timeAgo(post.created_at)} /></span>
      </div>
      <h2 className="mt-3 text-lg leading-snug font-semibold">{post.title}</h2>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{post.body}</p>
      {post.moderation && <ModerationNotice moderation={post.moderation} className="mt-3" />}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {post.tags.map((t) => <span key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">#{t}</span>)}
        <span className="ml-auto flex items-center gap-1">
          <LikeButton targetType="post" targetId={post.id} liked={post.liked} count={post.like_count}
            disabled={post.status !== "published"} />
          <span className="flex items-center gap-1 px-2 text-xs text-muted"><MessagesSquare className="size-4" />{post.comment_count}</span>
        </span>
      </div>
    </Link>
  );
}

export default function CommunityPage() {
  const router = useRouter();
  const params = useSearchParams();
  const hackathon = params.get("hackathon");
  const [sort, setSort] = useState("hot");
  const [kind, setKind] = useState("");
  const [tag, setTag] = useState("");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const qs = new URLSearchParams({ sort, ...(kind && { kind }), ...(tag && { tag }), ...(query && { q: query }),
    ...(hackathon && { hackathon }), ...(mine && { mine: "true" }) });
  const { data, error, loading, reload } = useApi(`/api/community/posts?${qs}`);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Community" title="Ask, debate, share wins"
        description="A tech-only space: questions, problems you're stuck on, technical debates and achievements. Every post and comment is checked by our AI moderator."
        actions={<Button href={`/community/new${hackathon ? `?hackathon=${hackathon}` : ""}`}><Plus className="size-4" /> New post</Button>} />

      {hackathon && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-brand/30 bg-brand/10 px-4 py-2 text-sm">
          Showing discussion for one hackathon.
          <button onClick={() => router.push("/community")} className="font-medium text-brand hover:underline">Show everything</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {[["", "All"], ...Object.entries(POST_KINDS).map(([k, v]) => [k, `${v.label}s`])].map(([k, label]) => (
              <button key={k || "all"} onClick={() => setKind(k)}
                className={cx("rounded-full px-3 py-1.5 text-xs font-medium transition",
                  kind === k ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text")}>
                {label}
              </button>
            ))}
            <button onClick={() => setMine(!mine)}
              className={cx("ml-auto rounded-full border px-3 py-1.5 text-xs font-medium",
                mine ? "border-brand bg-brand/15 text-text" : "border-line text-muted hover:text-text")}>
              My posts
            </button>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl border border-line bg-surface p-1">
              {SORTS.map(([k, label]) => (
                <button key={k} onClick={() => setSort(k)}
                  className={cx("rounded-lg px-3 py-1.5 text-xs font-medium", sort === k ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
                  {label}
                </button>
              ))}
            </div>
            <form className="relative min-w-48 flex-1" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts…" />
            </form>
          </div>
          {tag && (
            <p className="mb-3 text-sm text-muted">Tagged <span className="font-medium text-text">#{tag}</span> ·{" "}
              <button onClick={() => setTag("")} className="text-brand hover:underline">clear</button></p>
          )}

          {loading ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : data.posts.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <MessagesSquare className="size-10 text-faint" />
              <p className="font-medium">{mine ? "You haven't posted yet." : "No posts here yet."}</p>
              <p className="max-w-sm text-sm text-muted">Stuck on a bug, prepping for a Toptal screen, or just shipped something? Be the first to post.</p>
              <Button href="/community/new" size="sm"><Plus className="size-4" /> Start a thread</Button>
            </Card>
          ) : (
            <div className="space-y-3">{data.posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="size-4 text-brand-2" /> Trending tags</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(data?.trending_tags || []).length === 0 && <p className="text-xs text-faint">Tags appear as people post.</p>}
              {(data?.trending_tags || []).map((t) => (
                <button key={t} onClick={() => setTag(t)}
                  className={cx("flex items-center gap-0.5 rounded-md px-2 py-1 text-xs",
                    tag === t ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text")}>
                  <Hash className="size-3" />{t}
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-ok" /> Community rules</h3>
            <ul className="mt-3 space-y-2 text-xs text-muted">
              <li>Tech only: code, bugs, interviews, careers, projects, hackathons.</li>
              <li>Debate ideas, not people. Insults get removed.</li>
              <li>No spam, ads or referral links.</li>
              <li>No cheating help for real, live assessments.</li>
              <li>Mark the comment that solved your question.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
