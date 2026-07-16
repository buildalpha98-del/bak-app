"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1200;
/** Start counting once ~40% of the number is in view. */
const VISIBILITY_THRESHOLD = 0.4;

/**
 * Animated stat value for the impact band — the client leaf under
 * the server-rendered <ImpactBand />. Takes the FORMATTED value
 * ("1,200+", "6", "—"), parses the numeric part and counts 0→N over
 * ~1.2s the first time it scrolls into view, keeping any prefix and
 * suffix ("+") attached throughout.
 *
 * Server markup (and therefore no-JS visitors and crawlers) carries
 * the final value, and it stays rendered until the moment the
 * IntersectionObserver reports the element in view — no rewind to
 * zero beforehand, so there is never a "0" flash for partially
 * visible or restored-scroll elements, and if observer callbacks
 * never arrive (hidden/background tab) the final value simply stays
 * put. The animation's first frame starts at 0 anyway, and the
 * observer disconnects on first trigger so scrolling away and back
 * never restarts it. `prefers-reduced-motion` and non-numeric values
 * ("—") render the final text immediately. The animated span is
 * aria-hidden with the real value alongside for screen readers, so
 * the rapid text churn is never announced.
 */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(value);

  useEffect(() => {
    const el = ref.current;
    const match = value.match(/[\d,]*\d/);
    if (!el || !match || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = Number(match[0].replace(/,/g, ""));
    if (!Number.isFinite(target)) return;
    const prefix = value.slice(0, match.index);
    const suffix = value.slice((match.index ?? 0) + match[0].length);
    const format = (n: number) =>
      `${prefix}${n.toLocaleString("en-AU")}${suffix}`;

    let frame = 0;
    const run = () => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / DURATION_MS, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setText(format(Math.round(eased * target)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect(); // run once — never restarts on re-entry
          run();
        }
      },
      { threshold: VISIBILITY_THRESHOLD }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
