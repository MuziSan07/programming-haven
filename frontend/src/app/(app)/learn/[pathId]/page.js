"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, ChevronLeft, Lock, Star } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { ErrorState, PageLoader, cx } from "@/components/ui";

// Zig-zag offsets for the Duolingo-style path
const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56];

export default function PathPage() {
  const { pathId } = useParams();
  const { data: path, error, loading, reload } = useApi(`/api/learn/paths/${pathId}`);
  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const allLessons = path.units.flatMap((u) => u.lessons);
  const current = allLessons.find((l) => !l.completed && !l.locked);

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <Link href="/learn" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" /> All paths
      </Link>
      <div className="mb-10 flex items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-2xl text-4xl"
          style={{ background: `${path.color}22` }}>{path.icon}</span>
        <div>
          <h1 className="text-3xl font-bold">{path.title}</h1>
          <p className="text-sm text-muted">{path.description}</p>
        </div>
      </div>

      {path.units.map((unit, u) => (
        <section key={unit.id} className="mb-12">
          <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(110deg, ${path.color}, #7c5cff)` }}>
            <p className="text-xs font-semibold tracking-widest uppercase opacity-80">Unit {u + 1} · {unit.level}</p>
            <h2 className="text-xl font-bold">{unit.title}</h2>
            <p className="text-sm opacity-90">{unit.description}</p>
          </div>
          <div className="mt-8 flex flex-col items-center gap-6">
            {unit.lessons.map((lesson) => {
              const offset = OFFSETS[allLessons.indexOf(lesson) % OFFSETS.length];
              const isCurrent = current?.id === lesson.id;
              const node = (
                <div className="flex flex-col items-center gap-2" style={{ transform: `translateX(${offset}px)` }}>
                  <div className="relative">
                    {isCurrent && (
                      <span className="absolute -top-9 left-1/2 -translate-x-1/2 animate-bounce rounded-lg border
                        border-line bg-surface px-3 py-1 text-xs font-bold whitespace-nowrap text-brand">START</span>
                    )}
                    <div className={cx(
                      "flex size-[72px] items-center justify-center rounded-full border-b-[6px] transition",
                      lesson.completed && "border-[#b45309] bg-warn text-white",
                      isCurrent && "border-[#5b3fd9] bg-brand text-white ring-8 ring-brand/20 hover:scale-105",
                      lesson.locked && "border-surface-2 bg-surface-3 text-faint",
                    )}>
                      {lesson.completed ? <Check className="size-8" strokeWidth={3} /> :
                        lesson.locked ? <Lock className="size-6" /> : <Star className="size-8" fill="currentColor" />}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className={cx("text-sm font-semibold", lesson.locked && "text-faint")}>{lesson.title}</p>
                    <p className="text-xs text-faint">{lesson.minutes} min · {lesson.steps} steps</p>
                  </div>
                </div>
              );
              return lesson.locked ? (
                <div key={lesson.id} className="cursor-not-allowed">{node}</div>
              ) : (
                <Link key={lesson.id} href={`/learn/lesson/${lesson.id}`}>{node}</Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
