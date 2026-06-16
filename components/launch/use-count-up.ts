"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 → target on first mount. Pure RAF, no dep.
 * Used by the home dashboard metric cards so revenue/headcount numbers
 * tick up into place on first paint rather than slamming in.
 *
 * Re-running the animation when the target changes is intentional
 * (e.g. after an inline Y1-target edit) so the new value feels
 * responsive.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    let raf = 0;
    const initial = value;
    fromRef.current = initial;
    startRef.current = null;

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      // Ease-out cubic for a tick-up that decelerates into place.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(fromRef.current + (target - fromRef.current) * eased);
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}
