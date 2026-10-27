"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { shortName } from "./shared";

const POLL_MS = 2000;
const MAX_EVENTS = 8;
const LIVE = new Set(["waiting", "countdown", "active"]);

/** Opponent activity between two snapshots, as feed lines. */
function diffEvents(prev, next, at) {
  const out = [];
  const before = prev?.opponent;
  const after = next.opponent;
  if (!after) return out;
  const name = shortName(after);
  if (!before && prev) out.push({ id: `${at}-join`, at, tone: "brand", text: `${name} joined the duel` });
  const a = before?.progress;
  const b = after.progress;
  if (!b || !a) return out;
  if (b.attempts > a.attempts) {
    if (b.solved_at !== null && b.solved_at !== undefined) {
      out.push({ id: `${at}-solve`, at, tone: "bad", text: `${name} got Accepted` });
    } else {
      out.push({ id: `${at}-sub`, at, tone: "warn", text: `${name} submitted: ${b.passed}/${b.total} tests passed` });
    }
  } else if (b.passed > a.passed) {
    out.push({ id: `${at}-pass`, at, tone: "warn", text: `${name} passed ${b.passed}/${b.total} tests` });
  }
  return out;
}

/**
 * Loads one duel and keeps it fresh: polls every 2 s while waiting, counting down or active, and stops
 * once it is finished or cancelled. Uses api() + setState (no loader flash). `at` is the client time the
 * snapshot arrived, so timers can be interpolated without trusting the client clock against the server's.
 */
export function useDuel(id, { onFinished } = {}) {
  const path = `/api/duels/${id}`;
  const [snap, setSnap] = useState({ data: null, at: 0, error: null });
  const [workspace, setWorkspace] = useState(null);
  const [events, setEvents] = useState([]);
  const lastRef = useRef(null);
  const hasWorkspace = useRef(false);
  const finishedRef = useRef(onFinished);

  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  const accept = useCallback((data) => {
    const at = Date.now();
    const prev = lastRef.current;
    lastRef.current = data;
    if (data.workspace) {
      hasWorkspace.current = true;
      setWorkspace(data.workspace);
    }
    const fresh = diffEvents(prev, data, at);
    if (fresh.length) setEvents((list) => [...fresh, ...list].slice(0, MAX_EVENTS));
    if (prev && LIVE.has(prev.phase) && data.status === "finished") finishedRef.current?.(data);
    setSnap({ data, at, error: null });
  }, []);

  const fetchNow = useCallback(async () => {
    const light = hasWorkspace.current ? "?light=1" : "";
    const data = await api(`${path}${light}`);
    accept(data);
    return data;
  }, [path, accept]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    api(path).then(
      (data) => { if (!cancelled) accept(data); },
      (error) => { if (!cancelled) setSnap({ data: null, at: Date.now(), error }); },
    );
    return () => { cancelled = true; };
  }, [path, accept]);

  const phase = snap.data?.phase;
  const startsIn = snap.data?.starts_in || 0;

  // Polling while the duel is live
  useEffect(() => {
    if (!LIVE.has(phase)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await api(`${path}${hasWorkspace.current ? "?light=1" : ""}`);
        if (!cancelled) accept(data);
      } catch {
        // transient network error: try again next tick
      }
    };
    const timer = setInterval(tick, POLL_MS);
    // Reveal the problem the moment the countdown ends instead of up to 2 s later
    const reveal = phase === "countdown" ? setTimeout(tick, startsIn * 1000 + 150) : null;
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (reveal) clearTimeout(reveal);
    };
  }, [phase, startsIn, path, accept]);

  return { data: snap.data, at: snap.at, error: snap.error, workspace, events, accept, refetch: fetchNow };
}
