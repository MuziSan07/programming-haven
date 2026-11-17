"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { ErrorState, PageLoader } from "@/components/ui";
import { JobDetail } from "@/components/jobs/shared";

export default function SeekerJobPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/api/jobs/${id}`);
  if (loading) return <PageLoader label="Loading job" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <Link href="/seeker/jobs" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> All jobs
      </Link>
      <JobDetail job={data} basePath="/seeker/jobs" />
    </div>
  );
}
