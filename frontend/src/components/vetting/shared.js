import { Briefcase, CircleCheck, CircleDot, CircleMinus, CircleX, ClipboardCheck, Lock, Mic } from "lucide-react";

export const TYPE_META = {
  interview: { label: "AI interview", icon: Mic },
  test: { label: "Proctored test", icon: ClipboardCheck },
  project: { label: "Take-home project", icon: Briefcase },
};

export const STATUS_META = {
  locked: { label: "Locked", tone: "neutral", icon: Lock, ring: "border-line text-faint" },
  ready: { label: "Up next", tone: "brand", icon: CircleDot, ring: "border-brand text-brand" },
  active: { label: "In progress", tone: "warn", icon: CircleDot, ring: "border-warn text-warn" },
  passed: { label: "Passed", tone: "ok", icon: CircleCheck, ring: "border-ok bg-ok/10 text-ok" },
  failed: { label: "Failed", tone: "bad", icon: CircleX, ring: "border-bad bg-bad/10 text-bad" },
  skipped: { label: "Not reached", tone: "neutral", icon: CircleMinus, ring: "border-line text-faint" },
};

export const RUN_STATUS = {
  active: { label: "In progress", tone: "warn" },
  passed: { label: "Passed", tone: "ok" },
  failed: { label: "Rejected", tone: "bad" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const ROLES = [
  "Full Stack Developer", "Frontend Developer", "Backend Developer", "Mobile Developer", "Data Scientist",
  "AI Engineer", "DevOps Engineer", "Data Engineer", "QA Engineer",
];

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatLeft(ms) {
  if (ms <= 0) return "Deadline passed";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h left`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m left`;
}
