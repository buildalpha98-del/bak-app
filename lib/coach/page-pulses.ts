"use server";

// ============================================================
// Coach surface pulses — per-page lightweight counts
// ============================================================
//
// One server action per coach page that needs a header pulse strip.
// All counts are scoped to the current coach (user.id) — never read
// cross-coach data. Errors swallow to zeros.
//
// Implemented:
//   - forms          (overdue / due-today / completed-this-week)
//   - training       (overdue / due-soon / new / completed)
//   - messages       (unread / today)
//   - invoicing      (unpaid / paid-this-month / sessions-in-period)
//   - docs           (recent)
//   - tasks          (overdue / due-today / completed-this-week)
//   - assessments    (children-pending / submitted-this-term)
//   - announcements  (unread / this-week)
//   - equipment      (kits-assigned / issues-flagged)
//   - notifications  (urgent / important)

import { createSupabaseServerClient } from "@/lib/supabase/server";

function sydneyTodayStr(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Sydney",
  });
}

function startOfWeekStr(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

function startOfMonthStr(): string {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split("T")[0];
}

// ============================================================
// Forms — coach's own submission backlog
// ============================================================

export interface CoachFormsPulse {
  overdueCount: number;
  dueTodayCount: number;
  completedThisWeekCount: number;
}

export async function getCoachFormsPulse(
  coachId: string,
): Promise<CoachFormsPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = sydneyTodayStr();
    const weekStart = startOfWeekStr();

    const [pastCompletedSessions, todaySessions, weekSubs] = await Promise.all([
      supabase
        .from("sessions")
        .select("id")
        .eq("coach_id", coachId)
        .eq("status", "completed")
        .lt("date", today)
        .order("date", { ascending: false })
        .limit(50),
      supabase
        .from("sessions")
        .select("id, status")
        .eq("coach_id", coachId)
        .eq("date", today),
      supabase
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("submitted_by", coachId)
        .gte("submitted_at", weekStart),
    ]);

    const pastIds = (pastCompletedSessions.data ?? []).map(
      (r) => r.id as string,
    );
    const todayIds = (todaySessions.data ?? []).map((r) => r.id as string);

    let overdueCount = 0;
    let dueTodayCount = 0;

    const checkIds = [...new Set([...pastIds, ...todayIds])];
    if (checkIds.length > 0) {
      const { data: subs } = await supabase
        .from("form_submissions")
        .select("session_id")
        .in("session_id", checkIds)
        .eq("submitted_by", coachId);
      const submitted = new Set(
        (subs ?? []).map((r) => r.session_id as string),
      );
      overdueCount = pastIds.filter((id) => !submitted.has(id)).length;
      dueTodayCount = todayIds.filter((id) => !submitted.has(id)).length;
    }

    return {
      overdueCount,
      dueTodayCount,
      completedThisWeekCount: weekSubs.count ?? 0,
    };
  } catch (err) {
    console.error("getCoachFormsPulse error:", err);
    return {
      overdueCount: 0,
      dueTodayCount: 0,
      completedThisWeekCount: 0,
    };
  }
}

// ============================================================
// Training — assigned / overdue / completed
// ============================================================

export interface CoachTrainingPulse {
  overdueCount: number;
  dueSoonCount: number;
  newCount: number;
  completedCount: number;
}

export async function getCoachTrainingPulse(
  coachId: string,
): Promise<CoachTrainingPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = sydneyTodayStr();
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const in7Str = in7.toISOString().split("T")[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split("T")[0];

    const [overdueRes, dueSoonRes, newRes, completedRes] = await Promise.all([
      supabase
        .from("training_assignments")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .neq("status", "completed")
        .lt("due_date", today),
      supabase
        .from("training_assignments")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .neq("status", "completed")
        .gte("due_date", today)
        .lte("due_date", in7Str),
      supabase
        .from("training_assignments")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("status", "assigned")
        .gte("assigned_at", weekAgoStr),
      supabase
        .from("training_completions")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId),
    ]);

    return {
      overdueCount: overdueRes.count ?? 0,
      dueSoonCount: dueSoonRes.count ?? 0,
      newCount: newRes.count ?? 0,
      completedCount: completedRes.count ?? 0,
    };
  } catch (err) {
    console.error("getCoachTrainingPulse error:", err);
    return {
      overdueCount: 0,
      dueSoonCount: 0,
      newCount: 0,
      completedCount: 0,
    };
  }
}

// ============================================================
// Messages — unread / today
// ============================================================

export interface CoachMessagesPulse {
  unreadCount: number;
  todayCount: number;
}

