"use client";

import {
  Award, BookOpen, Bug, ClipboardCheck, Code, Flame, HandHelping, Languages, Layers, Lock, Medal, MessageSquare, Mic,
  Mountain, Rocket, ScanSearch, ShieldCheck, TrendingUp, Trophy,
} from "lucide-react";
import { Progress, cx } from "@/components/ui";

const ICONS = {
  BookOpen, Bug, ClipboardCheck, Code, Flame, HandHelping, Languages, Layers, Medal, MessageSquare, Mic, Mountain, Rocket,
  ScanSearch, ShieldCheck, TrendingUp, Trophy,
};

export const TIER_STYLE = {
  bronze: { label: "Bronze", color: "#cd7f32" },
  silver: { label: "Silver", color: "#c0c0c0" },
  gold: { label: "Gold", color: "#f5c542" },
};

export default function BadgeCard({ badge }) {
  const Icon = ICONS[badge.icon] || Award;
  const tier = TIER_STYLE[badge.tier] || TIER_STYLE.bronze;
  const pct = badge.threshold ? (badge.progress / badge.threshold) * 100 : 0;
  return (
    <div className={cx("card flex flex-col p-5 transition", badge.earned ? "hover:-translate-y-0.5" : "bg-surface/60")}
      style={badge.earned ? { borderColor: `${tier.color}55` } : undefined}>
      <div className="flex items-start justify-between gap-3">
        <span className={cx("relative flex size-12 items-center justify-center rounded-2xl border",
          !badge.earned && "grayscale")}
          style={{
            borderColor: badge.earned ? `${tier.color}88` : "var(--color-line)",
            background: badge.earned ? `${tier.color}1f` : "var(--color-surface-2)",
            color: badge.earned ? tier.color : "var(--color-faint)",
          }}>
          <Icon className="size-6" />
          {!badge.earned && (
            <Lock className="absolute -right-1.5 -bottom-1.5 size-5 rounded-full border border-line bg-surface p-1 text-faint" />
          )}
        </span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase"
          style={{ color: tier.color, background: `${tier.color}1a`, opacity: badge.earned ? 1 : 0.6 }}>
          {tier.label}
        </span>
      </div>
      <p className={cx("mt-4 font-semibold", !badge.earned && "text-muted")}>{badge.title}</p>
      <p className="mt-0.5 text-xs text-muted">{badge.description}</p>
      <div className="mt-auto pt-4">
        {badge.earned ? (
          <p className="text-xs text-faint">
            Earned {badge.awarded_at ? new Date(badge.awarded_at).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""}
          </p>
        ) : (
          <div>
            <div className="mb-1.5 flex justify-between text-[11px] text-faint">
              <span>Progress</span>
              <span className="font-mono tabular-nums">{badge.progress}/{badge.threshold}</span>
            </div>
            <Progress value={pct} className="h-1.5" color="var(--color-faint)" />
          </div>
        )}
      </div>
    </div>
  );
}
