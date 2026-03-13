"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarCheck,
  ArrowLeftRight,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import type { PendingActionCounts } from "@/lib/sessions/coach-actions";

// ============================================================
// Props
// ============================================================

interface PendingActionsCardProps {
  counts: PendingActionCounts;
}

// ============================================================
// Action row config
// ============================================================

const ACTION_ITEMS = [
  {
    key: "pendingShifts" as const,
    icon: CalendarCheck,
    label: "Shifts to confirm",
    href: "/coach/schedule?filter=pending",
  },
  {
    key: "swapRequests" as const,
    icon: ArrowLeftRight,
    label: "Swap requests",
    href: "/coach/schedule?filter=swaps",
  },
  {
    key: "onboardingItems" as const,
    icon: ShieldCheck,
    label: "Compliance items",
    href: "/coach/profile",
  },
];

// ============================================================
// Component
// ============================================================

export function PendingActionsCard({ counts }: PendingActionsCardProps) {
  const total =
    counts.pendingShifts + counts.swapRequests + counts.onboardingItems;

  if (total === 0) return null;

  return (
    <Card className="card-hover">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Pending Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {ACTION_ITEMS.map(({ key, icon: Icon, label, href }) => {
          const count = counts[key];
          if (count === 0) return null;

          return (
            <Link
              key={key}
              href={href}
              className="flex items-center gap-3 border-t border-border/50 px-4 py-3 transition-colors duration-200 active:bg-secondary/50 min-h-[44px]"
            >
              <Icon className="size-5 text-muted-foreground" />
              <span className="flex-1 text-sm text-foreground">{label}</span>
              <Badge
                variant="secondary"
                className="bg-[var(--brand-orange-light)] text-primary font-semibold min-w-[24px] justify-center"
              >
                {count}
              </Badge>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
