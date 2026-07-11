"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================
// Types
// ============================================================

export interface CohortRow {
  cohortMonth: string; // e.g. "2025-01"
  totalCentres: number;
  retentionByMonth: Record<number, { count: number; percentage: number }>; // month offset -> retention
}

export interface DemandSportRow {
  sport: string;
  bookingCount: number;
}

export interface DemandSuburbRow {
  suburb: string;
  sessionCount: number;
  bookingCount: number;
}

export interface DemandTimeSlot {
  hour: number;
  bookingCount: number;
}

export interface DemandDayOfWeek {
  day: string;
  dayIndex: number;
  bookingCount: number;
}

export interface FinancialCentreRow {
  centreId: string;
  centreName: string;
  revenue: number;
  coachCosts: number;
  profit: number;
  margin: number;
  sessionCount: number;
  revenuePerSession: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  growth: number | null;
}

export interface CoachUtilRow {
  coachId: string;
  coachName: string;
  sessionCount: number;
  revenueGenerated: number;
  utilisationRate: number;
}

export interface GrowthPoint {
  month: string;
  count: number;
}

// ============================================================
// Cohort Analysis
// ============================================================

export async function getCohortAnalysis(): Promise<{
  data: CohortRow[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get all centres with their creation dates and current status
    const { data: centres, error: centresErr } = await supabase
      .from("centres")
      .select("id, created_at, contract_status")
      .order("created_at", { ascending: true });

    if (centresErr) throw centresErr;
    if (!centres || centres.length === 0) return { data: [], error: null };

    // Group centres by join month (cohort)
    const cohortMap = new Map<
      string,
      { id: string; createdAt: Date; status: string }[]
    >();

    for (const c of centres) {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!cohortMap.has(key)) cohortMap.set(key, []);
      cohortMap.get(key)!.push({
        id: c.id,
        createdAt: d,
        status: c.contract_status ?? "active",
      });
    }

    // Get session activity per centre per month to determine "active"
    const { data: sessions } = await supabase
      .from("sessions")
      .select("centre_id, date")
      .order("date", { ascending: true });

    // Build a set of centre-months that had activity
    const activeMonths = new Map<string, Set<string>>(); // centreId -> set of "YYYY-MM"
    for (const s of sessions ?? []) {
      const d = new Date(s.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!activeMonths.has(s.centre_id)) activeMonths.set(s.centre_id, new Set());
      activeMonths.get(s.centre_id)!.add(monthKey);
    }

    const now = new Date();
    const nowMonth = now.getFullYear() * 12 + now.getMonth();

    const rows: CohortRow[] = [];

    for (const [cohortMonth, members] of cohortMap.entries()) {
      const [y, m] = cohortMonth.split("-").map(Number);
      const cohortMonthNum = y * 12 + (m - 1);
      const maxOffset = Math.min(nowMonth - cohortMonthNum, 12);

      const retentionByMonth: Record<number, { count: number; percentage: number }> = {};

      for (let offset = 0; offset <= maxOffset; offset++) {
        const targetMonthNum = cohortMonthNum + offset;
        const tY = Math.floor(targetMonthNum / 12);
        const tM = (targetMonthNum % 12) + 1;
        const targetKey = `${tY}-${String(tM).padStart(2, "0")}`;

        let activeCount = 0;
        for (const member of members) {
          // A centre is considered active if it had sessions that month
          // or if it's the cohort month itself (month 0 = they joined)
          if (offset === 0) {
            activeCount++;
          } else {
            const centreActive = activeMonths.get(member.id);
            if (centreActive?.has(targetKey)) {
              activeCount++;
            }
          }
        }

        retentionByMonth[offset] = {
          count: activeCount,
          percentage: members.length > 0 ? Math.round((activeCount / members.length) * 100) : 0,
        };
      }

      rows.push({
        cohortMonth,
        totalCentres: members.length,
        retentionByMonth,
      });
    }

    return { data: rows, error: null };
  } catch (err) {
    console.error("getCohortAnalysis error:", err);
    return { data: [], error: "Failed to load cohort analysis." };
  }
}

