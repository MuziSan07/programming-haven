"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  Award, BookOpen, Briefcase, Bug, ClipboardCheck, Code, Compass, FileUser, Flame, Layers, LayoutDashboard, LogOut, Map,
  Medal, Menu, MessageSquare, MessagesSquare, Mic, ScanFace, Settings, ShieldCheck, Swords, Trophy, UsersRound, X, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Logo } from "./Logo";
import { PageLoader, cx } from "./ui";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, mobile: true },
  { href: "/coach", label: "Career Coach", short: "Coach", icon: Compass, section: "Plan" },
  { href: "/career", label: "Profile Review", short: "Profile", icon: FileUser, section: "Plan" },
  { href: "/learn", label: "Language Paths", short: "Learn", icon: BookOpen, mobile: true, section: "Practice" },
  { href: "/questions", label: "Question Bank", short: "Questions", icon: MessageSquare, section: "Practice" },
  { href: "/flashcards", label: "Flashcards", short: "Cards", icon: Layers, section: "Practice" },
  { href: "/dsa", label: "DSA Track", short: "DSA", icon: Code, mobile: true, section: "Practice" },
  { href: "/rounds", label: "Debug & Review", short: "Rounds", icon: Bug, section: "Practice" },
  { href: "/tests", label: "Mock Tests", short: "Tests", icon: ClipboardCheck, section: "Practice" },
  { href: "/projects", label: "Take-Home Projects", short: "Projects", icon: Briefcase, section: "Practice" },
  { href: "/interview", label: "AI Interviews", short: "Interview", icon: Mic, mobile: true, section: "Interview" },
  { href: "/mirror", label: "Test Your Interviewer", short: "Mirror", icon: ScanFace, section: "Interview" },
  { href: "/leagues", label: "Leagues", short: "Leagues", icon: Medal, section: "Compete" },
  { href: "/contests", label: "Weekly Contests", short: "Contests", icon: Swords, section: "Compete" },
  { href: "/badges", label: "Badges & Certificates", short: "Badges", icon: Award, section: "Compete" },
  { href: "/community", label: "Community", short: "Community", icon: MessagesSquare, section: "Together" },
  { href: "/groups", label: "Study Groups", short: "Groups", icon: UsersRound, section: "Together" },
  { href: "/hackathons", label: "Hackathons", short: "Hackathons", icon: Trophy, section: "Together" },
  { href: "/paths", label: "Company Paths", short: "Paths", icon: Map, section: "More" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, section: "More" },
  { href: "/admin", label: "Admin", short: "Admin", icon: ShieldCheck, admin: true, section: "More" },
];

function NavLinks({ mobile, isAdmin, onNavigate }) {
  const pathname = usePathname();
  return <NavList mobile={mobile} pathname={pathname} isAdmin={isAdmin} onNavigate={onNavigate} />;
}

function NavList({ mobile, pathname = "", isAdmin, onNavigate }) {
  const items = NAV.filter((n) => (mobile ? n.mobile : !n.admin || isAdmin));
  let section = null;
  return items.map(({ href, label, short, icon: Icon, section: group }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    if (mobile) {
      return (
        <Link key={href} href={href}
          className={cx("flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium",
            active ? "text-brand" : "text-muted")}>
          <Icon className="size-5" />
          {short}
        </Link>
      );
    }
    const heading = group && group !== section ? group : null;
    section = group;
    return (
      <div key={href}>
        {heading && (
          <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint">{heading}</p>
        )}
        <Link href={href} onClick={onNavigate}
          className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
            active ? "bg-brand/15 text-white" : "text-muted hover:bg-surface-2 hover:text-text")}>
          <Icon className={cx("size-[18px]", active && "text-brand")} />
          {label}
        </Link>
      </div>
    );
  });
}

function MobileMore({ isAdmin }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted">
        <Menu className="size-5" />
        More
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-bg/98 backdrop-blur-xl lg:hidden">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
            <Logo href="/dashboard" />
            <button onClick={() => setOpen(false)} aria-label="Close menu"
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 pb-8">
            <Suspense fallback={<NavList isAdmin={isAdmin} />}>
              <NavLinks isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
            </Suspense>
          </nav>
        </div>
      )}
    </>
  );
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
      <span className={cx("size-1.5 rounded-full", status.enabled ? "bg-ok" : "bg-warn")} />
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
        <nav className="mt-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto pb-2">
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
        <MobileMore isAdmin={user.is_admin} />
      </nav>
    </div>
  );
}
