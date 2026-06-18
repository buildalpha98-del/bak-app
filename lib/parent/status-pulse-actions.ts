"use server";

// ============================================================
// Parent portal — status pulse server actions
// ============================================================
//
// Two pulses surface "what's worth a glance" for a logged-in parent:
//
//   getParentStatusPulse() — the /parent home strip.
//     1. nextSessionDays        — days until the next confirmed
//        booking for this parent. `null` if no upcoming sessions.
//     2. unpaidBookingsCount    — bookings with status
//        `pending_payment`. Parents need to nudge these along.
//     3. waitlistOffersCount    — waitlist rows offered to the parent
//        with offer_expires_at still in the future. These are the
//        most time-sensitive items they have.
//     4. newInsightsCount       — child_insights rows for any of the
//        parent's kids created within the last 14 days. Acts as the
//        "new development insight available" badge.
//     5. expiringPackagesCount  — package_balances expiring in the
//        next 7 days (or with remaining_sessions <= 1). Soft nudge
//        to use it or buy another.
//
//   getParentBookingPulse() — the /parent/book strip.
//     1. sessionsAvailableTodayCount — published bookable_sessions
//        with date = today and spots remaining.
//     2. nextAvailableDays           — days until the next available
//        session (any future date with spots).
//     3. onWaitlistCount             — waitlist rows the parent is
//        currently on (status = 'waiting' or 'offered').
//     4. packagesEndingSoonCount     — same as expiringPackagesCount
//        — surfaced again on /book to nudge parents to use credits.
//
// Every query is scoped to the caller's parent_profiles.id. We resolve
// the profile id once and fan out the queries in parallel. Errors
// swallow to zeros / nulls so a single broken sub-query never blanks
// the whole strip — same pattern as the client pulse.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ParentStatusPulse {
  /** Days until next confirmed booking, or null if none. */
  nextSessionDays: number | null;
  /** Bookings in pending_payment status. */
  unpaidBookingsCount: number;
  /** Waitlist rows offered to this parent (offer_expires_at > now). */
  waitlistOffersCount: number;
  /** child_insights created in the last 14 days for any of the parent's kids. */
  newInsightsCount: number;
  /** Active package balances expiring in next 7 days or with <=1 session left. */
  expiringPackagesCount: number;
  /** Coach status broadcasts touching this parent's kids today. */
  statusUpdatesTodayCount: number;
}

export interface ParentBookingPulse {
  /** Open bookable_sessions with date = today and spots remaining. */
  sessionsAvailableTodayCount: number;
  /** Days until next available session, or null if none. */
  nextAvailableDays: number | null;
  /** Active waitlist entries (waiting or offered). */
  onWaitlistCount: number;
  /** Same expiring-soon package count as the home strip — surfaced on /book too. */
  packagesEndingSoonCount: number;
}

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

function nowIso(): string {
  return new Date().toISOString();
}

