"use server";

// ============================================================
// Invoicing — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/invoicing
// and /ops/invoicing. Four counts surface "what to look at first":
//
//   1. Overdue invoices       — `outbound_invoices` rows with
//      status='sent' AND due_date < CURRENT_DATE. Or coach invoices
//      where status='sent' AND sent_at older than 14 days.
//      We focus on outbound (centre-billed) — that's the AR side.
//   2. Awaiting payment       — `outbound_invoices` rows with
//      status='sent' (any age). The day-to-day collections funnel.
//   3. Flagged for review     — `coach_invoices` rows with
//      status='flagged'. Each one needs an ops human eye.
//   4. Sent this week         — `outbound_invoices` rows where
//      `sent_at >= Monday`. Velocity signal for billing cadence.
//
// All Supabase calls fan out in parallel.
// Errors swallow to zeros so a single broken sub-query doesn't blank
// the whole page.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";
import {
  resolveCompareWindow,
  countRowsInWindow,
} from "@/lib/comparison/pulse-helpers";
import type { PeriodKey } from "@/lib/comparison/period";

export interface InvoicingStatusPulse {
  overdueInvoicesCount: number;
  awaitingPaymentCount: number;
  flaggedInvoicesCount: number;
  sentThisWeekCount: number;
}

export async function getInvoicingStatusPulse(): Promise<InvoicingStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monday = getMonday(now);
    const mondayIso = monday.toISOString();

    const [overdueRes, awaitingRes, flaggedRes, sentThisWeekRes] =
      await Promise.all([
        // Outbound invoices past their due_date and still 'sent'
        supabase
          .from("outbound_invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "sent")
          .lt("due_date", today),
        // All 'sent' outbound invoices
        supabase
          .from("outbound_invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "sent"),
        // Coach invoices flagged for ops review
        supabase
          .from("coach_invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "flagged"),
        // Outbound invoices sent since Monday
        supabase
          .from("outbound_invoices")
          .select("id", { count: "exact", head: true })
          .gte("sent_at", mondayIso),
      ]);

    return {
      overdueInvoicesCount: overdueRes.count ?? 0,
      awaitingPaymentCount: awaitingRes.count ?? 0,
      flaggedInvoicesCount: flaggedRes.count ?? 0,
      sentThisWeekCount: sentThisWeekRes.count ?? 0,
    };
  } catch (err) {
    console.error("getInvoicingStatusPulse error:", err);
    return {
      overdueInvoicesCount: 0,
      awaitingPaymentCount: 0,
      flaggedInvoicesCount: 0,
      sentThisWeekCount: 0,
    };
  }
}

// ============================================================
// Invoicing pulse — compare variant
// ============================================================
//
// "Sent this week" has a direct prior-period analogue. Overdue is a
// rolling snapshot — comparing "overdue right now" to "overdue end
// of last week" needs a historical projection (outbound_invoices
// only carries current state). We surface the comparison only on
// the sent-window count, which is the cleanest signal of billing
// velocity over time.

export async function getInvoicingStatusPulseWithCompare(opts?: {
  compareTo?: PeriodKey;
}): Promise<{
  current: InvoicingStatusPulse;
  previous?: { sentCount: number };
  compareLabel?: string;
}> {
  const current = await getInvoicingStatusPulse();
  if (!opts?.compareTo) return { current };

  try {
    const win = await resolveCompareWindow(opts.compareTo);
    const sentCount = await countRowsInWindow({
      table: "outbound_invoices",
      dateColumn: "sent_at",
      startIso: win.startIso,
      endIso: win.endIso,
    });
    return {
      current,
      previous: { sentCount },
      compareLabel: win.period.label,
    };
  } catch (err) {
    console.error("getInvoicingStatusPulseWithCompare error:", err);
    return { current };
  }
}
