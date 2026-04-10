"use server";

// ============================================================
// Launch Dashboard — server actions for admin landing page
// ============================================================

import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ========================
// Constants (Year 1 growth targets)
// ========================

export const YEAR_1_CENTRE_TARGET = 40;
export const YEAR_1_SCHOOL_TARGET = 10;
export const YEAR_1_REVENUE_TARGET = 400_000;

const DEFAULT_SESSION_RATE = 165;
const SCHOOL_RATE_PER_CHILD = 5;

// ========================
// Types
// ========================

export interface DashboardMetrics {
  centres: {
    active: number;
    total: number;
    target: number;
    newThisMonth: number;
    sessionsThisWeek: number;
    avgSessionRate: number;
  };
  schools: {
    active: number;
    total: number;
    target: number;
    totalEnrolledStudents: number;
  };
  revenue: {
    thisMonth: number;
    thisTerm: number;
    thisYear: number;
    yearTarget: number;
    childcareRevenue: number;
    schoolRevenue: number;
    isEstimate: boolean;
    monthlyBreakdown: Array<{
      month: string;
      childcare: number;
      school: number;
    }>;
  };
  growth: {
    monthlyBreakdown: Array<{
      month: string;
      centres: number;
      schools: number;
    }>;
  };
  topEntities: Array<{
    id: string;
    name: string;
    type: "centre" | "school";
    revenue: number;
  }>;
  coaches: {
    active: number;
    total: number;
    avgSessionsPerWeek: number;
    compliance: {
      allClear: number;
      expiringSoon: number;
      expired: number;
    };
    list: Array<{
      id: string;
      name: string;
      sessionsThisWeek: number;
      complianceStatus: "clear" | "warning" | "alert";
    }>;
  };
}

export interface ActivityItem {
  type:
    | "new_centre"
    | "new_booking"
    | "session_completed"
    | "invoice_paid"
    | "new_coach";
  description: string;
  timestamp: string;
  entityId?: string;
}

// ========================
// Date helpers
// ========================

