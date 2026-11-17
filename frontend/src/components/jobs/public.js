"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Logo } from "@/components/Logo";
import { JobCard } from "./shared";

/** Top bar for the public job pages. */
export function PublicHeader() {
  const { user } = useAuth();
  const home = user ? (user.account_type === "seeker" ? "/seeker" : "/dashboard") : null;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/jobs" className="px-3 py-2 text-muted hover:text-text">Jobs</Link>
          {home ? (
            <Link href={home} className="rounded-xl bg-brand px-4 py-2 font-medium text-white hover:bg-brand/90">
              {user.account_type === "seeker" ? "My applications" : "My dashboard"}
            </Link>
          ) : (
            <>
              <Link href="/login?next=/jobs" className="px-3 py-2 text-muted hover:text-text">Sign in</Link>
              <Link href="/register?type=seeker&next=/jobs" className="rounded-xl bg-brand px-4 py-2 font-medium text-white hover:bg-brand/90">
                Join as a Job Seeker
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function PublicPage({ children }) {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}

/** Home page section: the latest open roles. Hidden when nothing is open. */
export function OpenRoles() {
  const { data } = useApi("/api/jobs");
  const jobs = data?.jobs || [];
  if (!jobs.length) return null;
  return (
    <section id="jobs" className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-brand uppercase">
            <BriefcaseBusiness className="size-4" /> Open roles
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Hiring now, vetted by Haven</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Companies hire through us. Apply free with a Job Seeker account, complete our AI vetting, and the best
            candidates go straight to the hiring team.
          </p>
        </div>
        <Link href="/jobs" className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-brand hover:underline">
          See all {jobs.length} role{jobs.length === 1 ? "" : "s"} <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {jobs.slice(0, 6).map((j) => <JobCard key={j.id} job={j} href={`/jobs/${j.id}`} />)}
      </div>
    </section>
  );
}
