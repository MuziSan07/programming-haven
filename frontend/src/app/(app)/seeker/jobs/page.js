"use client";

import { useApi } from "@/lib/useApi";
import { ErrorState, PageHeader, PageLoader } from "@/components/ui";
import { JobBoard } from "@/components/jobs/shared";

export default function SeekerJobsPage() {
  const { data, error, loading, reload } = useApi("/api/jobs");
  if (loading) return <PageLoader label="Loading jobs" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader eyebrow="Jobs" title="Browse open roles"
        description="Every role is posted by the Programming Haven team. Pick one, read the description and apply: vetting starts straight away." />
      <JobBoard jobs={data.jobs} hrefFor={(j) => `/seeker/jobs/${j.id}`} />
    </div>
  );
}
