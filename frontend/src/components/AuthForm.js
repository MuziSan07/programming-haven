"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Logo } from "./Logo";
import { Button } from "./ui";

const ROLES = [
  "Full Stack Developer", "Frontend Developer", "Backend Developer", "Mobile Developer",
  "AI / ML Engineer", "Data Scientist", "DevOps Engineer",
];

export default function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const { login, register, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // New signups start with the career coach onboarding
  const next = params.get("next") || (isRegister ? "/coach?onboarding=1" : "/dashboard");
  const [form, setForm] = useState({ name: "", email: "", password: "", target_role: ROLES[0], gender: "unspecified" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(next.startsWith("/") ? next : "/dashboard");
  }, [user, next, router]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isRegister) await register(form);
      else await login(form.email, form.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at top, rgba(124,92,255,0.08), transparent 55%)" }} />
      <div className="relative w-full max-w-md animate-pop">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card glow p-8">
          <h1 className="text-2xl font-bold">{isRegister ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-muted">
            {isRegister ? "Start your path to a remote role." : "Pick up where you left off."}
          </p>
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            {isRegister && (
              <div>
                <label className="label" htmlFor="name">Full name</label>
                <input id="name" className="input" required value={form.name} onChange={set("name")}
                  placeholder="Ada Lovelace" autoComplete="name" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" required value={form.email} onChange={set("email")}
                placeholder="you@example.com" autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" className="input" required minLength={isRegister ? 8 : 1}
                value={form.password} onChange={set("password")} placeholder={isRegister ? "At least 8 characters" : ""}
                autoComplete={isRegister ? "new-password" : "current-password"} />
            </div>
            {isRegister && (
              <div>
                <label className="label" htmlFor="role">Target role</label>
                <select id="role" className="input" value={form.target_role} onChange={set("target_role")}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            )}
            {isRegister && (
              <div>
                <label className="label" htmlFor="gender">Gender <span className="normal-case text-faint">(optional)</span></label>
                <select id="gender" className="input" value={form.gender} onChange={set("gender")}>
                  <option value="unspecified">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <p className="mt-1.5 text-xs text-faint">Used to pick your default AI interviewer. You can switch anytime.</p>
              </div>
            )}
            {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            <Button type="submit" size="lg" loading={busy} className="mt-2 w-full">
              {isRegister ? "Create account" : "Sign in"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {isRegister ? "Already have an account? " : "New to Programming Haven? "}
            <Link href={isRegister ? "/login" : "/register"} className="font-medium text-brand hover:underline">
              {isRegister ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
