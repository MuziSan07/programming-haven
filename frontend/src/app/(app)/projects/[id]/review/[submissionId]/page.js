"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { ErrorState, PageLoader } from "@/components/ui";
import { RepoReview, RepoReviewList } from "@/components/projects/RepoReview";
import VettingBanner from "@/components/vetting/VettingBanner";

export default function RepoReviewPage() {
  const { id, submissionId } = useParams();
  const sub = useApi(`/api/projects/${id}/submissions/${submissionId}`);
  const project = useApi(`/api/projects/${id}`);

  if (sub.loading || project.loading) return <PageLoader label="Loading review" />;
  if (sub.error) return <ErrorState error={sub.error} onRetry={sub.reload} />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.reload} />;

  const s = sub.data;
  const p = project.data;
  const others = (p.submissions || []).filter((x) => x.id !== s.id);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <Link href={`/projects/${id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> {p.title}
      </Link>
      <VettingBanner />
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold tracking-widest text-brand uppercase">Repository review</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{s.repo?.full_name || s.repo_url}</h1>
        <p className="mt-1 text-sm text-muted">Reviewed {new Date(s.created_at).toLocaleString()} against the {p.title} brief.</p>
      </div>
      {s.kind === "repo" ? (
        <RepoReview submission={s} rubric={p.rubric} />
      ) : (
        <p className="text-sm text-muted">This submission was pasted code, not a repository. Open it from the project page.</p>
      )}
      {others.length > 0 && <div className="mt-5"><RepoReviewList projectId={id} submissions={others} /></div>}
    </div>
  );
}