export async function getCoachMessagesPulse(
  coachId: string,
): Promise<CoachMessagesPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = sydneyTodayStr();

    const [unreadRes, todayRes] = await Promise.all([
      supabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", coachId)
        .is("read_at", null),
      supabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", coachId)
        .gte("created_at", today),
    ]);

    return {
      unreadCount: unreadRes.count ?? 0,
      todayCount: todayRes.count ?? 0,
    };
  } catch (err) {
    console.error("getCoachMessagesPulse error:", err);
    return { unreadCount: 0, todayCount: 0 };
  }
}

// ============================================================
// Invoicing — coach's OWN $ only (no financial-access gate needed)
// ============================================================

export interface CoachInvoicingPulse {
  unpaidCount: number;
  paidThisMonthCount: number;
  sessionsThisPeriodCount: number;
}

export async function getCoachInvoicingPulse(
  coachId: string,
  periodStart: string,
  periodEnd: string,
): Promise<CoachInvoicingPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const monthStart = startOfMonthStr();

    const [unpaidRes, paidRes, sessionsRes] = await Promise.all([
      supabase
        .from("coach_invoices")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .neq("status", "paid"),
      supabase
        .from("coach_invoices")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("status", "paid")
        .gte("paid_at", monthStart),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("status", "completed")
        .gte("date", periodStart)
        .lte("date", periodEnd),
    ]);

    return {
      unpaidCount: unpaidRes.count ?? 0,
      paidThisMonthCount: paidRes.count ?? 0,
      sessionsThisPeriodCount: sessionsRes.count ?? 0,
    };
  } catch (err) {
    console.error("getCoachInvoicingPulse error:", err);
    return {
      unpaidCount: 0,
      paidThisMonthCount: 0,
      sessionsThisPeriodCount: 0,
    };
  }
}

// ============================================================
// Docs — recent / available to me
// ============================================================

export interface CoachDocsPulse {
  recentCount: number;
  totalCount: number;
}

export async function getCoachDocsPulse(): Promise<CoachDocsPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    const [recentRes, totalRes] = await Promise.all([
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekAgoStr),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true }),
    ]);

    return {
      recentCount: recentRes.count ?? 0,
      totalCount: totalRes.count ?? 0,
    };
  } catch (err) {
    console.error("getCoachDocsPulse error:", err);
    return { recentCount: 0, totalCount: 0 };
  }
}

// ============================================================
// Tasks — overdue / due today / completed this week
// ============================================================

export interface CoachTasksPulse {
  overdueCount: number;
  dueTodayCount: number;
  completedThisWeekCount: number;
}

export async function getCoachTasksPulse(
  coachId: string,
): Promise<CoachTasksPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = sydneyTodayStr();
    const weekStart = startOfWeekStr();

    const [overdueRes, todayRes, doneRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, column:task_columns!column_id(is_final)")
        .eq("assignee_id", coachId)
        .lt("due_date", today)
        .limit(200),
      supabase
        .from("tasks")
        .select("id, column:task_columns!column_id(is_final)")
        .eq("assignee_id", coachId)
        .eq("due_date", today)
        .limit(200),
      supabase
        .from("tasks")
        .select("id, completed_at, column:task_columns!column_id(is_final)")
        .eq("assignee_id", coachId)
        .gte("completed_at", weekStart)
        .limit(200),
    ]);

    const openOnly = (rows: unknown[] | null) =>
      (rows ?? []).filter((r) => {
        const col = (r as { column?: unknown }).column as
          | { is_final?: boolean }
          | Array<{ is_final?: boolean }>
          | null
          | undefined;
        // Supabase returns the joined row as an array (or a single
        // object) depending on the relationship. Normalise both.
        const final = Array.isArray(col)
          ? (col[0]?.is_final ?? false)
          : (col?.is_final ?? false);
        return !final;
      }).length;

    return {
      overdueCount: openOnly(overdueRes.data),
      dueTodayCount: openOnly(todayRes.data),
      completedThisWeekCount: (doneRes.data ?? []).length,
    };
  } catch (err) {
    console.error("getCoachTasksPulse error:", err);
    return {
      overdueCount: 0,
      dueTodayCount: 0,
      completedThisWeekCount: 0,
    };
  }
}

// ============================================================
// Assessments — children pending / submitted this term
// ============================================================

export interface CoachAssessmentsPulse {
  childrenPendingCount: number;
  submittedThisTermCount: number;
}

