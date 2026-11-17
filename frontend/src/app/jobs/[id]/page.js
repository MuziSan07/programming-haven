"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { ErrorState, PageLoader } from "@/components/ui";
import { JobDetail } from "@/components/jobs/shared";
import { PublicPage } from "@/components/jobs/public";

function Job() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/api/jobs/${id}`);
  if (loading) return <PageLoader label="Loading job" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <JobDetail job={data} />;
}

export default function JobPage() {
  return (
    <PublicPage>
      <Link href="/jobs" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> All jobs
      </Link>
      <Suspense fallback={<PageLoader label="Loading job" />}><Job /></Suspense>
    </PublicPage>
  );
}
