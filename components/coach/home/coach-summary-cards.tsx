"use client";

// ============================================================
// Coach Home — Summary Cards
// ============================================================
//
// Four compact stat cards that punctuate the home page below the
// Today panel. Each tick-up via useCountUp on first render. Brand
// orange is reserved for the "needs my attention" card (overdue
// forms); everything else stays muted to keep colour meaningful.

import Link from "@/components/ui/app-link";
import {
  CalendarDays,
  CalendarCheck2,
  ClipboardX,
  Megaphone,
} from "lucide-react";
import { useCountUp } from "@/components/launch/use-count-up";

interface CoachSummaryCardsProps {
  todayCount: number;
  weekCount: number;
  overdueFormsCount: number;
  unreadAnnouncementsCount: number;
}

export function CoachSummaryCards({
  todayCount,
  weekCount,
  overdueFormsCount,
  unreadAnnouncementsCount,
}: CoachSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <SummaryCard
        label="Today"
        count={todayCount}
        icon={CalendarDays}
        href="/coach/schedule"
        accent={false}
      />
      <SummaryCard
        label="This week"
        count={weekCount}
        icon={CalendarCheck2}
        href="/coach/schedule?tab=week"
        accent={false}
      />
      <SummaryCard
        label={overdueFormsCount === 1 ? "Form overdue" : "Forms overdue"}
        count={overdueFormsCount}
        icon={ClipboardX}
        href="/coach/forms?filter=overdue"
        accent={overdueFormsCount > 0}
      />
      <SummaryCard
        label="Unread news"
        count={unreadAnnouncementsCount}
        icon={Megaphone}
        href="/coach/announcements?filter=unread"
        accent={false}
      />
    </div>
  );
}

function SummaryCard({
  label,
  count,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  accent: boolean;
}) {
  const ticked = useCountUp(count);
  return (
    <Link
      href={href}
      className={[
        "group flex min-h-[88px] flex-col justify-between rounded-2xl border bg-background p-3 transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0",
        accent
          ? "border-primary/40 hover:border-primary/60"
          : "hover:border-border",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground group-hover:text-foreground">
          {label}
        </span>
        <Icon
          className={
            accent
              ? "size-4 text-primary"
              : "size-4 text-muted-foreground"
          }
        />
      </div>
      <span
        className={[
          "text-2xl font-bold tabular-nums leading-none",
          accent ? "text-primary" : "text-foreground",
        ].join(" ")}
      >
        {ticked}
      </span>
    </Link>
  );
}