function getWeekRange(): { start: string; end: string } {
  const d = new Date();
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

function getMonthStart(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function getTermRange(): { start: string; end: string } {
  // Australian school terms (approximate):
  // Term 1: late Jan – early Apr
  // Term 2: late Apr – late Jun/early Jul
  // Term 3: mid Jul – late Sep
  // Term 4: mid Oct – mid Dec
  const d = new Date();
  const month = d.getMonth(); // 0-indexed
  const year = d.getFullYear();

  let start: Date;
  let end: Date;

  if (month <= 3) {
    // Term 1
    start = new Date(year, 0, 28);
    end = new Date(year, 3, 10);
  } else if (month <= 6) {
    // Term 2
    start = new Date(year, 3, 28);
    end = new Date(year, 6, 5);
  } else if (month <= 9) {
    // Term 3
    start = new Date(year, 6, 15);
    end = new Date(year, 8, 28);
  } else {
    // Term 4
    start = new Date(year, 9, 12);
    end = new Date(year, 11, 18);
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function getFinancialYearStart(): string {
  // Australian FY: July 1 – June 30
  const d = new Date();
  const year = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-07-01`;
}

function monthKey(date: Date): string {
  return date.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

// ========================
// 1. getDashboardMetrics
// ========================

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const admin = createSupabaseAdmin();

  const weekRange = getWeekRange();
  const monthStart = getMonthStart();
  const termRange = getTermRange();
  const fyStart = getFinancialYearStart();

  // ========================
  // CENTRES
  // ========================

  const { count: totalCentres } = await admin
    .from("centres")
    .select("id", { count: "exact", head: true })
    .neq("type", "school");

  const { count: newCentresThisMonth } = await admin
    .from("centres")
    .select("id", { count: "exact", head: true })
    .neq("type", "school")
    .gte("created_at", monthStart);

  // Active centres = centres with at least one session this week
  const { data: weekCentreSessions } = await admin
    .from("sessions")
    .select("centre_id")
    .gte("date", weekRange.start)
    .lte("date", weekRange.end)
    .neq("status", "cancelled")
    .not("centre_id", "is", null);

  const activeCentreIds = new Set(
    (weekCentreSessions ?? []).map((s: { centre_id: string }) => s.centre_id)
  );

  const sessionsThisWeek = weekCentreSessions?.length ?? 0;

  // Avg session rate (from centres with a rate)
  const { data: centresWithRates } = await admin
    .from("centres")
    .select("agreed_rate")
    .neq("type", "school")
    .not("agreed_rate", "is", null);

  const avgSessionRate =
    centresWithRates && centresWithRates.length > 0
      ? centresWithRates.reduce(
          (sum: number, c: { agreed_rate: number }) =>
            sum + (Number(c.agreed_rate) || DEFAULT_SESSION_RATE),
          0
        ) / centresWithRates.length
      : DEFAULT_SESSION_RATE;

  // ========================
  // SCHOOLS (stored as centres with type='school')
  // ========================

  const { count: totalSchools } = await admin
    .from("centres")
    .select("id", { count: "exact", head: true })
    .eq("type", "school");

  // Active schools = schools with sessions this term (joined via centre_id)
  const { data: termSchoolSessions } = await admin
    .from("sessions")
    .select("centre_id")
    .gte("date", termRange.start)
    .lte("date", termRange.end)
    .neq("status", "cancelled");

  // Intersect with schools
  const { data: schoolIdsRes } = await admin
    .from("centres")
    .select("id")
    .eq("type", "school");

  const schoolIdSet = new Set((schoolIdsRes ?? []).map((s: { id: string }) => s.id));
  const activeSchoolIds = new Set<string>();

  for (const s of termSchoolSessions ?? []) {
    if (schoolIdSet.has(s.centre_id)) {
      activeSchoolIds.add(s.centre_id);
    }
  }

  // Total enrolled students — sum of group_size for schools
  const { data: schoolGroups } = await admin
    .from("centres")
    .select("group_size")
    .eq("type", "school");

  const totalEnrolledStudents = (schoolGroups ?? []).reduce(
    (sum: number, s: { group_size: number | null }) => sum + (s.group_size || 0),
    0
  );

  // ========================
  // REVENUE
  // ========================

  // Fetch all invoices for aggregation
  const { data: allInvoices } = await admin
    .from("invoices")
    .select("centre_id, school_id, total, status, issue_date, payment_date")
    .in("status", ["sent", "paid"]);

  const hasInvoices = allInvoices && allInvoices.length > 0;

  let revenueThisMonth = 0;
  let revenueThisTerm = 0;
  let revenueThisYear = 0;
  let childcareRevenue = 0;
  let schoolRevenue = 0;

  type InvoiceRow = {
    centre_id: string | null;
    school_id: string | null;
    total: number;
    status: string;
    issue_date: string;
    payment_date: string | null;
  };

  // Monthly breakdown for the last 6 months
  const monthlyRevenueMap = new Map<
    string,
    { childcare: number; school: number; order: number }
  >();

  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    monthlyRevenueMap.set(monthKey(d), {
      childcare: 0,
      school: 0,
      order: 5 - i,
    });
  }

  for (const inv of (allInvoices ?? []) as InvoiceRow[]) {
    const amt = Number(inv.total) || 0;
    const isSchool = !!inv.school_id;

    if (inv.issue_date >= monthStart) revenueThisMonth += amt;
    if (inv.issue_date >= termRange.start && inv.issue_date <= termRange.end)
      revenueThisTerm += amt;
    if (inv.issue_date >= fyStart) revenueThisYear += amt;

    if (isSchool) schoolRevenue += amt;
    else childcareRevenue += amt;

    // Monthly breakdown
    const d = new Date(inv.issue_date + "T00:00:00");
    const key = monthKey(d);
    if (monthlyRevenueMap.has(key)) {
      const entry = monthlyRevenueMap.get(key)!;
      if (isSchool) entry.school += amt;
      else entry.childcare += amt;
    }
  }

  // If no invoices yet, estimate from sessions + attendance
  if (!hasInvoices) {
    // Centre estimate: completed centre sessions × avg rate
    const { count: completedCentreSessions } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("date", fyStart)
      .not("centre_id", "is", null);

    childcareRevenue = (completedCentreSessions ?? 0) * avgSessionRate;

    // School estimate: attendance count × $5 for school sessions
    const { data: schoolSessions } = await admin
      .from("sessions")
      .select("id, centre_id")
      .eq("status", "completed")
      .gte("date", fyStart);

    const schoolSessionIds: string[] = [];
    for (const s of schoolSessions ?? []) {
      if (schoolIdSet.has(s.centre_id)) schoolSessionIds.push(s.id);
    }

    if (schoolSessionIds.length > 0) {
      const { data: schoolAttendance } = await admin
        .from("attendance")
        .select("session_id")
        .in("session_id", schoolSessionIds)
        .in("status", ["present", "walk_in"]);

      schoolRevenue = (schoolAttendance?.length ?? 0) * SCHOOL_RATE_PER_CHILD;
    }

    revenueThisYear = childcareRevenue + schoolRevenue;
  }

  const monthlyBreakdown = Array.from(monthlyRevenueMap.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([month, data]) => ({
      month,
      childcare: Math.round(data.childcare),
      school: Math.round(data.school),
    }));

  // ========================
  // TOP ENTITIES BY REVENUE
  // ========================

  const revenueByEntity = new Map<
    string,
    { name: string; type: "centre" | "school"; revenue: number }
  >();

  for (const inv of (allInvoices ?? []) as InvoiceRow[]) {
    const amt = Number(inv.total) || 0;
    if (inv.issue_date >= termRange.start && inv.issue_date <= termRange.end) {
      const id = (inv.centre_id || inv.school_id) as string | null;
      if (!id) continue;
      const entry = revenueByEntity.get(id);
      if (entry) {
        entry.revenue += amt;
      } else {
        revenueByEntity.set(id, {
          name: "",
          type: inv.school_id ? "school" : "centre",
          revenue: amt,
        });
      }
    }
  }

  // Fetch names for top entities
  const topIds = Array.from(revenueByEntity.keys());
  if (topIds.length > 0) {
    const { data: entityNames } = await admin
      .from("centres")
      .select("id, name")
      .in("id", topIds);

    for (const en of (entityNames ?? []) as Array<{ id: string; name: string }>) {
      const entry = revenueByEntity.get(en.id);
      if (entry) entry.name = en.name;
    }
  }

  const topEntities = Array.from(revenueByEntity.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // ========================
  // GROWTH CHART (cumulative centres + schools)
  // ========================

  const { data: allCentresWithDates } = await admin
    .from("centres")
    .select("id, type, created_at")
    .order("created_at");

  const growthMap = new Map<
    string,
    { centres: number; schools: number; order: number }
  >();

  // Seed with last 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    growthMap.set(monthKey(d), { centres: 0, schools: 0, order: 5 - i });
  }

  // Calculate cumulative counts
  let cumulativeCentres = 0;
  let cumulativeSchools = 0;

  const sortedMonths = Array.from(growthMap.entries()).sort(
    (a, b) => a[1].order - b[1].order
  );

  for (const [monthLabel, data] of sortedMonths) {
    // Find end of this month
    const [monStr, yrStr] = monthLabel.split(" ");
    const monIdx = new Date(`${monStr} 1, ${yrStr}`).getMonth();
    const endOfMonth = new Date(parseInt(yrStr), monIdx + 1, 0, 23, 59, 59);

    cumulativeCentres = 0;
    cumulativeSchools = 0;

    for (const c of (allCentresWithDates ?? []) as Array<{
      type: string;
      created_at: string;
    }>) {
      if (new Date(c.created_at) <= endOfMonth) {
        if (c.type === "school") cumulativeSchools++;
        else cumulativeCentres++;
      }
    }

    data.centres = cumulativeCentres;
    data.schools = cumulativeSchools;
  }

  const growthBreakdown = Array.from(growthMap.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([month, data]) => ({
      month,
      centres: data.centres,
      schools: data.schools,
    }));

  // ========================
  // COACHES
  // ========================

  const { data: coachProfiles } = await admin
    .from("profiles")
    .select("id, name")
    .eq("role", "coach");

  const totalCoaches = coachProfiles?.length ?? 0;

  // Sessions per coach this week
  const { data: weekCoachSessions } = await admin
    .from("sessions")
    .select("coach_id")
    .gte("date", weekRange.start)
    .lte("date", weekRange.end)
    .neq("status", "cancelled")
    .not("coach_id", "is", null);

  const coachSessionMap = new Map<string, number>();
  for (const s of (weekCoachSessions ?? []) as Array<{ coach_id: string }>) {
    coachSessionMap.set(s.coach_id, (coachSessionMap.get(s.coach_id) ?? 0) + 1);
  }

  // Avg sessions per coach over last 4 weeks
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const { count: last4WeeksSessions } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .gte("date", fourWeeksAgo.toISOString().split("T")[0])
    .neq("status", "cancelled")
    .not("coach_id", "is", null);

  const avgSessionsPerWeek =
    totalCoaches > 0
      ? Math.round(((last4WeeksSessions ?? 0) / 4 / totalCoaches) * 10) / 10
      : 0;

  // Compliance: check wwcc and first_aid expiry
  const { data: complianceDocs } = await admin
    .from("compliance_docs")
    .select("user_id, doc_type, expiry_date, status")
    .in("doc_type", ["wwcc", "first_aid"]);

  const now = new Date();
  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  const coachComplianceMap = new Map<
    string,
    "clear" | "warning" | "alert"
  >();

  // Initialize all coaches as clear (they start with nothing, which we'll treat as warning)
  for (const coach of coachProfiles ?? []) {
    coachComplianceMap.set(coach.id, "warning"); // Default: missing docs = warning
  }

  // Group docs by coach
  const coachDocMap = new Map<
    string,
    Array<{ doc_type: string; expiry_date: string | null }>
  >();
  for (const doc of (complianceDocs ?? []) as Array<{
    user_id: string;
    doc_type: string;
    expiry_date: string | null;
  }>) {
    if (!coachDocMap.has(doc.user_id)) coachDocMap.set(doc.user_id, []);
    coachDocMap.get(doc.user_id)!.push(doc);
  }

  // Determine status per coach
  for (const [coachId, docs] of coachDocMap) {
    const hasWwcc = docs.find((d) => d.doc_type === "wwcc");
    const hasFirstAid = docs.find((d) => d.doc_type === "first_aid");

    if (!hasWwcc || !hasFirstAid) {
      coachComplianceMap.set(coachId, "alert");
      continue;
    }

    let status: "clear" | "warning" | "alert" = "clear";

    for (const doc of [hasWwcc, hasFirstAid]) {
      if (!doc.expiry_date) continue;
      const expiry = new Date(doc.expiry_date);
      if (expiry < now) {
        status = "alert";
        break;
      }
      if (expiry < thirtyDaysOut) {
        status = "warning";
      }
    }

    coachComplianceMap.set(coachId, status);
  }

  let allClear = 0;
  let expiringSoon = 0;
  let expired = 0;

  for (const status of coachComplianceMap.values()) {
    if (status === "clear") allClear++;
    else if (status === "warning") expiringSoon++;
    else expired++;
  }

  const coachList = (coachProfiles ?? [])
    .map((c: { id: string; name: string }) => ({
      id: c.id,
      name: c.name || "Unknown",
      sessionsThisWeek: coachSessionMap.get(c.id) ?? 0,
      complianceStatus: coachComplianceMap.get(c.id) ?? "warning",
    }))
    .sort(
      (a: { sessionsThisWeek: number }, b: { sessionsThisWeek: number }) =>
        b.sessionsThisWeek - a.sessionsThisWeek
    );

  return {
    centres: {
      active: activeCentreIds.size,
      total: totalCentres ?? 0,
      target: YEAR_1_CENTRE_TARGET,
      newThisMonth: newCentresThisMonth ?? 0,
      sessionsThisWeek,
      avgSessionRate: Math.round(avgSessionRate),
    },
    schools: {
      active: activeSchoolIds.size,
      total: totalSchools ?? 0,
      target: YEAR_1_SCHOOL_TARGET,
      totalEnrolledStudents,
    },
    revenue: {
      thisMonth: Math.round(revenueThisMonth),
      thisTerm: Math.round(revenueThisTerm),
      thisYear: Math.round(revenueThisYear),
      yearTarget: YEAR_1_REVENUE_TARGET,
      childcareRevenue: Math.round(childcareRevenue),
      schoolRevenue: Math.round(schoolRevenue),
      isEstimate: !hasInvoices,
      monthlyBreakdown,
    },
    growth: {
      monthlyBreakdown: growthBreakdown,
    },
    topEntities,
    coaches: {
      active: coachSessionMap.size,
      total: totalCoaches,
      avgSessionsPerWeek,
      compliance: { allClear, expiringSoon, expired },
      list: coachList,
    },
  };
}

// ========================
// 2. getRecentActivity
// ========================

export async function getRecentActivity(
  limit: number = 20
): Promise<ActivityItem[]> {
  const admin = createSupabaseAdmin();
  const items: ActivityItem[] = [];

  // New centres
  const { data: newCentres } = await admin
    .from("centres")
    .select("id, name, type, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  for (const c of (newCentres ?? []) as Array<{
    id: string;
    name: string;
    type: string;
    created_at: string;
  }>) {
    items.push({
      type: "new_centre",
      description: `New ${c.type === "school" ? "school" : "centre"}: ${c.name}`,
      timestamp: c.created_at,
      entityId: c.id,
    });
  }

  // New bookings
  const { data: newBookings } = await admin
    .from("bookings")
    .select("id, children_json, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  for (const b of (newBookings ?? []) as Array<{
    id: string;
    children_json: Array<{ child_name: string }> | null;
    created_at: string;
  }>) {
    const childName = b.children_json?.[0]?.child_name || "A child";
    items.push({
      type: "new_booking",
      description: `New booking for ${childName}`,
      timestamp: b.created_at,
      entityId: b.id,
    });
  }

  // Completed sessions
  const { data: completedSessions } = await admin
    .from("sessions")
    .select("id, date, sport, centre_id, completed_at")
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit);

  const completedCentreIds = [
    ...new Set(
      (completedSessions ?? [])
        .map((s: { centre_id: string | null }) => s.centre_id)
        .filter(Boolean) as string[]
    ),
  ];

  const centreNameMap = new Map<string, string>();
  if (completedCentreIds.length > 0) {
    const { data: cNames } = await admin
      .from("centres")
      .select("id, name")
      .in("id", completedCentreIds);
    for (const c of (cNames ?? []) as Array<{ id: string; name: string }>) {
      centreNameMap.set(c.id, c.name);
    }
  }

  for (const s of (completedSessions ?? []) as Array<{
    id: string;
    sport: string;
    centre_id: string | null;
    completed_at: string;
  }>) {
    const centreName = s.centre_id ? centreNameMap.get(s.centre_id) || "a centre" : "a centre";
    items.push({
      type: "session_completed",
      description: `${s.sport} session completed at ${centreName}`,
      timestamp: s.completed_at,
      entityId: s.id,
    });
  }

  // Paid invoices
  const { data: paidInvoices } = await admin
    .from("invoices")
    .select("id, invoice_number, total, payment_date")
    .eq("status", "paid")
    .not("payment_date", "is", null)
    .order("payment_date", { ascending: false })
    .limit(limit);

  for (const i of (paidInvoices ?? []) as Array<{
    id: string;
    invoice_number: string;
    total: number;
    payment_date: string;
  }>) {
    items.push({
      type: "invoice_paid",
      description: `Invoice ${i.invoice_number} paid ($${Number(i.total).toFixed(0)})`,
      timestamp: i.payment_date,
      entityId: i.id,
    });
  }

  // New coaches
  const { data: newCoaches } = await admin
    .from("profiles")
    .select("id, name, created_at")
    .eq("role", "coach")
    .order("created_at", { ascending: false })
    .limit(limit);

  for (const c of (newCoaches ?? []) as Array<{
    id: string;
    name: string;
    created_at: string;
  }>) {
    items.push({
      type: "new_coach",
      description: `New coach: ${c.name}`,
      timestamp: c.created_at,
      entityId: c.id,
    });
  }

  // Sort by timestamp DESC and limit
  return items
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, limit);
}
