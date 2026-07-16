"use client";

// ============================================================
// Admin Quick Actions row
// ============================================================
//
// Sits at the top of /admin (just under the sticky context strip).
// Five fixed actions that cover ~80% of the daily-admin path: create
// a centre, add a coach, publish the week's roster, jump into the
// pipeline, invite parents in bulk.
//
// Layout: single row on lg+, 2-column grid on md, single column on sm.
// Visual style is intentionally restrained — ghost buttons, brand
// orange icons, no shouty hover. The dashboard cards underneath are
// the page's main story; these are a fast jump menu.

import Link from "@/components/ui/app-link";
import {
  Building2,
  UserPlus,
  CalendarCheck2,
  Workflow,
  MailPlus,
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
    label: "Create centre",
    subtext: "new childcare or school",
    href: "/admin/centres/add",
    icon: Building2,
  },
  {
    label: "Add coach",
    subtext: "invite to staff roster",
    href: "/admin/staff/new",
    icon: UserPlus,
  },
  {
    label: "Publish roster",
    subtext: "this week's shifts",
    href: "/admin/roster",
    icon: CalendarCheck2,
  },
  {
    label: "Open CRM",
    subtext: "leads & pipeline",
    href: "/admin/crm",
    icon: Workflow,
  },
  {
    label: "Invite parents",
    subtext: "bulk import & email",
    href: "/admin/parents/import",
    icon: MailPlus,
  },
];

export function QuickActionsRow() {
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
      className="group flex h-14 items-center gap-3 rounded-2xl border bg-background px-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:ring-1 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/20">
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