// ============================================================
// Demand Analysis
// ============================================================

export async function getDemandAnalysis(): Promise<{
  data: {
    bySport: DemandSportRow[];
    bySuburb: DemandSuburbRow[];
    byHour: DemandTimeSlot[];
    byDayOfWeek: DemandDayOfWeek[];
  };
  error: string | null;
}> {
  const empty = { bySport: [], bySuburb: [], byHour: [], byDayOfWeek: [] };
  try {
    const supabase = await createSupabaseServerClient();

    // Sessions with centre suburb info
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select("id, sport, date, centre_id, start_time");

    if (sessErr) throw sessErr;

    // Bookings
    const { data: bookings, error: bookErr } = await supabase
      .from("bookings")
      .select("id, session_id, status")
      .in("status", ["confirmed", "completed"]);

    if (bookErr) throw bookErr;

    // Centres for suburb lookup
    const { data: centres } = await supabase
      .from("centres")
      .select("id, address");

    const centreSuburb = new Map<string, string>();
    for (const c of centres ?? []) {
      centreSuburb.set(c.id, c.address ?? "Unknown");
    }

    // Build booking count per session
    const bookingsBySession = new Map<string, number>();
    for (const b of bookings ?? []) {
      bookingsBySession.set(b.session_id, (bookingsBySession.get(b.session_id) ?? 0) + 1);
    }

    // Sport popularity
    const sportCounts = new Map<string, number>();
    // Suburb demand
    const suburbSessionCounts = new Map<string, number>();
    const suburbBookingCounts = new Map<string, number>();
    // Time of day
    const hourCounts = new Map<number, number>();
    // Day of week
    const dayCounts = new Map<number, number>();

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    for (const s of sessions ?? []) {
      const sessionBookings = bookingsBySession.get(s.id) ?? 0;

      // Sport
      if (s.sport) {
        sportCounts.set(s.sport, (sportCounts.get(s.sport) ?? 0) + sessionBookings);
      }

      // Suburb
      const suburb = centreSuburb.get(s.centre_id) ?? "Unknown";
      suburbSessionCounts.set(suburb, (suburbSessionCounts.get(suburb) ?? 0) + 1);
      suburbBookingCounts.set(suburb, (suburbBookingCounts.get(suburb) ?? 0) + sessionBookings);

      // Hour
      if (s.start_time) {
        const hour = parseInt(s.start_time.split(":")[0], 10);
        if (!isNaN(hour)) {
          hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + sessionBookings);
        }
      }

      // Day of week
      if (s.date) {
        const d = new Date(s.date);
        const dayIdx = d.getDay();
        dayCounts.set(dayIdx, (dayCounts.get(dayIdx) ?? 0) + sessionBookings);
      }
    }

    const bySport: DemandSportRow[] = Array.from(sportCounts.entries())
      .map(([sport, bookingCount]) => ({ sport, bookingCount }))
      .sort((a, b) => b.bookingCount - a.bookingCount);

    const bySuburb: DemandSuburbRow[] = Array.from(suburbSessionCounts.entries())
      .map(([suburb, sessionCount]) => ({
        suburb,
        sessionCount,
        bookingCount: suburbBookingCounts.get(suburb) ?? 0,
      }))
      .sort((a, b) => b.bookingCount - a.bookingCount);

    const byHour: DemandTimeSlot[] = Array.from(hourCounts.entries())
      .map(([hour, bookingCount]) => ({ hour, bookingCount }))
      .sort((a, b) => a.hour - b.hour);

    const byDayOfWeek: DemandDayOfWeek[] = Array.from(dayCounts.entries())
      .map(([dayIndex, bookingCount]) => ({
        day: dayNames[dayIndex],
        dayIndex,
        bookingCount,
      }))
      .sort((a, b) => a.dayIndex - b.dayIndex);

    return { data: { bySport, bySuburb, byHour, byDayOfWeek }, error: null };
  } catch (err) {
    console.error("getDemandAnalysis error:", err);
    return { data: empty, error: "Failed to load demand analysis." };
  }
}

