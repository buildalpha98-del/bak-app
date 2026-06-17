"use client";

// ============================================================
// Ops Quick Actions row
// ============================================================
//
// Sits at the top of /ops (just under the sticky context strip).
// Five fixed actions that cover Abdul's daily-ops path: publish the
// week's roster, add a session, check clashes, jump to tasks, see
// training overdue.
//
// Visual style mirrors `QuickActionsRow` on /admin — ghost-style
// buttons, restrained orange icon tile, brand-orange ring on hover.

import Link from "next/link";
import {
  CalendarCheck2,
  CalendarPlus,
  ShieldAlert,
  ListChecks,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

interface QuickAction {
  label: string;
  subtext: string;
  href: string;
  icon: LucideIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Publish roster",
    subtext: "this week's shifts",
    href: "/ops/roster",
    icon: CalendarCheck2,
  },
  {
    label: "Add session",
    subtext: "one-off or recurring",
    href: "/ops/roster?action=new",
    icon: CalendarPlus,
  },
  {
    label: "Check clashes",
    subtext: "compliance + overlaps",
    href: "/ops/roster?view=conflicts",
    icon: ShieldAlert,
  },
  {
    label: "View tasks",
    subtext: "mine + team",
    href: "/ops/tasks?mine=yes",
    icon: ListChecks,
  },
  {
    label: "Training overdue",
    subtext: "coaches behind",
    href: "/ops/training/assignments?status=overdue",
    icon: GraduationCap,
  },
];

export function OpsQuickActionsRow() {
  return (
    <nav
      aria-label="Quick actions"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
    >
      {QUICK_ACTIONS.map((action) => (
        <QuickActionLink key={action.href} action={action} />
      ))}
    </nav>
  );
}

function QuickActionLink({ action }: { action: QuickAction }) {
  const Icon = action.icon;
  return (
    <Link
      href={action.href}
      className="group flex h-14 items-center gap-3 rounded-2xl border bg-background px-4 transition hover:-translate-y-0.5 hover:border-[#E8712A]/40 hover:shadow-md hover:ring-1 hover:ring-[#E8712A]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8712A]/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#E8712A]/10 text-[#E8712A] transition group-hover:bg-[#E8712A]/20">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-foreground">
          {action.label}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {action.subtext}
        </span>
      </span>
    </Link>
  );
}
