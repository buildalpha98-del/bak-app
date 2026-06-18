"use server";

// ============================================================
// Client portal — status pulse server actions
// ============================================================
//
// Two pulses surface "what's worth a glance" for a centre director:
//
//   getClientStatusPulse(centreId) — the home / dashboard pulse strip.
//     1. nextSessionDays         — days until the next published
//        session at this centre. `null` means "no upcoming session".
//        Reads `sessions` filtered to date >= today + published-ish
//        statuses.
//     2. unreadReportsCount      — `centre_reports.status='sent'` sent
//        within the last 14 days. We don't track per-user read state,
//        so this is "reports sent recently" as a proxy for "new since
//        you were last here".
//     3. unpaidInvoicesCount     — `outbound_invoices.status IN
//        ('sent','partially_paid','overdue')`. Their own bills only —
//        not coach payroll. No financial-access gate is applied here
//        because the bills *are* the centre's own money.
//     4. newFeedbackThisTermCount — `feedback_ratings` rows authored
//        against this centre during the last 90 days. There is no
//        feedback_source column today, so the count is "feedback you
//        have submitted lately" used as a participation signal.
//
//   getClientPortalPulse(centreId) — sub-page counters used by the
//   pulse strips on /reports, /invoices, /feedback, /resources,
//   /messages. Each field is named after its destination strip so
//   the consumer can pick what it needs without re-querying.
//
// Every centre-scoped field is `centre_id`-filtered — never reads
// across centres. Errors swallow to zeros / nulls per the platform
// pattern so a single broken sub-query never blanks the whole strip.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePeriod, type PeriodKey } from "@/lib/comparison/period";

export interface ClientStatusPulse {
  /** Days until next published session at this centre, or null if none. */
  nextSessionDays: number | null;
  /** Reports sent in the last 14 days (proxy for "unread since last visit"). */
  unreadReportsCount: number;
  /** Outbound invoices with status sent / partially_paid / overdue. */
  unpaidInvoicesCount: number;
  /** Feedback the centre has submitted in the last 90 days. */
  newFeedbackThisTermCount: number;
}

export interface ClientPortalPulse {
  // Reports tab
  reportsThisTermCount: number;
  reportsNewThisWeekCount: number;
  // Invoices tab
  invoicesOverdueCount: number;
  invoicesUnpaidCount: number;
  invoicesPaidThisMonthCount: number;
  // Feedback tab
  feedbackSubmittedThisTermCount: number;
  feedbackPendingCount: number;
  // Resources tab — documents are global (visibility='all'),
  // so "new this month" / "policies" are platform-wide counters.
  resourcesNewThisMonthCount: number;
  resourcesPoliciesCount: number;
  // Messages tab
  messagesUnreadCount: number;
}

function fourteenDaysAgoIso(): string {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
}

function ninetyDaysAgoIso(): string {
  return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
}

function mondayIso(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const a = new Date(fromIsoDate + "T00:00:00");
  const b = new Date(toIsoDate + "T00:00:00");
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getClientStatusPulse(
  centreId: string,
): Promise<ClientStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = todayIsoDate();

    const [nextSessionRes, unreadReportsRes, unpaidInvoicesRes, feedbackRes] =
      await Promise.all([
        supabase
          .from("sessions")
          .select("date")
          .eq("centre_id", centreId)
          .gte("date", today)
          .in("status", ["published", "pending_confirmation", "confirmed"])
          .order("date", { ascending: true })
          .order("time", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("centre_reports")
          .select("id", { count: "exact", head: true })
          .eq("centre_id", centreId)
          .eq("status", "sent")
          .gte("sent_at", fourteenDaysAgoIso()),
        supabase
          .from("outbound_invoices")
          .select("id", { count: "exact", head: true })
          .eq("centre_id", centreId)
          .in("status", ["sent", "partially_paid", "overdue"]),
        supabase
          .from("feedback_ratings")
          .select("id", { count: "exact", head: true })
          .eq("centre_id", centreId)
          .gte("submitted_at", ninetyDaysAgoIso()),
      ]);

    const nextDate = (nextSessionRes.data as { date: string } | null)?.date ?? null;
    const nextSessionDays = nextDate ? daysBetween(today, nextDate) : null;

    return {
      nextSessionDays,
      unreadReportsCount: unreadReportsRes.count ?? 0,
      unpaidInvoicesCount: unpaidInvoicesRes.count ?? 0,
      newFeedbackThisTermCount: feedbackRes.count ?? 0,
    };
  } catch (err) {
    console.error("getClientStatusPulse error:", err);
    return {
      nextSessionDays: null,
      unreadReportsCount: 0,
      unpaidInvoicesCount: 0,
      newFeedbackThisTermCount: 0,
    };
  }
}

