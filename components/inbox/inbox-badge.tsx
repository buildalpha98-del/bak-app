"use client";

// ============================================================
// Sidebar badge — urgent + important counts
// ============================================================
//
// Polls `getInboxCounts` every 30s. Shows nothing when both
// urgent and important are zero (informational doesn't deserve a
// badge nudge — that's the timeline's job).
//
// Rendered inside the sidebar nav slot for the "Inbox" item only.

import * as React from "react";
import { cn } from "@/lib/utils";
import { getInboxCounts } from "@/lib/inbox/actions";
import { updateAppBadge } from "@/lib/badge/badge";
import type { InboxCounts } from "@/lib/inbox/types";

interface InboxBadgeProps {
  /** Initial counts seeded by the dashboard layout — avoids a flicker. */
  initial?: InboxCounts;
  /** Show in collapsed/expanded sidebar variants. */
  variant?: "expanded" | "collapsed";
}

export function InboxBadge({
  initial,
  variant = "expanded",
}: InboxBadgeProps) {
  const [counts, setCounts] = React.useState<InboxCounts>(
    initial ?? { urgent: 0, important: 0, informational: 0 },
  );

  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await getInboxCounts();
        if (!cancelled) setCounts(next);
      } catch (err) {
        console.error("InboxBadge poll error:", err);
      }
    };
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const total = counts.urgent + counts.important;

  // Mirror the visible badge onto the home-screen icon via the
  // Badging API so installed PWAs show an unread dot like a native
  // app. No-op on unsupported browsers.
  React.useEffect(() => {
    void updateAppBadge(total);
  }, [total]);

  if (total === 0) return null;

  const display = total > 99 ? "99+" : String(total);
  const colour =
    counts.urgent > 0
      ? "bg-red-500 text-white"
      : "bg-primary text-white";

  return (
    <span
      aria-label={`${counts.urgent} urgent, ${counts.important} important`}
      className={cn(
        "inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none",
        variant === "collapsed" ? "h-4" : "h-4.5 ml-auto",
        colour,
      )}
    >
      {display}
    </span>
  );
}
