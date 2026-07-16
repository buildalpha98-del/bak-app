"use client";

// ============================================================
// Announcements — inline status pulse strip
// ============================================================

import Link from "@/components/ui/app-link";
import { Megaphone, CalendarDays, EyeOff, MailOpen } from "lucide-react";
import type { AnnouncementsStatusPulse } from "@/lib/announcements/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface AnnouncementsStatusPulseStripProps {
  pulse: AnnouncementsStatusPulse;
  basePath: string;
}

export function AnnouncementsStatusPulseStrip({
  pulse,
  basePath,
}: AnnouncementsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Megaphone}
          count={pulse.sentThisWeekCount}
          label="sent this week"
          href={`${basePath}?period=this_week`}
        />
        <Divider />
        <PulseStat
          icon={CalendarDays}
          count={pulse.sentThisMonthCount}
          label="sent this month"
          href={`${basePath}?period=this_month`}
        />
        <Divider />
        <PulseStat
          icon={EyeOff}
          count={pulse.lowReadCount}
          label="low-read (<30%)"
          href={`${basePath}?read=low`}
          tone="red"
        />
        <Divider />
        <PulseStat
          icon={MailOpen}
          count={pulse.unreadByMeCount}
          label="unread by me"
          href={`${basePath}?read=mine_unread`}
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
  tone = "orange",
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  href: string;
  tone?: "orange" | "red";
}) {
  const active = count > 0;
  const ticked = useCountUp(count);
  const activeText = tone === "red" ? "text-red-600" : "text-primary";
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Icon
          className={
            active
              ? `size-3.5 ${activeText}`
              : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? `text-base font-semibold tabular-nums ${activeText}`
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
