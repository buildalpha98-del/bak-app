"use client";

// ============================================================
// Feedback — inline status pulse strip
// ============================================================
//
// Mirrors the forms / training / programs pulse pattern. Four counts:
// new this week, 1-star unacknowledged, 5-star unacknowledged, no
// response (24h). Brand orange when a count is > 0, muted when zero,
// with one local exception: the 1-star pulse uses red for emphasis
// when active because that row needs an outsized "act now" pull.
// Numbers tick up via `useCountUp` to match the rest of the
// dashboard refresh.

import Link from "next/link";
import {
  MessageSquare,
  AlertTriangle,
  Star,
  Clock,
} from "lucide-react";
import type { FeedbackStatusPulse } from "@/lib/feedback/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface FeedbackStatusPulseStripProps {
  pulse: FeedbackStatusPulse;
  /** "/admin/feedback" or "/ops/feedback" — jump-links stay in scope. */
  basePath: string;
}

export function FeedbackStatusPulseStrip({
  pulse,
  basePath,
}: FeedbackStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={MessageSquare}
          count={pulse.newThisWeekCount}
          label="new this week"
          href={`${basePath}?period=this_week`}
        />
        <Divider />
        <PulseStat
          icon={AlertTriangle}
          count={pulse.oneStarUnackCount}
          label="1-star unacknowledged"
          href={`${basePath}?rating=1&ack=unread`}
          tone="alarm"
        />
        <Divider />
        <PulseStat
          icon={Star}
          count={pulse.fiveStarUnackCount}
          label="5-star unacknowledged"
          href={`${basePath}?rating=5&ack=unread`}
        />
        <Divider />
        <PulseStat
          icon={Clock}
          count={pulse.noResponseCount}
          label="no response (24h+)"
          href={`${basePath}?pending=yes`}
        />
      </ul>
    </div>
  );
}

function Divider() {
  return (
    <li
      aria-hidden
      className="hidden h-4 w-px bg-border sm:inline-block"
    />
  );
}

function PulseStat({
  icon: Icon,
  count,
  label,
  href,
  tone = "brand",
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  href: string;
  /** "alarm" swaps orange → red-500 for emphasis on the 1-star bucket. */
  tone?: "brand" | "alarm";
}) {
  const active = count > 0;
  const ticked = useCountUp(count);
  const accent =
    tone === "alarm" ? "text-red-500" : "text-primary";
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Icon
          className={
            active ? `size-3.5 ${accent}` : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? `text-base font-semibold tabular-nums ${accent}`
              : "text-base font-semibold tabular-nums text-muted-foreground"
          }
        >
          {ticked}
        </span>
        <span
          className={
            active
              ? "text-sm text-foreground group-hover:underline"
              : "text-sm text-muted-foreground group-hover:underline"
          }
        >
          {label}
        </span>
      </Link>
    </li>
  );
}