export async function getCoachAssessmentsPulse(
  coachId: string,
): Promise<CoachAssessmentsPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    // Active term
    const today = sydneyTodayStr();
    const { data: term } = await supabase
      .from("terms")
      .select("id, start_date, end_date")
      .lte("start_date", today)
      .gte("end_date", today)
      .maybeSingle();

    if (!term) {
      return { childrenPendingCount: 0, submittedThisTermCount: 0 };
    }

    // Ratings submitted by this coach this term
    const { data: submittedRows, count: submittedCount } = await supabase
      .from("skill_ratings")
      .select("child_id", { count: "exact" })
      .eq("coach_id", coachId)
      .eq("term_id", term.id);

    const ratedChildSet = new Set(
      (submittedRows ?? []).map((r) => r.child_id as string),
    );

    // Children whose centres have sessions assigned to me this term
    const { data: sessionCentres } = await supabase
      .from("sessions")
      .select("centre_id")
      .eq("coach_id", coachId)
      .eq("term_id", term.id);

    const centreIds = [
      ...new Set(
        (sessionCentres ?? []).map((s) => s.centre_id as string),
      ),
    ];
    let childrenPendingCount = 0;
    if (centreIds.length > 0) {
      const { data: links } = await supabase
        .from("centre_children")
        .select("child_id")
        .in("centre_id", centreIds)
        .eq("status", "active");

      const childIds = new Set(
        (links ?? []).map((r) => r.child_id as string),
      );
      childrenPendingCount = [...childIds].filter(
        (id) => !ratedChildSet.has(id),
      ).length;
    }

    return {
      childrenPendingCount,
      submittedThisTermCount: submittedCount ?? 0,
    };
  } catch (err) {
    console.error("getCoachAssessmentsPulse error:", err);
    return { childrenPendingCount: 0, submittedThisTermCount: 0 };
  }
}

// ============================================================
// Announcements — unread + this-week
// ============================================================

export interface CoachAnnouncementsPulse {
  unreadCount: number;
  thisWeekCount: number;
}

export async function getCoachAnnouncementsPulse(
  coachId: string,
): Promise<CoachAnnouncementsPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const weekStart = startOfWeekStr();

    const { data: rows } = await supabase
      .from("announcements")
      .select("id, created_at, announcement_reads!left(user_id)")
      .in("audience", ["all", "ops_and_coaches", "coaches_only"])
      .order("created_at", { ascending: false })
      .limit(100);

    const announcements = (rows ?? []) as Array<{
      id: string;
      created_at: string;
      announcement_reads: Array<{ user_id: string }> | null;
    }>;

    const unreadCount = announcements.filter((a) => {
      const reads = a.announcement_reads ?? [];
      return !reads.some((r) => r.user_id === coachId);
    }).length;

    const thisWeekCount = announcements.filter(
      (a) => a.created_at >= weekStart,
    ).length;

    return { unreadCount, thisWeekCount };
  } catch (err) {
    console.error("getCoachAnnouncementsPulse error:", err);
    return { unreadCount: 0, thisWeekCount: 0 };
  }
}

// ============================================================
// Equipment — kits assigned to my upcoming shifts + open issues
// ============================================================

export interface CoachEquipmentPulse {
  kitsAssignedCount: number;
  issuesOpenCount: number;
}

export async function getCoachEquipmentPulse(
  coachId: string,
): Promise<CoachEquipmentPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = sydneyTodayStr();

    const [kitsRes, issueRes] = await Promise.all([
      supabase
        .from("sessions")
        .select("equipment_kit_id")
        .eq("coach_id", coachId)
        .gte("date", today)
        .not("equipment_kit_id", "is", null)
        .limit(200),
      supabase
        .from("equipment_logs")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("action", "issue_flagged"),
    ]);

    const kitIds = new Set(
      (kitsRes.data ?? [])
        .map((r) => r.equipment_kit_id as string | null)
        .filter(Boolean) as string[],
    );

    return {
      kitsAssignedCount: kitIds.size,
      issuesOpenCount: issueRes.count ?? 0,
    };
  } catch (err) {
    console.error("getCoachEquipmentPulse error:", err);
    return { kitsAssignedCount: 0, issuesOpenCount: 0 };
  }
}

// ============================================================
// Notifications — urgent / important
// ============================================================

export interface CoachNotificationsPulse {
  urgentCount: number;
  importantCount: number;
}

export async function getCoachNotificationsPulse(
  coachId: string,
): Promise<CoachNotificationsPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const [urgentRes, importantRes] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", coachId)
        .eq("tier", "urgent")
        .is("read_at", null),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", coachId)
        .eq("tier", "important")
        .is("read_at", null),
    ]);

    return {
      urgentCount: urgentRes.count ?? 0,
      importantCount: importantRes.count ?? 0,
    };
  } catch (err) {
    console.error("getCoachNotificationsPulse error:", err);
    return { urgentCount: 0, importantCount: 0 };
  }
}
