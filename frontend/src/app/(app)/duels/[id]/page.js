"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Lock, Swords } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, ErrorState, PageLoader } from "@/components/ui";
import DuelSolver from "@/components/duels/DuelSolver";
import {
  ArenaBar, CancelledView, CountdownOverlay, LobbyLink, OpponentFeed, ResultScreen, WaitingRoom,
} from "@/components/duels/ArenaViews";
import { useDuel } from "@/components/duels/useDuel";
import { useNow } from "@/components/duels/shared";

export default function DuelPage() {
  const { id } = useParams();
  return <Arena key={id} id={id} />;
}

/** Someone opened a duel link they are not part of yet: offer to join with the invite code. */
function JoinPrompt({ initialCode }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/api/duels/join", { body: { code: code.trim() } });
      router.replace(`/duels/${d.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md animate-fade-up">
      <LobbyLink />
      <Card className="mt-4 p-6 text-center sm:p-8">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <Swords className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold tracking-tight">You&apos;ve been challenged</h1>
        <p className="mt-1 text-sm text-muted">Enter the invite code to join this 1v1 duel. The problem is revealed after a 5 second countdown.</p>
        <form onSubmit={join} className="mt-5 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Invite code" maxLength={16}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 font-mono text-sm tracking-widest uppercase outline-none focus:border-brand" />
          <Button type="submit" loading={busy} disabled={code.trim().length < 4}>Join duel</Button>
        </form>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </Card>
    </div>
  );
}

function Arena({ id }) {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();
  // Refresh XP in the shell when the duel ends from the other side (a submit already returns the user)
  const onFinished = useCallback(() => {
    api("/api/auth/me").then(setUser, () => {});
  }, [setUser]);
  const { data: duel, at, error, workspace, events, accept } = useDuel(id, { onFinished });
  const now = useNow(250);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState("");

  async function act(kind, fn) {
    setBusy(kind);
    setActionError("");
    try {
      await fn();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const acceptBot = () => act("bot", async () => accept(await api(`/api/duels/${id}/bot`, { method: "POST" })));
  const cancel = () => act("cancel", async () => {
    await api(`/api/duels/${id}/cancel`, { method: "POST" });
    router.push("/duels");
  });
  const forfeit = () => act("forfeit", async () => {
    const r = await api(`/api/duels/${id}/forfeit`, { method: "POST" });
    if (r.user) setUser(r.user);
    accept(r);
  });
  const rematch = () => act("rematch", async () => {
    const d = await api("/api/duels/quick", { body: { difficulty: duel.difficulty } });
    router.push(`/duels/${d.id}`);
  });

  function onSubmitted(r) {
    if (r.user) setUser(r.user);
    if (r.duel) accept(r.duel);
  }

  if (error) {
    if (error.status === 403) return <JoinPrompt initialCode={params.get("code")} />;
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }
  if (!duel) return <PageLoader label="Loading duel" />;

  const since = Math.max(0, (now - at) / 1000);

  if (duel.phase === "cancelled") return <CancelledView />;
  if (duel.phase === "finished") {
    return <ResultScreen duel={duel} onRematch={rematch} rematching={busy === "rematch"} error={actionError} />;
  }
  if (duel.phase === "waiting") {
    return (
      <WaitingRoom duel={duel} waited={duel.waiting_seconds + since} onBot={acceptBot} onCancel={cancel}
        busy={busy} error={actionError} />
    );
  }
  if (duel.phase === "countdown") {
    return (
      <>
        <CountdownOverlay duel={duel} seconds={duel.starts_in - since} />
        <PageLoader label="Get ready" />
      </>
    );
  }

  const remaining = duel.time_limit_minutes * 60 - (duel.elapsed + since);
  const locked = remaining <= 0;
  return (
    <div className="-mx-4 -my-6 flex flex-col sm:-mx-6 lg:-mx-10 lg:-my-8 lg:h-[calc(100vh-4rem)]">
      <ArenaBar duel={duel} remaining={remaining} onForfeit={forfeit} forfeiting={busy === "forfeit"} />
      <OpponentFeed events={events} now={now} />
      {actionError && <p className="border-b border-line px-4 py-2 text-sm text-bad">{actionError}</p>}
      {workspace ? (
        <DuelSolver key={workspace.slug} duelId={duel.id} problem={workspace} locked={locked} onSubmitted={onSubmitted} />
      ) : (
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted">
          <Lock className="mr-2 size-4" /> Loading the problem
        </div>
      )}
    </div>
  );
}
