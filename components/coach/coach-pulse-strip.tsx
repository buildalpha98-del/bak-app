"use client";

// ============================================================
// Coach — reusable pulse strip
// ============================================================
//
// Generic strip used at the top of every "lighter" coach surface
// (forms / training / messages / invoicing / docs / tasks /
// assessments / announcements / equipment / notifications).
//
// Each item is a single number + label; the icon/number turns brand
// orange when the count > 0 AND the item is flagged as `accent`
// (e.g. "overdue", "urgent"). Optional `href` makes the item a tap
// target — passing nothing leaves it as plain text.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useCountUp } from "@/components/launch/use-count-up";

export interface CoachPulseItem {
  icon: LucideIcon;
  count: number;
  label: string;
  /** When true and count > 0, render in brand orange. */
  accent?: boolean;
  /** Optional drill-through link. */
  href?: string;
}

export function CoachPulseStrip({ items }: { items: CoachPulseItem[] }) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            <PulseStat item={item} />
            {i < items.length - 1 && (
              <span
                aria-hidden
                className="hidden h-4 w-px bg-border sm:inline-block"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PulseStat({ item }: { item: CoachPulseItem }) {
  const { icon: Icon, count, label, accent, href } = item;
  const active = accent === true && count > 0;
  const ticked = useCountUp(count);

  const body = (
    <>
      <Icon
        className={
          active
            ? "size-3.5 text-[#E8712A]"
            : "size-3.5 text-muted-foreground"
        }
      />
      <span
        className={
          active
            ? "text-base font-semibold tabular-nums text-[#E8712A]"
            : "text-base font-semibold tabular-nums text-muted-foreground"
        }
      >
        {ticked}
      </span>
      <span
        className={
          active
            ? "text-sm text-foreground"
            : "text-sm text-muted-foreground"
        }
      >
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group inline-flex min-h-[44px] items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40"
      >
        {body}
      </Link>
    );
  }
  return (
    <span className="inline-flex min-h-[44px] items-center gap-1.5 px-1">
      {body}
    </span>
  );
}
