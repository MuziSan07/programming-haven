"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Bug, Check, CircleCheck, Clock, Code, Copy, Crown, Flame, Lock, LogOut, MessagesSquare, Send, Target,
  Trophy, Users, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, DIFFICULTY_TONE, ErrorState, PageLoader, cx } from "@/components/ui";
import { MemberInitial, endsIn, useNow } from "@/components/groups/shared";

const POLL_MS = 15000;

function Preview({ group, onJoin, joining, error }) {
  return (
    <Card className="mx-auto max-w-xl p-6 text-center sm:p-8">
      <Badge tone="brand"><Target className="size-3" />{group.target_label}</Badge>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{group.name}</h1>
      {group.description && <p className="mt-2 text-sm text-muted">{group.description}</p>}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted">
        <Users className="size-4" /> <span className="font-medium text-text">{group.members}/{group.max_members}</span> members
      </p>
      {group.member_names?.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {group.member_names.map((n, i) => (
            <span key={`${n}-${i}`} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-xs">
              <MemberInitial user={{ id: i, name: n }} size="sm" /> {n}
            </span>
          ))}
        </div>
      )}
      <div className="mt-6">
        {group.is_public ? (
          group.members >= group.max_members ? (
            <p className="text-sm text-warn">This group is full.</p>
          ) : (
            <Button size="lg" onClick={onJoin} loading={joining}>Join group</Button>
          )
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted">
            <Lock className="size-4" /> Private group. Ask a member for the invite code.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </div>
    </Card>
  );
}

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked; the code is still visible to copy by hand
    }
  }
  return (
    <button onClick={copy} title="Copy invite code"
      className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs hover:border-faint">
      <span className="text-muted">Invite code</span>
      <span className="font-mono font-semibold tracking-widest">{code}</span>
      {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5 text-muted" />}
    </button>
  );
}

