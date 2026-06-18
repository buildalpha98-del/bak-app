"use server";

// ============================================================
// Bookings dashboard — status pulse server action
// ============================================================
//
// Powers the inline "N today · M waitlist expiring · K packages low ·
// F new this week" strip above the bookings dashboard. Each count is a
// link-to-jump that flips a query param on the dashboard so the
// operator can drill into the work.
//
// Implementation notes:
//   - All four counts use `head: true` count queries to avoid hauling
//     rows back across the wire for a pure aggregate.
//   - Waitlist expiring uses a 24h forward window from now() and
//     ignores rows that have already expired.
//   - Packages-low is gated to active balances only (don't count
//     expired/used_up rows).
//   - Errors swallow to zeros so a single broken query doesn't blank
//     the whole page; mirrors the staff + centres pulse patterns.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";
import {
  resolveCompareWindow,
  countRowsInWindow,
} from "@/lib/comparison/pulse-helpers";
import type { PeriodKey } from "@/lib/comparison/period";

export interface BookingsStatusPulse {
  todaysSessionsCount: number;
  waitlistExpiringCount: number;
  packagesLowCount: number;
  newBookingsThisWeekCount: number;
}

export async function getBookingsStatusPulse(): Promise<BookingsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const in24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();
    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();

    // ============================================================
    // Fan out the four counts in parallel.
    // ============================================================

    const [
      todaysSessionsRes,
      waitlistExpiringRes,
      packagesLowRes,
      newBookingsRes,
    ] = await Promise.all([
      supabase
        .from("bookable_sessions")
        .select("id", { count: "exact", head: true })
        .eq("date", todayIso),
      supabase
        .from("waitlist")
        .select("id", { count: "exact", head: true })
        .gte("expires_at", nowIso)
        .lte("expires_at", in24hIso),
      supabase
        .from("package_balances")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .lte("remaining_sessions", 2),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .gte("booked_at", mondayIso),
    ]);

    return {
      todaysSessionsCount: todaysSessionsRes.count ?? 0,
      waitlistExpiringCount: waitlistExpiringRes.count ?? 0,
      packagesLowCount: packagesLowRes.count ?? 0,
      newBookingsThisWeekCount: newBookingsRes.count ?? 0,
    };
  } catch (err) {
    console.error("getBookingsStatusPulse error:", err);
    return {
      todaysSessionsCount: 0,
      waitlistExpiringCount: 0,
      packagesLowCount: 0,
      newBookingsThisWeekCount: 0,
    };
  }
}

// ============================================================
// Bookings pulse — compare variant
// ============================================================
//
// Only "new bookings" has a meaningful prior-period equivalent
// (today's sessions and waitlist are point-in-time). We return just
// `newBookingsCount` for the prior window so the UI can render a
// delta on the new-this-week card.

export async function getBookingsStatusPulseWithCompare(opts?: {
  compareTo?: PeriodKey;
}): Promise<{
  current: BookingsStatusPulse;
  previous?: { newBookingsCount: number };
  compareLabel?: string;
}> {
  const current = await getBookingsStatusPulse();
  if (!opts?.compareTo) return { current };

  try {
    const win = await resolveCompareWindow(opts.compareTo);
    const newBookingsCount = await countRowsInWindow({
      table: "bookings",
      dateColumn: "booked_at",
      startIso: win.startIso,
      endIso: win.endIso,
      filters: { status: "confirmed" },
    });
    return {
      current,
      previous: { newBookingsCount },
      compareLabel: win.period.label,
    };
  } catch (err) {
    console.error("getBookingsStatusPulseWithCompare error:", err);
    return { current };
  }
}
