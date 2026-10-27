"use client";

import { useState } from "react";
import { Play, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";

/** "Start contest" button with a confirmation dialog. The personal timer starts as soon as the POST succeeds. */
export default function StartContestButton({ contest, onStarted, size = "md", className }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/contests/${contest.slug}/start`, { method: "POST" });
      setOpen(false);
      onStarted?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={size} className={className} onClick={() => setOpen(true)}>
        <Play className="size-4" /> Start contest
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}>
          <div className="card glow w-full max-w-md animate-pop p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex size-11 items-center justify-center rounded-xl bg-warn/15">
              <Timer className="size-5 text-warn" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Start {contest.title}?</h2>
            <p className="mt-2 text-sm text-muted">
              Your personal {contest.duration_minutes}-minute timer starts the moment you confirm and cannot be paused.
              It never runs past the contest end, so starting late means less time.
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li>Ranking is by points, then penalty minutes.</li>
              <li>Penalty = minutes to each solve + 5 per wrong submission.</li>
              <li>Hints, editorials and company tags are disabled.</li>
            </ul>
            {error && <p className="mt-4 text-sm text-bad">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Not yet</Button>
              <Button onClick={start} loading={busy}>Start the timer</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