function Challenge({ challenge, leaderboard, now }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-brand uppercase">
            <Zap className="size-3.5" /> This week&apos;s challenge
          </p>
          <h2 className="mt-1 text-lg font-semibold">{challenge.title}</h2>
          <p className="mt-1 text-sm text-muted">{challenge.description}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 font-mono text-xs tabular-nums">
          <Clock className="size-3.5 text-muted" /> Ends in {endsIn(challenge.ends_at, now)}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {challenge.tasks.map((t) => {
          const finished = leaderboard.filter((r) => r.challenge_done.includes(t.ref));
          const mine = finished.some((r) => r.me);
          const Icon = t.type === "debug" ? Bug : Code;
          return (
            <li key={`${t.type}-${t.ref}`}>
              <Link href={t.href} className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-surface-2 sm:flex-nowrap">
                {mine ? <CircleCheck className="size-5 shrink-0 text-ok" /> : <Icon className="size-5 shrink-0 text-muted" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="text-xs text-faint">{t.type === "debug" ? "Debugging round" : "Coding problem"}</span>
                </span>
                <Badge tone={DIFFICULTY_TONE[t.difficulty] || "neutral"}>{t.difficulty}</Badge>
                <span className="flex w-24 justify-end -space-x-1.5">
                  {finished.length === 0 ? (
                    <span className="text-xs text-faint">No one yet</span>
                  ) : (
                    <>
                      {finished.slice(0, 4).map((r) => <MemberInitial key={r.user.id} user={r.user} size="sm" />)}
                      {finished.length > 4 && (
                        <span className="flex size-6 items-center justify-center rounded-full bg-surface-3 text-[10px] ring-2 ring-surface">
                          +{finished.length - 4}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Leaderboard({ rows, total, groupXp }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold"><Trophy className="size-4 text-warn" /> Group leaderboard</h2>
        <span className="text-xs text-muted">
          <span className="font-semibold text-text tabular-nums">{groupXp.toLocaleString()}</span> XP this week
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-faint">
              <th className="px-5 py-2 font-medium">#</th>
              <th className="py-2 font-medium">Member</th>
              <th className="py-2 font-medium">Level</th>
              <th className="py-2 font-medium">Streak</th>
              <th className="py-2 font-medium">Challenge</th>
              <th className="px-5 py-2 text-right font-medium">Week XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.user.id} className={cx(r.me && "bg-brand/10")}>
                <td className="px-5 py-3 font-mono text-muted tabular-nums">{r.rank}</td>
                <td className="py-3">
                  <span className="flex items-center gap-2">
                    <MemberInitial user={r.user} size="sm" />
                    <span className={cx("truncate", r.me && "font-semibold")}>{r.user.name}{r.me && " (you)"}</span>
                    {r.role === "owner" && <span title="Owner"><Crown className="size-3.5 shrink-0 text-warn" /></span>}
                  </span>
                </td>
                <td className="py-3 text-muted">Lv {r.user.level}</td>
                <td className="py-3">
                  <span className={cx("flex items-center gap-1", r.user.streak ? "text-warn" : "text-faint")}>
                    <Flame className="size-3.5" />{r.user.streak}
                  </span>
                </td>
                <td className="py-3">
                  <span className={cx("tabular-nums", r.challenge_done.length === total && total > 0 ? "text-ok" : "text-muted")}>
                    {r.challenge_done.length}/{total}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">{r.week_xp.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Chat({ groupId, messages, onPosted }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError("");
    try {
      const msg = await api(`/api/groups/${groupId}/messages`, { body: { body } });
      setDraft("");
      onPosted(msg);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex h-[520px] flex-col overflow-hidden lg:sticky lg:top-6">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-4 font-semibold">
        <MessagesSquare className="size-4 text-brand-2" /> Group chat
      </h2>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-faint">No messages yet. Say hi and share your plan for the week.</p>
        ) : messages.map((m) => (
          <div key={m.id} className={cx("flex gap-2", m.mine && "flex-row-reverse")}>
            {!m.mine && <MemberInitial user={m.user} size="sm" className="mt-4" />}
            <div className={cx("flex max-w-[80%] flex-col", m.mine && "items-end")}>
              <span className="mb-0.5 px-1 text-[11px] text-faint">
                {m.mine ? "You" : m.user.name} · {timeAgo(m.created_at)}
              </span>
              <p className={cx("rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
                m.mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-surface-2")}>{m.body}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="border-t border-line p-3">
        {error && <p className="mb-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-1.5 text-xs text-bad">{error}</p>}
        <div className="flex gap-2">
          <input className="input" value={draft} onChange={(e) => { setDraft(e.target.value); if (error) setError(""); }}
            placeholder="Message the group…" maxLength={2000} aria-label="Message" />
          <Button type="submit" loading={sending} disabled={!draft.trim()} aria-label="Send">
            {!sending && <Send className="size-4" />}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function GroupPage() {
  const { id } = useParams();
  const router = useRouter();
  const path = `/api/groups/${id}`;
  const { data, error, loading, reload, setData } = useApi(path);
  const now = useNow();
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const joined = Boolean(data?.joined);

  // Keep the chat and leaderboard fresh while the tab is visible. Polls in the background and swaps
  // the data in place (a reload() would drop to the full-page loader every 15 s).
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const fresh = await api(path);
        if (!cancelled) setData(fresh);
      } catch {
        // transient network error: try again next tick
      }
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [joined, path, setData]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function join() {
    setJoining(true);
    setJoinError("");
    try {
      await api(`/api/groups/${id}/join`, { method: "POST" });
      setData(await api(path));
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  }

  async function leave() {
    const last = data.members <= 1;
    if (!window.confirm(last ? "You're the last member. Leaving will delete this group. Continue?"
      : `Leave ${data.name}? You can rejoin later if there's a free seat.`)) return;
    setLeaving(true);
    try {
      await api(`/api/groups/${id}/leave`, { method: "POST" });
      router.push("/groups");
    } catch (err) {
      setLeaving(false);
      window.alert(err.message);
    }
  }

  const back = (
    <Link href="/groups" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
      <ArrowLeft className="size-4" /> All groups
    </Link>
  );

  if (!joined) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-up">
        {back}
        <Preview group={data} onJoin={join} joining={joining} error={joinError} />
      </div>
    );
  }

  const meId = data.leaderboard.find((r) => r.me)?.user.id;
  const messages = data.messages.map((m) => ({ ...m, mine: m.user.id === meId }));
  const onPosted = (msg) => setData((d) => (d.messages.some((m) => m.id === msg.id) ? d : { ...d, messages: [...d.messages, msg] }));

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      {back}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand"><Target className="size-3" />{data.target_label}</Badge>
            {!data.is_public && <Badge><Lock className="size-3" /> Private</Badge>}
            <Badge><Users className="size-3" />{data.members}/{data.max_members} members</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{data.name}</h1>
          {data.description && <p className="mt-1 max-w-2xl text-sm text-muted">{data.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.invite_code && <CopyCode code={data.invite_code} />}
          <Button variant="danger" size="sm" onClick={leave} loading={leaving}><LogOut className="size-3.5" /> Leave</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Challenge challenge={data.challenge} leaderboard={data.leaderboard} now={now} />
          <Leaderboard rows={data.leaderboard} total={data.challenge.tasks.length} groupXp={data.group_week_xp} />
        </div>
        <Chat groupId={id} messages={messages} onPosted={onPosted} />
      </div>
    </div>
  );
}