// ============================================================
// Financial Intelligence
// ============================================================

export async function getFinancialIntelligence(): Promise<{
  data: {
    byCentre: FinancialCentreRow[];
    monthlyRevenue: MonthlyRevenue[];
  };
  error: string | null;
}> {
  const empty = { byCentre: [], monthlyRevenue: [] };
  try {
    const supabase = await createSupabaseServerClient();

    // Payments
    const { data: payments, error: payErr } = await supabase
      .from("payments")
      .select("id, booking_id, amount_cents, status, created_at")
      .eq("status", "completed");

    if (payErr) throw payErr;

    // Bookings (to link payments to sessions)
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, session_id");

    // Sessions (to link to centres)
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, centre_id, coach_id, date");

    // Centres
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name");

    // Coach invoices for cost calculation
    const { data: invoices } = await supabase
      .from("coach_invoices")
      .select("id, coach_id, total_amount, status, period_start, period_end")
      .in("status", ["approved", "paid"]);

    const centreNames = new Map<string, string>();
    for (const c of centres ?? []) {
      centreNames.set(c.id, c.name);
    }

    // Map booking -> session
    const bookingToSession = new Map<string, string>();
    for (const b of bookings ?? []) {
      bookingToSession.set(b.id, b.session_id);
    }

    // Map session -> centre, coach
    const sessionToCentre = new Map<string, string>();
    const sessionToCoach = new Map<string, string>();
    for (const s of sessions ?? []) {
      sessionToCentre.set(s.id, s.centre_id);
      if (s.coach_id) sessionToCoach.set(s.id, s.coach_id);
    }

    // Revenue per centre
    const centreRevenue = new Map<string, number>();
    const centreSessionIds = new Map<string, Set<string>>();
    // Monthly revenue
    const monthlyMap = new Map<string, number>();

    for (const p of payments ?? []) {
      const sessionId = bookingToSession.get(p.booking_id);
      if (!sessionId) continue;
      const centreId = sessionToCentre.get(sessionId);
      if (centreId) {
        centreRevenue.set(centreId, (centreRevenue.get(centreId) ?? 0) + (p.amount_cents ?? 0));
        if (!centreSessionIds.has(centreId)) centreSessionIds.set(centreId, new Set());
        centreSessionIds.get(centreId)!.add(sessionId);
      }

      // Monthly
      const d = new Date(p.created_at);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + (p.amount_cents ?? 0));
    }

    // Coach costs per centre (approximate: distribute invoice across sessions in that period)
    const centreCosts = new Map<string, number>();
    for (const inv of invoices ?? []) {
      // Find sessions this coach ran during the invoice period
      const coachSessions = (sessions ?? []).filter(
        (s) =>
          s.coach_id === inv.coach_id &&
          s.date >= inv.period_start &&
          s.date <= inv.period_end
      );
      if (coachSessions.length === 0) continue;
      const costPerSession = (inv.total_amount ?? 0) / coachSessions.length;
      for (const cs of coachSessions) {
        centreCosts.set(
          cs.centre_id,
          (centreCosts.get(cs.centre_id) ?? 0) + costPerSession
        );
      }
    }

    // Build centre rows
    const byCentre: FinancialCentreRow[] = [];
    for (const [centreId, revenue] of centreRevenue.entries()) {
      const costs = centreCosts.get(centreId) ?? 0;
      const profit = revenue - costs * 100; // costs are in dollars, revenue in cents
      const sessionCount = centreSessionIds.get(centreId)?.size ?? 0;
      byCentre.push({
        centreId,
        centreName: centreNames.get(centreId) ?? "Unknown",
        revenue: revenue / 100, // convert to dollars
        coachCosts: costs,
        profit: revenue / 100 - costs,
        margin: revenue > 0 ? Math.round(((revenue / 100 - costs) / (revenue / 100)) * 100) : 0,
        sessionCount,
        revenuePerSession: sessionCount > 0 ? Math.round((revenue / 100 / sessionCount) * 100) / 100 : 0,
      });
    }
    byCentre.sort((a, b) => b.revenue - a.revenue);

    // Monthly revenue sorted
    const sortedMonths = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    const monthlyRevenue: MonthlyRevenue[] = sortedMonths.map(([month, revCents], idx) => {
      const rev = revCents / 100;
      let growth: number | null = null;
      if (idx > 0) {
        const prevRev = sortedMonths[idx - 1][1] / 100;
        growth = prevRev > 0 ? Math.round(((rev - prevRev) / prevRev) * 100) : null;
      }
      return { month, revenue: rev, growth };
    });

    return { data: { byCentre, monthlyRevenue }, error: null };
  } catch (err) {
    console.error("getFinancialIntelligence error:", err);
    return { data: empty, error: "Failed to load financial intelligence." };
  }
}

