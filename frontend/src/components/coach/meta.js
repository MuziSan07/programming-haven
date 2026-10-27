import {
  BookOpen, Briefcase, Bug, ClipboardCheck, Code, Layers, MessageSquare, Mic, ScanSearch,
} from "lucide-react";

/** Icon, label and accent colour for each plan task type. */
export const TASK_META = {
  problem: { icon: Code, label: "Problem", color: "#22c55e" },
  lesson: { icon: BookOpen, label: "Lesson", color: "#3b82f6" },
  questions: { icon: MessageSquare, label: "Questions", color: "#f59e0b" },
  interview: { icon: Mic, label: "Interview", color: "#ec4899" },
  test: { icon: ClipboardCheck, label: "Mock test", color: "#7c5cff" },
  debug: { icon: Bug, label: "Debugging", color: "#ef4444" },
  review: { icon: ScanSearch, label: "Code review", color: "#22d3ee" },
  project: { icon: Briefcase, label: "Project", color: "#a78bfa" },
  flashcards: { icon: Layers, label: "Flashcards", color: "#14b8a6" },
};

export function taskMeta(type) {
  return TASK_META[type] || { icon: Code, label: type, color: "#8a93ab" };
}

export const AREA_LABEL = {
  dsa: "DSA problem solving",
  questions: "Interview questions",
  interview: "Technical interviews",
  english: "Spoken English",
  system: "System design",
  test: "Timed tests",
  debug: "Debugging",
  review: "Code review",
};

export const LANGUAGES = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "go", label: "Go" },
];

export const ROLES = [
  "Full Stack Developer", "Frontend Developer", "Backend Developer", "Mobile Developer",
  "AI / ML Engineer", "Data Scientist", "DevOps Engineer",
];

export function minutesLabel(m) {
  if (!m) return "0 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function dayLabel(iso, opts = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(`${iso}T00:00`).toLocaleDateString(undefined, opts);
}
