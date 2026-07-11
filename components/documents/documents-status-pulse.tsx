"use client";

// ============================================================
// Documents — inline status pulse strip
// ============================================================
//
// Mirrors the centres / staff / children / programmes / training
// pulse pattern. Four counts: uploaded this week, pending review,
// expiring soon (90+ day compliance docs), no tags. Brand orange
// when a count is > 0, muted when zero. Numbers tick up via
// `useCountUp` to match the rest of the dashboard refresh.

import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Tag,
  Upload,
} from "lucide-react";
import type { DocumentsStatusPulse } from "@/lib/documents/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface DocumentsStatusPulseStripProps {
  pulse: DocumentsStatusPulse;
  /** "/admin/documents" or "/ops/documents" — jump-links keep us in scope. */
  basePath: string;
}

export function DocumentsStatusPulseStrip({
  pulse,
  basePath,
}: DocumentsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Upload}
          count={pulse.uploadedThisWeekCount}
          label={
            pulse.uploadedThisWeekCount === 1
              ? "uploaded this week"
              : "uploaded this week"
          }
          href={`${basePath}?range=this_week`}
        />
        <Divider />
        <PulseStat
          icon={Clock}
          count={pulse.pendingReviewCount}
          label={
            pulse.pendingReviewCount === 1
              ? "pending review"
              : "pending review"
          }
          href={`${basePath}?tag=needs_review`}
        />
        <Divider />
        <PulseStat
          icon={AlertTriangle}
          count={pulse.expiringSoonCount}
          label={
            pulse.expiringSoonCount === 1
              ? "expiring soon"
              : "expiring soon"
          }
          href={`${basePath}?category=compliance&age=expiring`}
        />
        <Divider />
        <PulseStat
          icon={Tag}
          count={pulse.noTagsCount}
          label={
            pulse.noTagsCount === 1
              ? "untagged document"
              : "untagged documents"
          }
          href={`${basePath}?tag=untagged`}
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  href: string;
}) {
  const active = count > 0;
  const ticked = useCountUp(count);
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40"
      >
        <Icon
          className={
            active
              ? "size-3.5 text-primary"
              : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? "text-base font-semibold tabular-nums text-primary"
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
