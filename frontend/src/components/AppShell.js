"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  BookOpen, Briefcase, ClipboardCheck, Code, Flame, LayoutDashboard, LogOut, Map, MessageSquare, Mic, ScanFace, Settings,
  ShieldCheck, Sparkles, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Logo } from "./Logo";
import { PageLoader, cx } from "./ui";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, mobile: true },
  { href: "/learn", label: "Language Paths", short: "Learn", icon: BookOpen, mobile: true },
  { href: "/questions", label: "Question Bank", short: "Questions", icon: MessageSquare },
  { href: "/dsa", label: "DSA Track", short: "DSA", icon: Code, mobile: true },
  { href: "/tests", label: "Mock Tests", short: "Tests", icon: ClipboardCheck, mobile: true },
  { href: "/projects", label: "Take-Home Projects", short: "Projects", icon: Briefcase },
  { href: "/interview", label: "AI Interviews", short: "Interview", icon: Mic, mobile: true },
  { href: "/mirror", label: "Test Your Interviewer", short: "Mirror", icon: ScanFace },
  { href: "/paths", label: "Company Paths", short: "Paths", icon: Map },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
  { href: "/admin", label: "Admin", short: "Admin", icon: ShieldCheck, admin: true },
];

function NavLinks({ mobile, isAdmin }) {
  const pathname = usePathname();
  return <NavList mobile={mobile} pathname={pathname} isAdmin={isAdmin} />;
}

function NavList({ mobile, pathname = "", isAdmin }) {
  const items = NAV.filter((n) => (mobile ? n.mobile : !n.admin || isAdmin));
  return items.map(({ href, label, short, icon: Icon }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return mobile ? (
      <Link key={href} href={href}
        className={cx("flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium",
          active ? "text-brand" : "text-muted")}>
        <Icon className="size-5" />
        {short}
      </Link>
    ) : (
      <Link key={href} href={href}
        className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
          active ? "bg-brand/15 text-white" : "text-muted hover:bg-surface-2 hover:text-text")}>
        <Icon className={cx("size-[18px]", active && "text-brand")} />
        {label}
      </Link>
    );
  });
}

function AiStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    api("/api/ai/status").then(setStatus).catch(() => setStatus({ enabled: false }));
  }, []);
  if (!status) return null;
  return (
    <div className={cx("hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium md:flex",
      status.enabled ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn")}
      title={status.enabled ? `Model: ${status.model}` : "Add GROQ_API_KEY to enable live AI"}>
      <Sparkles className="size-3.5" />
      {status.enabled ? "AI live" : "AI offline demo"}
    </div>
  );
}

function XpBadge({ user }) {
  const pct = Math.round((user.into_level / user.level_size) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 rounded-full bg-warn/10 px-3 py-1 text-sm font-semibold text-warn"
        title="Daily streak">
        <Flame className="size-4" />
        {user.streak}
      </div>
      <div className="hidden items-center gap-2 sm:flex" title={`${user.into_level}/${user.level_size} XP to next level`}>
        <div className="flex size-8 items-center justify-center rounded-full bg-brand/20 text-xs font-bold text-brand">
          {user.level}
        </div>
        <div className="w-24">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
            <span className="flex items-center gap-0.5"><Zap className="size-3" />{user.xp} XP</span>
            <span>Lv {user.level + 1}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [loading, user, router]);

  if (loading || !user) return <PageLoader label="Opening your haven" />;

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/60 p-4
        backdrop-blur-xl lg:flex">
        <div className="px-2 py-3">
          <Logo href="/dashboard" />
        </div>
        <nav className="mt-4 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          <Suspense fallback={<NavList isAdmin={user.is_admin} />}>
            <NavLinks isAdmin={user.is_admin} />
          </Suspense>
        </nav>
        <div className="mt-auto shrink-0 rounded-2xl border border-line bg-surface-2 p-4">
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.target_role}</p>
          <button onClick={() => { logout(); router.replace("/"); }}
            className="mt-3 flex items-center gap-2 text-xs text-muted hover:text-text">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line
          bg-bg/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="lg:hidden">
            <Logo href="/dashboard" />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-4">
            <AiStatus />
            <XpBadge user={user} />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-10 lg:py-8 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur-xl lg:hidden">
        <Suspense fallback={<NavList mobile />}>
          <NavLinks mobile />
        </Suspense>
      </nav>
    </div>
  );
}
