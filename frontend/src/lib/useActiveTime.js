"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";

const FLUSH_EVERY = 15;

function isActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * Counts focused, visible seconds for an area (e.g. "dsa") and item (e.g. a problem slug).
 * The clock stops the moment the tab is hidden or the window loses focus, and time is synced
 * to the server every 15 s. `onReturn(awaySeconds)` fires when the learner comes back.
 */
export function useActiveTime(area, ref = "", { onReturn } = {}) {
  const [seconds, setSeconds] = useState(0); // previous sessions + this one
  const [active, setActive] = useState(true);
  const pendingRef = useRef(0);
  const awaySinceRef = useRef(null);
  const onReturnRef = useRef(onReturn);

  useEffect(() => {
    onReturnRef.current = onReturn;
  }, [onReturn]);

  useEffect(() => {
    let cancelled = false;
    api(`/api/activity/ref?area=${encodeURIComponent(area)}&ref=${encodeURIComponent(ref)}`)
      .then((r) => !cancelled && setSeconds((s) => s + r.seconds))
      .catch(() => {});

    const flush = () => {
      const chunk = Math.min(60, pendingRef.current);
      if (chunk < 1) return;
      pendingRef.current -= chunk;
      api("/api/activity/heartbeat", { body: { area, ref, seconds: chunk } }).catch(() => {
        pendingRef.current += chunk; // retry with the next flush
      });
    };

    const tick = setInterval(() => {
      const now = isActive();
      setActive(now);
      if (!now) return;
      pendingRef.current += 1;
      setSeconds((s) => s + 1);
      if (pendingRef.current >= FLUSH_EVERY) flush();
    }, 1000);

    const onAway = () => {
      if (awaySinceRef.current === null) awaySinceRef.current = Date.now();
      setActive(false);
      flush();
    };
    const onBack = () => {
      if (!isActive()) return;
      setActive(true);
      if (awaySinceRef.current !== null) {
        const away = Math.round((Date.now() - awaySinceRef.current) / 1000);
        awaySinceRef.current = null;
        if (away >= 3) onReturnRef.current?.(away);
      }
    };
    const onVisibility = () => (document.visibilityState === "visible" ? onBack() : onAway());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onAway);
    window.addEventListener("focus", onBack);

    return () => {
      cancelled = true;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onAway);
      window.removeEventListener("focus", onBack);
      flush();
    };
  }, [area, ref]);

  return { seconds, active };
}

export function formatDuration(total) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function humanDuration(total) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