// ============================================================
// Client pulse — compare variant
// ============================================================
//
// For the centre director, the meaningful comparison is "how
// many sessions did our centre run this week vs last week" — a
// stability/growth signal. We also surface a delta on completed
// sessions for the prior period so directors can see if their
// programme cadence is holding up.

export async function getClientStatusPulseWithCompare(
  centreId: string,
  opts?: { compareTo?: PeriodKey }
): Promise<{
  current: ClientStatusPulse;
  previous?: { sessionsCount: number };
  /** Current-period session count, paired with the previous count for delta math. */
  thisPeriodSessions?: number;
  compareLabel?: string;
}> {
  const current = await getClientStatusPulse(centreId);
  if (!opts?.compareTo) return { current };

  try {
    const supabase = await createSupabaseServerClient();
    const priorPeriod = await resolvePeriod(opts.compareTo);
    const thisWeek = await resolvePeriod("this_week");

    const [priorRes, currentRes] = await Promise.all([
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .neq("status", "cancelled")
        .gte("date", priorPeriod.start)
        .lte("date", priorPeriod.end),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .neq("status", "cancelled")
        .gte("date", thisWeek.start)
        .lte("date", thisWeek.end),
    ]);

    return {
      current,
      previous: { sessionsCount: priorRes.count ?? 0 },
      thisPeriodSessions: currentRes.count ?? 0,
      compareLabel: priorPeriod.label,
    };
  } catch (err) {
    console.error("getClientStatusPulseWithCompare error:", err);
    return { current };
  }
}

export async function getClientPortalPulse(
  centreId: string,
): Promise<ClientPortalPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const monday = mondayIso();
    const monthStart = startOfMonthIso();
    const ninetyDaysAgo = ninetyDaysAgoIso();
    const thirtyDaysAgoIsoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [
      reportsThisTermRes,
      reportsNewThisWeekRes,
      invoicesOverdueRes,
      invoicesUnpaidRes,
      invoicesPaidThisMonthRes,
      feedbackSubmittedRes,
      completedRecentRes,
      resourcesNewRes,
      resourcesPoliciesRes,
      messagesUnreadRes,
    ] = await Promise.all([
      supabase
        .from("centre_reports")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .eq("status", "sent")
        .gte("sent_at", ninetyDaysAgo),
      supabase
        .from("centre_reports")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .eq("status", "sent")
        .gte("sent_at", monday),
      supabase
        .from("outbound_invoices")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .eq("status", "overdue"),
      supabase
        .from("outbound_invoices")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .in("status", ["sent", "partially_paid"]),
      supabase
        .from("outbound_invoices")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .eq("status", "paid")
        .gte("payment_date", monthStart),
      supabase
        .from("feedback_ratings")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .gte("submitted_at", ninetyDaysAgo),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .eq("status", "completed")
        .gte("date", thirtyDaysAgoIsoDate),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("visibility", "all")
        .in("category", ["risk_assessment", "policy", "centre_doc"])
        .gte("created_at", monthStart),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("visibility", "all")
        .eq("category", "policy"),
      supabase
        .from("centre_messages")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .eq("sender_type", "staff")
        .is("read_at", null),
    ]);

    // Feedback pending = recent completed sessions where no submission
    // has been recorded yet (approximate). We render this as a soft
    // nudge — "rate the last 30 days of sessions" — rather than a hard
    // gate. Negative deltas can occur if a centre rates older sessions,
    // so we clamp at zero.
    const completedRecent = completedRecentRes.count ?? 0;
    const submitted = feedbackSubmittedRes.count ?? 0;
    const feedbackPendingCount = Math.max(0, completedRecent - submitted);

    return {
      reportsThisTermCount: reportsThisTermRes.count ?? 0,
      reportsNewThisWeekCount: reportsNewThisWeekRes.count ?? 0,
      invoicesOverdueCount: invoicesOverdueRes.count ?? 0,
      invoicesUnpaidCount: invoicesUnpaidRes.count ?? 0,
      invoicesPaidThisMonthCount: invoicesPaidThisMonthRes.count ?? 0,
      feedbackSubmittedThisTermCount: submitted,
      feedbackPendingCount,
      resourcesNewThisMonthCount: resourcesNewRes.count ?? 0,
      resourcesPoliciesCount: resourcesPoliciesRes.count ?? 0,
      messagesUnreadCount: messagesUnreadRes.count ?? 0,
    };
  } catch (err) {
    console.error("getClientPortalPulse error:", err);
    return {
      reportsThisTermCount: 0,
      reportsNewThisWeekCount: 0,
      invoicesOverdueCount: 0,
      invoicesUnpaidCount: 0,
      invoicesPaidThisMonthCount: 0,
      feedbackSubmittedThisTermCount: 0,
      feedbackPendingCount: 0,
      resourcesNewThisMonthCount: 0,
      resourcesPoliciesCount: 0,
      messagesUnreadCount: 0,
    };
  }
}
