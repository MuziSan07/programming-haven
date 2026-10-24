import Link from "next/link";
import {
  ArrowRight, BookOpen, Bot, Building2, ClipboardCheck, Code, Gauge, Globe, Laptop, Mic, ShieldCheck, Smartphone, Target, Trophy,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const PIPELINE = [
  { stage: "English proficiency", train: "AI voice conversations scored on fluency & clarity", icon: Globe },
  { stage: "DSA / timed test", train: "Codility-style problems with progressive AI hints", icon: Code },
  { stage: "Skill test", train: "Stack-specific MCQs and hands-on lessons", icon: BookOpen },
  { stage: "Proctored assessment", train: "Webcam + tab monitoring, just like the real thing", icon: ShieldCheck },
  { stage: "Live 1:1 coding", train: "Think-aloud practice with an AI interviewer", icon: Laptop },
  { stage: "Technical interview", train: "Role-specific deep dives and system design", icon: Mic },
  { stage: "HR & culture", train: "STAR-format coaching for remote-work rounds", icon: Target },
];

const FEATURES = [
  { title: "Duolingo-style Language Paths", body: "Bite-sized Python and JavaScript lessons with XP, streaks and "
      + "an AI tutor that explains every mistake.", icon: BookOpen, color: "#3b82f6" },
  { title: "DSA Track with AI Coach", body: "Real code execution against hidden tests, three levels of hints "
      + "that never spoil, and senior-engineer code reviews.", icon: Code, color: "#22c55e" },
  { title: "Proctored Mock Tests", body: "Face detection, tab-switch and paste monitoring produce an Integrity "
      + "Report, so you practise under real screening pressure.", icon: ShieldCheck, color: "#f59e0b" },
  { title: "AI Avatar Interviews", body: "A talking AI interviewer runs technical, HR, English and system-design "
      + "rounds by voice, then grades you like a hiring panel.", icon: Bot, color: "#ec4899" },
  { title: "Company Prep Paths", body: "Step-by-step paths that mirror how Toptal, Turing, Lemon.io, A.Team and "
      + "Braintrust screen developers.", icon: Building2, color: "#8b5cf6" },
  { title: "Readiness Score", body: "One number that tells you when you're ready to apply, built from every "
      + "lesson, problem, test and interview.", icon: Gauge, color: "#22d3ee" },
];

const COMPANIES = ["Toptal", "Turing", "Lemon.io", "A.Team", "Braintrust", "Remote US · UK · EU"];

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="card glow relative overflow-hidden p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex size-12 items-center justify-center rounded-full bg-brand text-lg font-bold">A
            <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-surface bg-ok" />
          </div>
          <div>
            <p className="text-sm font-semibold">Alex · AI Interviewer</p>
            <p className="text-xs text-muted">Technical round · Question 3 of 6</p>
          </div>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-bad/15 px-2 py-0.5 text-[10px]
            font-semibold text-bad"><span className="size-1.5 animate-pulse rounded-full bg-bad" />LIVE</span>
        </div>
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-text">
          “An endpoint that took 200ms now takes 3 seconds. Walk me through how you&apos;d investigate.”
        </div>
        <div className="mt-3 flex items-end gap-1">
          {[40, 70, 55, 90, 65, 80, 45, 75, 60, 85, 50, 70].map((h, i) => (
            <span key={i} className="w-full rounded-full bg-brand/60" style={{ height: h / 4 }} />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[["Readiness", "78"], ["DSA solved", "42"], ["Day streak", "12"]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 py-2.5">
              <p className="text-lg font-bold">{v}</p>
              <p className="text-[10px] text-muted">{k}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="card absolute -bottom-6 -left-6 hidden items-center gap-2 px-4 py-3 text-sm sm:flex">
        <ShieldCheck className="size-5 text-ok" /> Integrity 98%
      </div>
      <div className="card absolute -top-5 -right-4 hidden items-center gap-2 px-4 py-3 text-sm sm:flex">
        <Trophy className="size-5 text-warn" /> Likely to pass
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[700px]"
        style={{ background: "radial-gradient(ellipse at top, rgba(124,92,255,0.10), transparent 60%)" }} />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#pipeline" className="hover:text-text">Pipeline</a>
          <a href="#features" className="hover:text-text">Features</a>
          <a href="#companies" className="hover:text-text">Companies</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="px-3 py-2 text-sm text-muted hover:text-text">Sign in</Link>
          <Link href="/register" className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white
            hover:bg-brand/90">Get started</Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-16 px-4 pt-12 pb-24 sm:px-6
        lg:grid-cols-2 lg:pt-20">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3
            py-1 text-xs font-medium text-[#b4a3ff]">
            For developers targeting remote roles
          </span>
          <h1 className="mt-6 text-5xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
            Get vetted.<br /><span className="gradient-text">Get hired.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            The only platform that trains you for <span className="text-text">every stage</span> of the screening
            pipelines at Toptal, Turing, Lemon.io, A.Team, Braintrust and remote companies in the US, UK and Europe.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6
              font-medium text-white hover:bg-brand/90">
              Start preparing free <ArrowRight className="size-4" />
            </Link>
            <a href="#pipeline" className="inline-flex h-12 items-center rounded-xl border border-line bg-surface
              px-6 font-medium hover:bg-surface-2">See how it works</a>
          </div>
          <div className="mt-10 flex flex-wrap gap-8 text-sm">
            {[["7", "screening stages covered"], ["6", "company prep paths"], ["24/7", "AI interviewer"]].map(
              ([n, l]) => (
                <div key={l}>
                  <p className="text-2xl font-bold">{n}</p>
                  <p className="text-muted">{l}</p>
                </div>
              ))}
          </div>
        </div>
        <HeroVisual />
      </section>

      <section id="pipeline" className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">The problem</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
          Elite networks accept a tiny fraction of applicants. Most fail a stage they never practised.
        </h2>
        <p className="mt-4 max-w-2xl text-muted">
          Developers juggle LeetCode, language apps and YouTube, and still walk into proctored tests and live
          interviews unprepared. Programming Haven trains the whole pipeline in one place.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map(({ stage, train, icon: Icon }, i) => (
            <div key={stage} className="card group p-5 transition hover:border-brand/50">
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-brand-2" />
                <span className="font-mono text-xs text-faint">0{i + 1}</span>
              </div>
              <p className="mt-4 font-semibold">{stage}</p>
              <p className="mt-1 text-sm text-muted">{train}</p>
            </div>
          ))}
          <div className="card flex flex-col justify-center border-brand/40 bg-brand/10 p-5">
            <Gauge className="size-6 text-white" />
            <p className="mt-3 font-semibold">Readiness Score</p>
            <p className="mt-1 text-sm text-muted">Know exactly when to apply.</p>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">The platform</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Everything between you and the offer</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ title, body, icon: Icon, color }) => (
            <div key={title} className="card p-6">
              <div className="flex size-11 items-center justify-center rounded-xl"
                style={{ background: `${color}22`, color }}>
                <Icon className="size-5" />
              </div>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="companies" className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="card overflow-hidden p-8 sm:p-12">
          <p className="text-xs font-semibold tracking-widest text-brand uppercase">Company Prep Paths</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight">
            Pick the network. We map its screening, stage by stage.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {COMPANIES.map((c) => (
              <span key={c} className="rounded-xl border border-line bg-surface-2 px-5 py-3 text-sm font-medium">
                {c}
              </span>
            ))}
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[["Choose your target", "Select a network or remote market and your role."],
              ["Train every stage", "Lessons, DSA, proctored tests and AI interviews, each mapped to a stage."],
              ["Apply with confidence", "Your Readiness Score tells you when you're ready."]].map(([t, b], i) => (
              <div key={t}>
                <span className="flex size-8 items-center justify-center rounded-full bg-brand/20 text-sm font-bold
                  text-brand">{i + 1}</span>
                <p className="mt-3 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <div className="flex justify-center gap-3 text-muted">
          <Laptop className="size-5" /><Smartphone className="size-5" /><ClipboardCheck className="size-5" />
        </div>
        <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Start preparing for your next screening.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">Works on phone, tablet and desktop. Install it like an app.</p>
        <Link href="/register" className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-8
          font-medium text-white hover:bg-brand/90">
          Create your free account <ArrowRight className="size-4" />
        </Link>
      </section>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm
          text-muted sm:flex-row sm:px-6">
          <Logo />
          <p>© {2026} Programming Haven. Not affiliated with the companies named.</p>
        </div>
      </footer>
    </div>
  );
}
