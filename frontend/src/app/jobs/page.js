"use client";

import { useApi } from "@/lib/useApi";
import { ErrorState, PageLoader } from "@/components/ui";
import { JobBoard } from "@/components/jobs/shared";
import { PublicPage } from "@/components/jobs/public";

export default function JobsPage() {
  const { data, error, loading, reload } = useApi("/api/jobs");
  return (
    <PublicPage>
      <p className="text-xs font-semibold tracking-widest text-brand uppercase">Jobs</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Open roles</h1>
      <p className="mt-2 mb-8 max-w-2xl text-muted">
        Roles posted by the Programming Haven team for companies that hire through us. Read the job description,
        then sign up free as a Job Seeker to apply and go through AI vetting.
      </p>
      {loading && <PageLoader label="Loading jobs" />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && <JobBoard jobs={data.jobs} hrefFor={(j) => `/jobs/${j.id}`} />}
    </PublicPage>
  );
}
