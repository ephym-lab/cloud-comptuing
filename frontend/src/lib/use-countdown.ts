"use client";

import { useEffect, useState } from "react";

/**
 * Seconds left until `deadline` (ms since epoch), updated a few times per second.
 * The deadline is computed from `expires_in` when the link arrives, so a wrong
 * clock on the presenter's laptop can't skew the countdown.
 */
export function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);

  return deadline === null ? 0 : Math.max(0, (deadline - now) / 1000);
}