// ============================================================
// Coach Utilisation
// ============================================================

export async function getCoachUtilisation(): Promise<{
  data: CoachUtilRow[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Coaches
    const { data: coaches, error: coachErr } = await supabase
      .from("profiles")
      .select("id, name, status")
      .eq("role", "coach");

    if (coachErr) throw coachErr;

    // Sessions (last 90 days for utilisation)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoff = ninetyDaysAgo.toISOString().split("T")[0];

    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, coach_id, date, centre_id")
      .gte("date", cutoff);

    // Availability slots for utilisation rate
    const { data: availability } = await supabase
      .from("availability_slots")
      .select("coach_id, day_of_week");

    // Payments + bookings for revenue
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, session_id, status")
      .in("status", ["confirmed", "completed"]);

    const { data: payments } = await supabase
      .from("payments")
      .select("booking_id, amount_cents, status")
      .eq("status", "completed");

    // Map session -> bookings -> payments
    const sessionBookings = new Map<string, string[]>();
    for (const b of bookings ?? []) {
      if (!sessionBookings.has(b.session_id)) sessionBookings.set(b.session_id, []);
      sessionBookings.get(b.session_id)!.push(b.id);
    }

    const bookingPayment = new Map<string, number>();
    for (const p of payments ?? []) {
      bookingPayment.set(p.booking_id, (bookingPayment.get(p.booking_id) ?? 0) + (p.amount_cents ?? 0));
    }

    // Availability slots per coach (weekly slots count)
    const coachSlots = new Map<string, number>();
    for (const a of availability ?? []) {
      coachSlots.set(a.coach_id, (coachSlots.get(a.coach_id) ?? 0) + 1);
    }

    const rows: CoachUtilRow[] = [];

    for (const coach of coaches ?? []) {
      const coachSessions = (sessions ?? []).filter((s) => s.coach_id === coach.id);
      const sessionCount = coachSessions.length;

      // Revenue generated
      let revenueGenerated = 0;
      for (const s of coachSessions) {
        const bIds = sessionBookings.get(s.id) ?? [];
        for (const bId of bIds) {
          revenueGenerated += bookingPayment.get(bId) ?? 0;
        }
      }

      // Utilisation: sessions run / available slots over 90 days
      // Available slots per week * ~13 weeks
      const weeklySlots = coachSlots.get(coach.id) ?? 5; // default 5 if no availability set
      const totalAvailableSlots = weeklySlots * 13;
      const utilisationRate =
        totalAvailableSlots > 0
          ? Math.round((sessionCount / totalAvailableSlots) * 100)
          : 0;

      rows.push({
        coachId: coach.id,
        coachName: coach.name ?? "Unknown",
        sessionCount,
        revenueGenerated: revenueGenerated / 100,
        utilisationRate: Math.min(utilisationRate, 100),
      });
    }

    rows.sort((a, b) => b.sessionCount - a.sessionCount);

    return { data: rows, error: null };
  } catch (err) {
    console.error("getCoachUtilisation error:", err);
    return { data: [], error: "Failed to load coach utilisation." };
  }
}

// ============================================================
// Growth Metrics
// ============================================================

