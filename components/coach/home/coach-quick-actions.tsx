"use client";

// ============================================================
// Coach Home — Quick Actions row
// ============================================================
//
// Four primary actions a coach reaches for daily. Stacked 2×2 on
// phones and a single row on tablets+. Each tile is at least 44px
// tall, with a subtle hover-lift and a single brand-orange icon
// chip — restrained orange per the design refresh pattern.

import Link from "next/link";
import {
  Calendar,
  ClipboardList,
  GraduationCap,
  MessageSquare,
} from "lucide-react";

interface CoachQuickActionsProps {
  /** Optional inline count badges. */
  shiftsCount?: number;
  formsCount?: number;
  trainingCount?: number;
  messagesCount?: number;
}

const ITEMS = [
  {
    key: "shifts" as const,
    label: "Schedule",
    icon: Calendar,
    href: "/coach/schedule",
  },
  {
    key: "forms" as const,
    label: "Forms",
    icon: ClipboardList,
    href: "/coach/forms",
  },
  {
    key: "training" as const,
    label: "Training",
    icon: GraduationCap,
    href: "/coach/training",
  },
  {
    key: "messages" as const,
    label: "Messages",
    icon: MessageSquare,
    href: "/coach/messages",
  },
];

export function CoachQuickActions({
  shiftsCount,
  formsCount,
  trainingCount,
  messagesCount,
}: CoachQuickActionsProps) {
  const countMap: Record<string, number | undefined> = {
    shifts: shiftsCount,
    forms: formsCount,
    training: trainingCount,
    messages: messagesCount,
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ITEMS.map(({ key, label, icon: Icon, href }) => {
        const c = countMap[key];
        const showBadge = c != null && c > 0;
        return (
          <Link
            key={key}
            href={href}
            className="group flex min-h-[72px] items-center gap-3 rounded-2xl border bg-background p-3 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm active:translate-y-0"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF3EB] text-primary">
              <Icon className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-foreground">
                {label}
              </span>
              {showBadge && (
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {c}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
