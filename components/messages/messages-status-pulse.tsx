"use client";

// ============================================================
// Messages — inline status pulse strip
// ============================================================

import Link from "next/link";
import { Mail, Clock, Send, AtSign } from "lucide-react";
import type { MessagesStatusPulse } from "@/lib/messages/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface MessagesStatusPulseStripProps {
  pulse: MessagesStatusPulse;
  basePath: string;
}

export function MessagesStatusPulseStrip({
  pulse,
  basePath,
}: MessagesStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Mail}
          count={pulse.unreadCount}
          label={pulse.unreadCount === 1 ? "unread" : "unread"}
          href={`${basePath}?status=unread`}
        />
        <Divider />
        <PulseStat
          icon={Clock}
          count={pulse.awaitingResponseCount}
          label="awaiting response"
          href={`${basePath}?status=awaiting`}
        />
        <Divider />
        <PulseStat
          icon={Send}
          count={pulse.sentTodayCount}
          label="sent today"
          href={`${basePath}?status=sent_today`}
        />
        <Divider />
        <PulseStat
          icon={AtSign}
          count={pulse.mentionsCount}
          label={pulse.mentionsCount === 1 ? "mention" : "mentions"}
          href={`${basePath}?status=mentions`}
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