function sevenDaysFromNowIso(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function fourteenDaysAgoIso(): string {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const a = new Date(fromIsoDate + "T00:00:00");
  const b = new Date(toIsoDate + "T00:00:00");
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

async function resolveParentContext(): Promise<
  | {
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      parentId: string;
      childIds: string[];
    }
  | null
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: parentProfile } = await supabase
    .from("parent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!parentProfile) return null;

  const { data: children } = await supabase
    .from("parent_children")
    .select("child_id")
    .eq("parent_id", parentProfile.id);

  const childIds = (children ?? [])
    .map((c) => (c as { child_id: string }).child_id)
    .filter(Boolean);

  return { supabase, parentId: parentProfile.id, childIds };
}

export async function getParentStatusPulse(): Promise<ParentStatusPulse> {
  try {
    const ctx = await resolveParentContext();
    if (!ctx) {
      return {
        nextSessionDays: null,
        unpaidBookingsCount: 0,
        waitlistOffersCount: 0,
        newInsightsCount: 0,
        expiringPackagesCount: 0,
        statusUpdatesTodayCount: 0,
      };
    }

    const { supabase, parentId, childIds } = ctx;
    const today = todayIsoDate();
    const now = nowIso();

    const [
      nextSessionRes,
      unpaidBookingsRes,
      waitlistOffersRes,
      newInsightsRes,
      expiringPackagesRes,
    ] = await Promise.all([
      supabase
        .from("bookings")
        .select("bookable_sessions(date)")
        .eq("parent_id", parentId)
        .eq("status", "confirmed")
        .gte("bookable_sessions.date", today)
        .order("created_at", { ascending: true })
        .limit(20),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", parentId)
        .eq("status", "pending_payment"),
      supabase
        .from("waitlist")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", parentId)
        .eq("status", "offered")
        .gt("offer_expires_at", now),
      childIds.length > 0
        ? supabase
            .from("child_insights")
            .select("id", { count: "exact", head: true })
            .in("child_id", childIds)
            .gte("created_at", fourteenDaysAgoIso())
        : Promise.resolve({ count: 0, data: null, error: null }),
      supabase
        .from("package_balances")
        .select("expires_at, remaining_sessions")
        .eq("parent_id", parentId)
        .eq("status", "active"),
    ]);

    // nextSessionDays — pull the earliest future date out of the
    // bookable_sessions join. Supabase doesn't apply gte against
    // joined tables consistently, so we filter client-side.
    const bookingRows =
      (nextSessionRes.data as Array<{
        bookable_sessions: { date: string } | null;
      }> | null) ?? [];
    const futureDates = bookingRows
      .map((b) => b.bookable_sessions?.date)
      .filter((d): d is string => typeof d === "string" && d >= today)
      .sort();
    const nextSessionDays = futureDates[0]
      ? daysBetween(today, futureDates[0])
      : null;

    // expiringPackagesCount — client-side filter for "expiring soon"
    // since Supabase can't OR an expires_at range against a remaining
    // <= 1 condition in a single query without RPC.
    const sevenDaysIso = sevenDaysFromNowIso();
    const packageRows =
      (expiringPackagesRes.data as Array<{
        expires_at: string;
        remaining_sessions: number;
      }> | null) ?? [];
    const expiringPackagesCount = packageRows.filter((p) => {
      const expiringSoon =
        p.expires_at && p.expires_at <= sevenDaysIso && p.expires_at >= now;
      const almostUsedUp = p.remaining_sessions <= 1;
      return expiringSoon || almostUsedUp;
    }).length;

    // statusUpdatesTodayCount — count notifications of type
    // `coach_session_status_broadcast` delivered to this user today.
    // notifications.user_id is the auth.users id (not parent_profiles.id),
    // so we re-fetch it from the session — cheap because RLS guarantees
    // we're already authenticated here.
    let statusUpdatesTodayCount = 0;
    const startOfDay = `${today}T00:00:00.000Z`;
    const {
      data: { user: parentUser },
    } = await supabase.auth.getUser();
    if (parentUser) {
      const { count: broadcastCount } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", parentUser.id)
        .eq("type", "coach_session_status_broadcast")
        .gte("created_at", startOfDay);
      statusUpdatesTodayCount = broadcastCount ?? 0;
    }

    return {
      nextSessionDays,
      unpaidBookingsCount: unpaidBookingsRes.count ?? 0,
      waitlistOffersCount: waitlistOffersRes.count ?? 0,
      newInsightsCount: newInsightsRes.count ?? 0,
      expiringPackagesCount,
      statusUpdatesTodayCount,
    };
  } catch (err) {
    console.error("getParentStatusPulse error:", err);
    return {
      nextSessionDays: null,
      unpaidBookingsCount: 0,
      waitlistOffersCount: 0,
      newInsightsCount: 0,
      expiringPackagesCount: 0,
      statusUpdatesTodayCount: 0,
    };
  }
}

// ============================================================
// /parent/kids pulse — counts per the parent's owned children.
// Computed from child_insights, session_attendances and assessments.
// Kept here so all parent pulses live in one file.
// ============================================================

export interface ParentKidsPulse {
  insightsReadyCount: number;
  sessionsThisWeekCount: number;
  assessmentsToAcknowledgeCount: number;
}

export async function getParentKidsPulse(): Promise<ParentKidsPulse> {
  try {
    const ctx = await resolveParentContext();
    if (!ctx || ctx.childIds.length === 0) {
      return {
        insightsReadyCount: 0,
        sessionsThisWeekCount: 0,
        assessmentsToAcknowledgeCount: 0,
      };
    }

    const { supabase, childIds } = ctx;
    const today = todayIsoDate();
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const [insightsRes, attendanceRes, ratingsRes] = await Promise.all([
      supabase
        .from("child_insights")
        .select("id", { count: "exact", head: true })
        .in("child_id", childIds)
        .gte("created_at", fourteenDaysAgoIso()),
      supabase
        .from("session_attendances")
        .select("id, sessions(date)")
        .in("child_id", childIds)
        .eq("status", "present")
        .gte("sessions.date", today)
        .lte("sessions.date", inSevenDays),
      supabase
        .from("skill_ratings")
        .select("id", { count: "exact", head: true })
        .in("child_id", childIds)
        .gte("created_at", fourteenDaysAgoIso()),
    ]);

    const attendanceRows =
      (attendanceRes.data as Array<{
        sessions: { date: string } | null;
      }> | null) ?? [];
    const sessionsThisWeekCount = attendanceRows.filter((a) => {
      const d = a.sessions?.date;
      if (!d) return false;
      return d >= today && d <= inSevenDays;
    }).length;

    return {
      insightsReadyCount: insightsRes.count ?? 0,
      sessionsThisWeekCount,
      assessmentsToAcknowledgeCount: ratingsRes.count ?? 0,
    };
  } catch (err) {
    console.error("getParentKidsPulse error:", err);
    return {
      insightsReadyCount: 0,
      sessionsThisWeekCount: 0,
      assessmentsToAcknowledgeCount: 0,
    };
  }
}

export async function getParentBookingPulse(): Promise<ParentBookingPulse> {
  try {
    const ctx = await resolveParentContext();
    if (!ctx) {
      return {
        sessionsAvailableTodayCount: 0,
        nextAvailableDays: null,
        onWaitlistCount: 0,
        packagesEndingSoonCount: 0,
      };
    }

    const { supabase, parentId } = ctx;
    const today = todayIsoDate();
    const now = nowIso();
    const sevenDaysIso = sevenDaysFromNowIso();

    const [
      sessionsTodayRes,
      nextAvailableRes,
      onWaitlistRes,
      expiringPackagesRes,
    ] = await Promise.all([
      supabase
        .from("bookable_sessions")
        .select("id, max_capacity, current_bookings")
        .eq("status", "open")
        .eq("date", today),
      supabase
        .from("bookable_sessions")
        .select("date, max_capacity, current_bookings")
        .eq("status", "open")
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(20),
      supabase
        .from("waitlist")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", parentId)
        .in("status", ["waiting", "offered"]),
      supabase
        .from("package_balances")
        .select("expires_at, remaining_sessions")
        .eq("parent_id", parentId)
        .eq("status", "active"),
    ]);

    const todayRows =
      (sessionsTodayRes.data as Array<{
        max_capacity: number;
        current_bookings: number;
      }> | null) ?? [];
    const sessionsAvailableTodayCount = todayRows.filter(
      (s) => (s.current_bookings ?? 0) < (s.max_capacity ?? 0),
    ).length;

    const nextRows =
      (nextAvailableRes.data as Array<{
        date: string;
        max_capacity: number;
        current_bookings: number;
      }> | null) ?? [];
    const nextDate = nextRows.find(
      (s) => (s.current_bookings ?? 0) < (s.max_capacity ?? 0),
    )?.date;
    const nextAvailableDays = nextDate ? daysBetween(today, nextDate) : null;

    const packageRows =
      (expiringPackagesRes.data as Array<{
        expires_at: string;
        remaining_sessions: number;
      }> | null) ?? [];
    const packagesEndingSoonCount = packageRows.filter((p) => {
      const expiringSoon =
        p.expires_at && p.expires_at <= sevenDaysIso && p.expires_at >= now;
      const almostUsedUp = p.remaining_sessions <= 1;
      return expiringSoon || almostUsedUp;
    }).length;

    return {
      sessionsAvailableTodayCount,
      nextAvailableDays,
      onWaitlistCount: onWaitlistRes.count ?? 0,
      packagesEndingSoonCount,
    };
  } catch (err) {
    console.error("getParentBookingPulse error:", err);
    return {
      sessionsAvailableTodayCount: 0,
      nextAvailableDays: null,
      onWaitlistCount: 0,
      packagesEndingSoonCount: 0,
    };
  }
}

// ============================================================
// Parent pulse — compare variant
// ============================================================
//
// For the parent home, "sessions my kids attended this week vs
// last week" is the natural growth signal. We resolve the parent's
// children via `parent_children`, then count `session_attendances`
// rows in each window. Anything missing falls back to current-only.

import { resolvePeriod, type PeriodKey } from "@/lib/comparison/period";

export async function getParentStatusPulseWithCompare(opts?: {
  compareTo?: PeriodKey;
}): Promise<{
  current: ParentStatusPulse;
  previous?: { sessionsCount: number };
  thisPeriodSessions?: number;
  compareLabel?: string;
}> {
  const current = await getParentStatusPulse();
  if (!opts?.compareTo) return { current };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { current };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!parentProfile) return { current };

    const { data: kidLinks } = await supabase
      .from("parent_children")
      .select("child_id")
      .eq("parent_id", parentProfile.id);
    const childIds = (kidLinks ?? []).map(
      (r) => (r as { child_id: string }).child_id
    );
    if (childIds.length === 0) return { current };

    const priorPeriod = await resolvePeriod(opts.compareTo);
    const thisWeek = await resolvePeriod("this_week");

    const [priorRes, currentRes] = await Promise.all([
      supabase
        .from("session_attendances")
        .select("id", { count: "exact", head: true })
        .in("child_id", childIds)
        .gte("created_at", `${priorPeriod.start}T00:00:00.000Z`)
        .lte("created_at", `${priorPeriod.end}T23:59:59.999Z`),
      supabase
        .from("session_attendances")
        .select("id", { count: "exact", head: true })
        .in("child_id", childIds)
        .gte("created_at", `${thisWeek.start}T00:00:00.000Z`)
        .lte("created_at", `${thisWeek.end}T23:59:59.999Z`),
    ]);

    return {
      current,
      previous: { sessionsCount: priorRes.count ?? 0 },
      thisPeriodSessions: currentRes.count ?? 0,
      compareLabel: priorPeriod.label,
    };
  } catch (err) {
    console.error("getParentStatusPulseWithCompare error:", err);
    return { current };
  }
}
