"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminDashboardStats {
  totalActiveChildren: number;
  assessmentsCompletedThisTerm: number;
  namedAttendanceSessions: number;
  headcountOnlySessions: number;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const supabase = await createSupabaseServerClient();

  // Count active children
  const { count: totalActiveChildren } = await supabase
    .from("children")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  // Find the currently active term
  const { data: activeTerm } = await supabase
    .from("terms")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  // Count assessments (skill_ratings) completed this term
  let assessmentsCompletedThisTerm = 0;
  if (activeTerm) {
    const { count } = await supabase
      .from("skill_ratings")
      .select("*", { count: "exact", head: true })
      .eq("term_id", activeTerm.id);
    assessmentsCompletedThisTerm = count ?? 0;
  }

  // Count distinct sessions that have named attendance records
  const { data: namedSessions } = await supabase
    .from("session_attendances")
    .select("session_id");

  const uniqueNamedSessionIds = new Set(
    (namedSessions ?? []).map((r) => r.session_id)
  );
  const namedAttendanceSessions = uniqueNamedSessionIds.size;

  // Count completed sessions that only have headcount (no named attendance)
  const { data: completedWithHeadcount } = await supabase
    .from("sessions")
    .select("id")
    .eq("status", "completed")
    .not("headcount", "is", null);

  const headcountOnlySessions = (completedWithHeadcount ?? []).filter(
    (s) => !uniqueNamedSessionIds.has(s.id)
  ).length;

  return {
    totalActiveChildren: totalActiveChildren ?? 0,
    assessmentsCompletedThisTerm,
    namedAttendanceSessions,
    headcountOnlySessions,
  };
}