export async function getGrowthMetrics(): Promise<{
  data: {
    newCentres: GrowthPoint[];
    newParents: GrowthPoint[];
    bookingVolume: GrowthPoint[];
    churnRate: GrowthPoint[];
  };
  error: string | null;
}> {
  const empty = { newCentres: [], newParents: [], bookingVolume: [], churnRate: [] };
  try {
    const supabase = await createSupabaseServerClient();

    // Centres
    const { data: centres } = await supabase
      .from("centres")
      .select("id, created_at, contract_status")
      .order("created_at", { ascending: true });

    // Parents
    const { data: parents } = await supabase
      .from("parent_profiles")
      .select("id, created_at")
      .order("created_at", { ascending: true });

    // Bookings
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, created_at, contract_status")
      .order("created_at", { ascending: true });

    // Churn events
    const { data: churnEvents } = await supabase
      .from("churn_events")
      .select("id, created_at")
      .order("created_at", { ascending: true });

    function groupByMonth<T extends { created_at: string }>(
      items: T[]
    ): GrowthPoint[] {
      const map = new Map<string, number>();
      for (const item of items) {
        const d = new Date(item.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count }));
    }

    const newCentres = groupByMonth(centres ?? []);
    const newParents = groupByMonth(parents ?? []);
    const bookingVolume = groupByMonth(bookings ?? []);

    // Churn rate: churn events / active centres per month
    const churnByMonth = new Map<string, number>();
    for (const ce of churnEvents ?? []) {
      const d = new Date(ce.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      churnByMonth.set(key, (churnByMonth.get(key) ?? 0) + 1);
    }

    // Active centres cumulative by month
    const centresByMonth = new Map<string, number>();
    let cumulative = 0;
    for (const gp of newCentres) {
      cumulative += gp.count;
      centresByMonth.set(gp.month, cumulative);
    }

    const churnRate: GrowthPoint[] = [];
    // Get all months from churn or centres
    const allMonths = new Set([...churnByMonth.keys(), ...centresByMonth.keys()]);
    const sortedAllMonths = Array.from(allMonths).sort();
    let lastCumulative = 0;
    for (const month of sortedAllMonths) {
      if (centresByMonth.has(month)) lastCumulative = centresByMonth.get(month)!;
      const churned = churnByMonth.get(month) ?? 0;
      const rate = lastCumulative > 0 ? Math.round((churned / lastCumulative) * 100) : 0;
      churnRate.push({ month, count: rate });
    }

    return {
      data: { newCentres, newParents, bookingVolume, churnRate },
      error: null,
    };
  } catch (err) {
    console.error("getGrowthMetrics error:", err);
    return { data: empty, error: "Failed to load growth metrics." };
  }
}

// ============================================================
// Overview KPIs
// ============================================================

export interface OverviewKPIs {
  totalRevenue: number;
  activeCentres: number;
  activeParents: number;
  avgSessionsPerWeek: number;
  avgRating: number;
  conversionRate: number;
  prevTotalRevenue: number;
  prevActiveCentres: number;
  prevActiveParents: number;
  prevAvgSessionsPerWeek: number;
  prevAvgRating: number;
  prevConversionRate: number;
}

