"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Circle, CircleCheck, CircleDot, Flame } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Badge, Card, DIFFICULTY_TONE, ErrorState, PageHeader, PageLoader, Progress, cx } from "@/components/ui";

const STATUS_ICON = {
  solved: <CircleCheck className="size-4 text-ok" />,
  attempted: <CircleDot className="size-4 text-warn" />,
  todo: <Circle className="size-4 text-faint" />,
};

export default function DsaPage() {
  const { data, error, loading, reload } = useApi("/api/dsa/problems");
  const searchParams = useSearchParams();
  const { data: daily } = useApi("/api/daily");
  const [pattern, setPattern] = useState(() => searchParams.get("pattern") || "All");
  const [difficulty, setDifficulty] = useState("All");
  const [company, setCompany] = useState("All");
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { problems, patterns, companies } = data;
  const activePattern = patterns.includes(pattern) ? pattern : "All";
  const dailySlug = daily?.problem?.slug;
  const solved = problems.filter((p) => p.status === "solved").length;
  const visible = problems.filter((p) => (activePattern === "All" || p.pattern === activePattern) &&
    (difficulty === "All" || p.difficulty === difficulty) && (company === "All" || p.companies.includes(company)));

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="DSA Track" title="Data Structures & Algorithms"
        description="Pattern-based practice with real code execution, hidden test cases and an AI coach that guides without spoiling." />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="p-5 sm:col-span-1">
          <p className="text-xs text-muted">Solved</p>
          <p className="mt-1 text-2xl font-bold">{solved}<span className="text-base text-faint">/{problems.length}</span></p>
          <Progress value={(100 * solved) / problems.length} className="mt-3" />
        </Card>
        {["Easy", "Medium", "Hard"].map((d) => {
          const all = problems.filter((p) => p.difficulty === d);
          const done = all.filter((p) => p.status === "solved").length;
          return (
            <Card key={d} className="p-5">
              <Badge tone={DIFFICULTY_TONE[d]}>{d}</Badge>
              <p className="mt-2 text-xl font-bold">{done}<span className="text-sm text-faint">/{all.length}</span></p>
            </Card>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["All", ...patterns].map((p) => (
          <button key={p} onClick={() => setPattern(p)}
            className={cx("rounded-full px-3 py-1.5 text-xs font-medium transition",
              activePattern === p ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text")}>
            {p}
          </button>
        ))}
        <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company"
          className="ml-auto rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs">
          <option value="All">All companies</option>
          {companies.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty"
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs">
          {["All", "Easy", "Medium", "Hard", "Expert"].map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="w-12 px-4 py-3">Status</th>
              <th className="px-4 py-3">Problem</th>
              <th className="hidden px-4 py-3 sm:table-cell">Pattern</th>
              <th className="px-4 py-3 text-right">Difficulty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((p) => (
              <tr key={p.slug} className="transition hover:bg-surface-2">
                <td className="px-4 py-3.5">{STATUS_ICON[p.status]}</td>
                <td className="px-4 py-3.5">
                  <Link href={`/dsa/${p.slug}`} className="font-medium hover:text-brand">{p.title}</Link>
                  {p.slug === dailySlug && (
                    <Link href="/daily" className="ml-2 inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 align-middle text-[11px] font-medium text-warn">
                      <Flame className="size-3" /> Daily challenge
                    </Link>
                  )}
                  {p.companies.length > 0 && (
                    <p className="mt-0.5 truncate text-[11px] text-faint">{p.companies.slice(0, 4).join(" · ")}</p>
                  )}
                </td>
                <td className="hidden px-4 py-3.5 text-muted sm:table-cell">{p.pattern}</td>
                <td className="px-4 py-3.5 text-right"><Badge tone={DIFFICULTY_TONE[p.difficulty]}>{p.difficulty}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
