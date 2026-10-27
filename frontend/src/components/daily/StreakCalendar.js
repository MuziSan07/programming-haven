"use client";

import { Flame } from "lucide-react";
import { Card, cx } from "@/components/ui";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function utcDay(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

/** Streak flame plus a 30-day GitHub-style heatmap (columns are weeks, rows are weekdays, Monday first). */
export default function StreakCalendar({ streak, calendar, today }) {
  const solvedCount = calendar.filter((d) => d.solved).length;
  const lead = (utcDay(calendar[0].date).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...calendar];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <Card className="p-6">
      <div className="flex items-center gap-4">
        <div className={cx("flex size-14 shrink-0 items-center justify-center rounded-2xl",
          streak > 0 ? "bg-warn/15 text-warn" : "bg-surface-2 text-faint")}>
          <Flame className="size-7" />
        </div>
        <div>
          <p className="text-3xl font-bold tabular-nums leading-none">
            {streak}<span className="ml-1.5 text-sm font-medium text-muted">day{streak === 1 ? "" : "s"}</span>
          </p>
          <p className="mt-1 text-xs text-muted">Daily challenge streak</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-lg font-semibold tabular-nums">{solvedCount}<span className="text-sm text-faint">/30</span></p>
          <p className="text-[11px] text-muted">last 30 days</p>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <div className="grid grid-rows-7 gap-1.5 text-[10px] leading-none text-faint">
          {WEEKDAYS.map((d, i) => <span key={i} className="flex h-4 items-center">{i % 2 === 0 ? d : ""}</span>)}
        </div>
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-rows-7 gap-1.5">
              {Array.from({ length: 7 }, (_, di) => {
                const day = week[di];
                if (!day) return <span key={di} className="size-4" />;
                const isToday = day.date === today;
                const label = utcDay(day.date).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
                return (
                  <span key={di} title={`${label}: ${day.solved ? "solved" : "not solved"}`}
                    className={cx("size-4 rounded-[4px] border",
                      day.solved ? "border-ok/60 bg-ok/80" : "border-line bg-surface-2",
                      isToday && "ring-2 ring-brand/60 ring-offset-1 ring-offset-surface")} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] border border-ok/60 bg-ok/80" /> Solved</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] border border-line bg-surface-2" /> Missed</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] ring-2 ring-brand/60" /> Today</span>
      </div>
    </Card>
  );
}