export async function getOverviewKPIs(): Promise<{
  data: OverviewKPIs | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toISOString()
      .split("T")[0];
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      .toISOString()
      .split("T")[0];

    // Revenue this month
    const { data: thisMonthPayments } = await supabase
      .from("payments")
      .select("amount_cents")
      .eq("status", "completed")
      .gte("created_at", thisMonthStart);

    const { data: lastMonthPayments } = await supabase
      .from("payments")
      .select("amount_cents")
      .eq("status", "completed")
      .gte("created_at", lastMonthStart)
      .lte("created_at", lastMonthEnd);

    const totalRevenue = (thisMonthPayments ?? []).reduce(
      (sum, p) => sum + (p.amount_cents ?? 0),
      0
    ) / 100;
    const prevTotalRevenue = (lastMonthPayments ?? []).reduce(
      (sum, p) => sum + (p.amount_cents ?? 0),
      0
    ) / 100;

    // Active centres
    const { count: activeCentres } = await supabase
      .from("centres")
      .select("id", { count: "exact", head: true })
      .eq("contract_status", "active");

    // Previous month: approximate by centres created before last month end
    const { count: prevActiveCentres } = await supabase
      .from("centres")
      .select("id", { count: "exact", head: true })
      .eq("contract_status", "active")
      .lte("created_at", lastMonthEnd);

    // Active parents (those with bookings this month)
    const { data: thisMonthBookings } = await supabase
      .from("bookings")
      .select("parent_id")
      .gte("created_at", thisMonthStart);

    const { data: lastMonthBookings } = await supabase
      .from("bookings")
      .select("parent_id")
      .gte("created_at", lastMonthStart)
      .lte("created_at", lastMonthEnd);

    const activeParents = new Set((thisMonthBookings ?? []).map((b) => b.parent_id)).size;
    const prevActiveParents = new Set((lastMonthBookings ?? []).map((b) => b.parent_id)).size;

    // Avg sessions per week (last 4 weeks vs previous 4 weeks)
    const fourWeeksAgo = new Date(now);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const eightWeeksAgo = new Date(now);
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const { count: recentSessions } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .gte("date", fourWeeksAgo.toISOString().split("T")[0]);

    const { count: prevSessions } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .gte("date", eightWeeksAgo.toISOString().split("T")[0])
      .lt("date", fourWeeksAgo.toISOString().split("T")[0]);

    const avgSessionsPerWeek = Math.round(((recentSessions ?? 0) / 4) * 10) / 10;
    const prevAvgSessionsPerWeek = Math.round(((prevSessions ?? 0) / 4) * 10) / 10;

    // Average rating
    const { data: thisMonthRatings } = await supabase
      .from("feedback_ratings")
      .select("rating")
      .gte("created_at", thisMonthStart);

    const { data: lastMonthRatings } = await supabase
      .from("feedback_ratings")
      .select("rating")
      .gte("created_at", lastMonthStart)
      .lte("created_at", lastMonthEnd);

    const avgRating =
      (thisMonthRatings ?? []).length > 0
        ? Math.round(
            ((thisMonthRatings ?? []).reduce((s, r) => s + r.rating, 0) /
              (thisMonthRatings ?? []).length) *
              10
          ) / 10
        : 0;

    const prevAvgRating =
      (lastMonthRatings ?? []).length > 0
        ? Math.round(
            ((lastMonthRatings ?? []).reduce((s, r) => s + r.rating, 0) /
              (lastMonthRatings ?? []).length) *
              10
          ) / 10
        : 0;

    // Conversion rate (leads won / total leads)
    const { count: totalLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thisMonthStart);

    const { count: wonLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("stage", "won")
      .gte("created_at", thisMonthStart);

    const { count: prevTotalLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", lastMonthStart)
      .lte("created_at", lastMonthEnd);

    const { count: prevWonLeads } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("stage", "won")
      .gte("created_at", lastMonthStart)
      .lte("created_at", lastMonthEnd);

    const conversionRate =
      (totalLeads ?? 0) > 0
        ? Math.round(((wonLeads ?? 0) / (totalLeads ?? 1)) * 100)
        : 0;
    const prevConversionRate =
      (prevTotalLeads ?? 0) > 0
        ? Math.round(((prevWonLeads ?? 0) / (prevTotalLeads ?? 1)) * 100)
        : 0;

    return {
      data: {
        totalRevenue,
        activeCentres: activeCentres ?? 0,
        activeParents,
        avgSessionsPerWeek,
        avgRating,
        conversionRate,
        prevTotalRevenue,
        prevActiveCentres: prevActiveCentres ?? 0,
        prevActiveParents,
        prevAvgSessionsPerWeek,
        prevAvgRating,
        prevConversionRate,
      },
      error: null,
    };
  } catch (err) {
    console.error("getOverviewKPIs error:", err);
    return { data: null, error: "Failed to load overview KPIs." };
  }
}
