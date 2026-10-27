"use client";

import { useEffect, useState } from "react";

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Ticking HH:MM:SS countdown to an ISO timestamp. Calls onElapsed once when it reaches zero. */
export default function Countdown({ to, onElapsed, className }) {
  const [left, setLeft] = useState(null);

  useEffect(() => {
    const target = new Date(to).getTime();
    // Only fire for a target that was still ahead when mounted, so a stale timestamp can't loop reloads
    let fired = target <= Date.now();
    function tick() {
      const ms = Math.max(0, target - Date.now());
      setLeft(ms);
      if (ms === 0 && !fired) {
        fired = true;
        onElapsed?.();
      }
    }
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [to, onElapsed]);

  const total = Math.floor((left ?? 0) / 1000);
  const parts = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return (
    <span className={className} aria-live="off">
      {left === null ? "--:--:--" : parts.map(pad).join(":")}
    </span>
  );
}
