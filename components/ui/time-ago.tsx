"use client";

import { useEffect, useState } from "react";
import {
  formatTimeAgo,
  formatAbsoluteDate,
  formatAbsoluteDateTime,
} from "@/lib/utils/time-ago";

interface TimeAgoProps {
  /** ISO timestamp. */
  timestamp: string;
  className?: string;
}

/**
 * Renders "3h ago", without breaking hydration.
 *
 * A relative time computed during render is a hydration bug by
 * construction: the server renders "5m ago" at SSR, the browser
 * hydrates a moment later and computes "6m ago", and React throws #418
 * on the mismatch — discarding the server's HTML and re-rendering the
 * whole tree on the client. It is racy, so it reproduces on a real
 * deployment (network latency crossing a minute boundary) and almost
 * never on localhost, which is exactly how it survived this long.
 *
 * So the first render — server AND client — shows a fixed absolute date,
 * which cannot disagree. The relative text arrives in an effect, after
 * hydration is done. It then re-ticks every 30s, which also fixes the
 * older bug of a timestamp reading "2m ago" an hour later.
 */
export function TimeAgo({ timestamp, className }: TimeAgoProps) {
  const [relative, setRelative] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setRelative(formatTimeAgo(timestamp, Date.now()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [timestamp]);

  return (
    <time
      dateTime={timestamp}
      title={formatAbsoluteDateTime(timestamp)}
      className={className}
    >
      {relative ?? formatAbsoluteDate(timestamp)}
    </time>
  );
}
