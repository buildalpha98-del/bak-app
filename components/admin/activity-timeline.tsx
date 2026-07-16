"use client";

// ============================================================
// Activity timeline + filter chips
// ============================================================
//
// Shared between the home dashboard (Row 5, last 20 items) and the
// /admin/activity full-list page. Renders a vertical timeline with
// dot indicators, with a category chip row above to filter without
// re-fetching.
//
// Filter chips are intentionally simple (client-side category map) —
// `getRecentActivity()` already returns mixed types in one shot, so
// switching between "All" and "Centres" is just a list slice.

import { useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Receipt,
  UserPlus,
  Clock,
  type LucideIcon,
} from "lucide-react";
import type { ActivityItem } from "@/lib/launch/dashboard-actions";
import { TimeAgo } from "@/components/ui/time-ago";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

type ActivityCategory =
  | "all"
  | "sessions"
  | "centres"
  | "coaches"
  | "payments"
  | "crm";

const CHIPS: Array<{ value: ActivityCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "sessions", label: "Sessions" },
  { value: "centres", label: "Centres" },
  { value: "coaches", label: "Coaches" },
  { value: "payments", label: "Payments" },
  { value: "crm", label: "CRM" },
];

function categoryFor(item: ActivityItem): Exclude<ActivityCategory, "all"> {
  switch (item.type) {
    case "new_centre":
      return "centres";
    case "new_coach":
      return "coaches";
    case "session_completed":
      return "sessions";
    case "invoice_paid":
      return "payments";
    case "new_booking":
      return "crm";
    default:
      return "centres";
  }
}

function getStyle(type: ActivityItem["type"]): { icon: LucideIcon; iconBg: string; iconColour: string } {
  switch (type) {
    case "new_centre":
      return { icon: Building2, iconBg: "bg-primary/10", iconColour: "text-primary" };
    case "new_booking":
      return { icon: Calendar, iconBg: "bg-blue-100", iconColour: "text-blue-600" };
    case "session_completed":
      return { icon: CheckCircle2, iconBg: "bg-green-100", iconColour: "text-green-600" };
    case "invoice_paid":
      return { icon: Receipt, iconBg: "bg-emerald-100", iconColour: "text-emerald-600" };
    case "new_coach":
      return { icon: UserPlus, iconBg: "bg-purple-100", iconColour: "text-purple-600" };
    default:
      return { icon: Clock, iconBg: "bg-muted", iconColour: "text-muted-foreground" };
  }
}

// "Today" means today in Sydney, stated explicitly. getDate() and
// friends read the RUNTIME's timezone, so the server answered in UTC
// while the browser answered in Sydney — for ten hours a day they
// disagreed, the dot rendered a different colour on each side, and
// hydration broke (React #418). Comparing Sydney date strings gives
// both sides the same answer.
function isToday(ts: string): boolean {
  return sydneyTodayIso(new Date(ts)) === sydneyTodayIso();
}

export interface ActivityTimelineProps {
  items: ActivityItem[];
  /** Cap the rendered list to this many items after filtering. */
  maxItems?: number;
  /** Show the category chip filter row above the timeline. */
  showChips?: boolean;
  /** Optional empty-state copy. */
  emptyMessage?: string;
}

export function ActivityTimeline({
  items,
  maxItems,
  showChips = true,
  emptyMessage = "No activity yet.",
}: ActivityTimelineProps) {
  const [category, setCategory] = useState<ActivityCategory>("all");

  const filtered = useMemo(() => {
    const list = category === "all" ? items : items.filter((i) => categoryFor(i) === category);
    return typeof maxItems === "number" ? list.slice(0, maxItems) : list;
  }, [category, items, maxItems]);

  return (
    <div className="space-y-3">
      {showChips && (
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => {
            const active = chip.value === category;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setCategory(chip.value)}
                aria-pressed={active}
                className={
                  active
                    ? "rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition"
                    : "rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                }
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="relative space-y-3">
          {/* connecting line */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-[15px] top-2 bottom-2 w-px bg-border"
          />
          {filtered.map((item, idx) => {
            const { icon: Icon, iconBg, iconColour } = getStyle(item.type);
            const dotToday = isToday(item.timestamp);
            return (
              <li
                key={`${item.type}-${item.entityId ?? "x"}-${idx}`}
                className="relative flex items-start gap-3 pl-0"
              >
                <span
                  className={
                    "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background " +
                    iconBg
                  }
                >
                  <Icon className={"size-4 " + iconColour} />
                  <span
                    aria-hidden
                    className={
                      "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background " +
                      (dotToday ? "bg-primary" : "bg-muted-foreground/60")
                    }
                  />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm leading-snug">{item.description}</p>
                  <TimeAgo
                    timestamp={item.timestamp}
                    className="text-xs text-muted-foreground"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
