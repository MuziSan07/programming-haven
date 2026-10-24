"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Building, Clock, Hammer } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Badge, Card, ErrorState, PageHeader, PageLoader, cx, scoreColor } from "@/components/ui";

const LEVEL_TONE = { Basic: "ok", Intermediate: "cyan", Advanced: "warn", Expert: "bad" };

export default function ProjectsPage() {
  const { data, error, loading, reload } = useApi("/api/projects");
  const [niche, setNiche] = useState("");
  const [level, setLevel] = useState("");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const visible = data.projects.filter((p) => (!niche || p.niche === niche) && (!level || p.level === level));
  const counts = data.projects.reduce((acc, p) => ({ ...acc, [p.niche]: (acc[p.niche] || 0) + 1 }), {});

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <PageHeader eyebrow="Take-Home Projects" title="Real take-home assignments, for every niche"
        description="The projects companies and talent networks actually assign. Build it, submit your code, and get reviewed against the same rubric a senior reviewer would use." />

      <div className="mb-3 flex flex-wrap gap-2">
        {["", ...data.niches].map((n) => (
          <button key={n || "all"} onClick={() => setNiche(n)}
            className={cx("rounded-full px-3 py-1.5 text-xs font-medium transition",
              niche === n ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text")}>
            {n || "All niches"}{n && <span className="ml-1 opacity-60">{counts[n]}</span>}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {["", ...data.levels].map((lv) => (
          <button key={lv || "all"} onClick={() => setLevel(lv)}
            className={cx("rounded-lg border px-3 py-1 text-xs transition",
              level === lv ? "border-brand text-text" : "border-line text-muted hover:text-text")}>
            {lv || "Any level"}
          </button>
        ))}
        <span className="ml-auto text-xs text-faint">{visible.length} project{visible.length === 1 ? "" : "s"}</span>
      </div>

      {visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Hammer className="size-8 text-faint" />
          <p className="text-sm text-muted">No projects match these filters yet.</p>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}
              className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand/50">
              <div className="flex items-center justify-between gap-2">
                <Badge tone="brand">{p.niche}</Badge>
                <Badge tone={LEVEL_TONE[p.level]}>{p.level}</Badge>
              </div>
              <h2 className="mt-4 font-semibold">{p.title}</h2>
              <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted">{p.summary}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(p.tech || []).slice(0, 5).map((t) => (
                  <span key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{t}</span>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
                <span className="flex items-center gap-1"><Clock className="size-3.5" />~{p.hours}h</span>
                {p.companies?.length > 0 && (
                  <span className="flex min-w-0 items-center gap-1 truncate"><Building className="size-3.5 shrink-0" />
                    <span className="truncate">{p.companies.slice(0, 2).join(", ")}</span></span>
                )}
                {p.best_score !== null && p.best_score !== undefined ? (
                  <span className="font-bold" style={{ color: scoreColor(p.best_score) }}>Best {p.best_score}</span>
                ) : (
                  <span className="flex items-center gap-1 font-medium text-brand">Start <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
