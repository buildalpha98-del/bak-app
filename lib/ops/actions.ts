"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSwapRequestsForOps } from "@/lib/sessions/shift-actions";
import type { SwapRequestWithDetails } from "@/lib/sessions/shift-actions";
import { getTasks } from "@/lib/tasks/actions";
import type { TaskWithRelations } from "@/lib/types/database";
import { getRecentFeedback } from "@/lib/feedback/actions";
import type { SessionStatus } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface TodaySession {
  id: string;
  date: string;
  time: string;
  duration_minutes: number;
  sport: string;
  status: SessionStatus;
  centre_id: string;
  centre_name: string;
  coach_id: string | null;
  coach_name: string | null;
}

export interface TodaySessionStats {
  total: number;
  confirmed: number;
  pending: number;
  completed: number;
  in_progress: number;
  unassigned: number;
}

export interface UnconfirmedShiftItem {
  session_id: string;
  date: string;
  time: string;
  sport: string;
  centre_name: string;
  coach_id: string;
  coach_name: string;
  pending_since: string;
  hours_pending: number;
}

export interface ComplianceAlert {
  coach_id: string;
  coach_name: string;
  doc_type: string;
  expiry_date: string | null;
  status: string;
  days_remaining: number | null;
  severity: "expired" | "critical" | "warning";
}

export interface EquipmentIssue {
  log_id: string;
  kit_id: string;
  kit_name: string;
  notes: string | null;
  flagged_by_name: string;
  created_at: string;
}

export interface RecentRating {
  id: string;
  centre_name: string;
  sport: string | null;
  rating: number;
  comment: string | null;
  submitted_at: string;
}

export interface CommandCentreData {
  todaySessions: TodaySession[];
  todayStats: TodaySessionStats;
  unconfirmedShifts: UnconfirmedShiftItem[];
  swapRequests: SwapRequestWithDetails[];
  complianceAlerts: ComplianceAlert[];
  equipmentIssues: EquipmentIssue[];
  tasks: TaskWithRelations[];
  recentRatings: RecentRating[];
}

// ============================================================
// 1. getTodaysSessions
// ============================================================

export async function getTodaysSessions(): Promise<{
  sessions: TodaySession[];
  stats: TodaySessionStats;
}> {
  const supabase = await createSupabaseServerClient();

  // Use AEST date (UTC+11 during daylight saving, UTC+10 standard)
  const now = new Date();
  const aestOffset = 11; // AEDT (March = daylight saving)
  const aest = new Date(now.getTime() + aestOffset * 60 * 60 * 1000);
  const today = aest.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, date, time, duration_minutes, sport, status, centre_id, coach_id, centres:centre_id(name), profiles:coach_id(name)"
    )
    .eq("date", today)
    .order("time", { ascending: true });

  if (error || !data) {
    return {
      sessions: [],
      stats: { total: 0, confirmed: 0, pending: 0, completed: 0, in_progress: 0, unassigned: 0 },
    };
  }

  const sessions: TodaySession[] = data.map((r: Record<string, unknown>) => {
    const centre = r.centres as unknown as Record<string, unknown> | null;
    const profile = r.profiles as unknown as Record<string, unknown> | null;
    return {
      id: r.id as string,
      date: r.date as string,
      time: r.time as string,
      duration_minutes: r.duration_minutes as number,
      sport: r.sport as string,
      status: r.status as SessionStatus,
      centre_id: r.centre_id as string,
      centre_name: (centre?.name as string) ?? "Unknown",
      coach_id: (r.coach_id as string) ?? null,
      coach_name: (profile?.name as string) ?? null,
    };
  });

  const stats: TodaySessionStats = {
    total: sessions.length,
    confirmed: sessions.filter((s) => s.status === "confirmed").length,
    pending: sessions.filter(
      (s) => s.status === "pending_confirmation" || s.status === "published"
    ).length,
    completed: sessions.filter((s) => s.status === "completed").length,
    in_progress: sessions.filter((s) => s.status === "in_progress").length,
    unassigned: sessions.filter((s) => !s.coach_id).length,
  };

  return { sessions, stats };
}

// ============================================================
// 2. getUpcomingUnconfirmedShifts
// ============================================================

export async function getUpcomingUnconfirmedShifts(): Promise<{
  data: UnconfirmedShiftItem[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Next 48 hours date range
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, date, time, sport, coach_id, updated_at, centres:centre_id(name), profiles:coach_id(name)"
      )
      .eq("status", "pending_confirmation")
      .gte("date", today)
      .lte("date", in48h)
      .not("coach_id", "is", null)
      .order("date")
      .order("time");

    if (error) throw error;

    const nowMs = Date.now();
    const mapped: UnconfirmedShiftItem[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const centre = r.centres as unknown as Record<string, unknown> | null;
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        const updatedAt = r.updated_at as string;
        const hoursP = Math.floor(
          (nowMs - new Date(updatedAt).getTime()) / (60 * 60 * 1000)
        );

        return {
          session_id: r.id as string,
          date: r.date as string,
          time: r.time as string,
          sport: r.sport as string,
          centre_name: (centre?.name as string) ?? "Unknown",
          coach_id: r.coach_id as string,
          coach_name: (profile?.name as string) ?? "Unknown",
          pending_since: updatedAt,
          hours_pending: hoursP,
        };
      }
    );

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getUpcomingUnconfirmedShifts error:", err);
    return { data: null, error: "Failed to fetch unconfirmed shifts." };
  }
}

// ============================================================
// 3. getComplianceAlerts
// ============================================================

export async function getComplianceAlerts(): Promise<{
  data: ComplianceAlert[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Fetch expired docs
    const { data: expired, error: expErr } = await supabase
      .from("compliance_docs")
      .select("id, doc_type, expiry_date, status, user_id, profiles:user_id(id, name)")
      .eq("status", "expired");

    if (expErr) throw expErr;

    // Fetch docs expiring within 30 days (still verified)
    const { data: expiring, error: expingErr } = await supabase
      .from("compliance_docs")
      .select("id, doc_type, expiry_date, status, user_id, profiles:user_id(id, name)")
      .eq("status", "verified")
      .not("expiry_date", "is", null)
      .lte("expiry_date", in30Days)
      .gte("expiry_date", today);

    if (expingErr) throw expingErr;

    const todayMs = new Date(today).getTime();

    const mapDoc = (
      r: Record<string, unknown>,
      isExpired: boolean
    ): ComplianceAlert => {
      const profile = r.profiles as unknown as Record<string, unknown> | null;
      const expiryDate = r.expiry_date as string | null;
      let daysRemaining: number | null = null;
      let severity: ComplianceAlert["severity"] = "warning";

      if (isExpired) {
        severity = "expired";
        daysRemaining = expiryDate
          ? Math.floor((new Date(expiryDate).getTime() - todayMs) / (24 * 60 * 60 * 1000))
          : null;
      } else if (expiryDate) {
        daysRemaining = Math.floor(
          (new Date(expiryDate).getTime() - todayMs) / (24 * 60 * 60 * 1000)
        );
        severity = daysRemaining <= 7 ? "critical" : "warning";
      }

      return {
        coach_id: (profile?.id as string) ?? (r.user_id as string),
        coach_name: (profile?.name as string) ?? "Unknown",
        doc_type: r.doc_type as string,
        expiry_date: expiryDate,
        status: r.status as string,
        days_remaining: daysRemaining,
        severity,
      };
    };

    const alerts: ComplianceAlert[] = [
      ...(expired ?? []).map((r) => mapDoc(r as unknown as Record<string, unknown>, true)),
      ...(expiring ?? []).map((r) => mapDoc(r as unknown as Record<string, unknown>, false)),
    ];

    // Sort: expired first, then by days_remaining ascending
    alerts.sort((a, b) => {
      if (a.severity === "expired" && b.severity !== "expired") return -1;
      if (a.severity !== "expired" && b.severity === "expired") return 1;
      return (a.days_remaining ?? 999) - (b.days_remaining ?? 999);
    });

    return { data: alerts, error: null };
  } catch (err) {
    console.error("getComplianceAlerts error:", err);
    return { data: null, error: "Failed to fetch compliance alerts." };
  }
}

// ============================================================
// 4. getEquipmentIssues
// ============================================================

export async function getEquipmentIssues(): Promise<{
  data: EquipmentIssue[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch issue-flagged logs
    const { data: logs, error: logErr } = await supabase
      .from("equipment_logs")
      .select(
        "id, kit_id, notes, created_at, equipment_kits:kit_id(id, name), profiles:user_id(name)"
      )
      .eq("action", "issue_flagged")
      .order("created_at", { ascending: false })
      .limit(20);

    if (logErr) throw logErr;
    if (!logs || logs.length === 0) return { data: [], error: null };

    // Get kit IDs to check for resolved tasks
    const kitIds = [...new Set((logs as unknown as Record<string, unknown>[]).map((l) => l.kit_id as string))];

    // Find tasks linked to these kits that are in final columns (resolved)
    const { data: resolvedTasks } = await supabase
      .from("tasks")
      .select("linked_entity_id, column:task_columns!column_id(is_final)")
      .eq("linked_entity_type", "equipment_kit")
      .eq("source", "equipment_issue")
      .in("linked_entity_id", kitIds);

    const resolvedKitIds = new Set(
      (resolvedTasks ?? [])
        .filter((t: Record<string, unknown>) => {
          const col = t.column as unknown as Record<string, unknown> | null;
          return col?.is_final === true;
        })
        .map((t: Record<string, unknown>) => t.linked_entity_id as string)
    );

    const issues: EquipmentIssue[] = (logs as unknown as Record<string, unknown>[])
      .filter((l) => !resolvedKitIds.has(l.kit_id as string))
      .slice(0, 10)
      .map((l) => {
        const kit = l.equipment_kits as unknown as Record<string, unknown> | null;
        const profile = l.profiles as unknown as Record<string, unknown> | null;
        return {
          log_id: l.id as string,
          kit_id: l.kit_id as string,
          kit_name: (kit?.name as string) ?? "Unknown Kit",
          notes: l.notes as string | null,
          flagged_by_name: (profile?.name as string) ?? "Unknown",
          created_at: l.created_at as string,
        };
      });

    return { data: issues, error: null };
  } catch (err) {
    console.error("getEquipmentIssues error:", err);
    return { data: null, error: "Failed to fetch equipment issues." };
  }
}

// ============================================================
// 5. getCommandCentreData
// ============================================================

export async function getCommandCentreData(
  userId: string
): Promise<CommandCentreData> {
  const [
    todayResult,
    unconfirmedResult,
    swapsResult,
    complianceResult,
    equipmentResult,
    tasksResult,
    feedbackResult,
  ] = await Promise.all([
    getTodaysSessions(),
    getUpcomingUnconfirmedShifts(),
    getSwapRequestsForOps(),
    getComplianceAlerts(),
    getEquipmentIssues(),
    getTasks({ assigneeId: userId }),
    getRecentFeedback(5),
  ]);

  // Filter tasks to non-final columns only, limit 8, sort by priority
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const activeTasks = (tasksResult.data ?? [])
    .filter((t) => {
      const col = t.column as unknown as Record<string, unknown> | null;
      return !col?.is_final;
    })
    .sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 4;
      const pb = priorityOrder[b.priority] ?? 4;
      if (pa !== pb) return pa - pb;
      // Then by due date (nulls last)
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    })
    .slice(0, 8);

  // Map feedback to our simpler RecentRating type
  const recentRatings: RecentRating[] = (feedbackResult.data ?? []).map(
    (f: Record<string, unknown>) => ({
      id: f.id as string,
      centre_name: f.centre_name as string,
      sport: (f.sport as string) ?? null,
      rating: f.rating as number,
      comment: (f.comment as string) ?? null,
      submitted_at: f.submitted_at as string,
    })
  );

  return {
    todaySessions: todayResult.sessions,
    todayStats: todayResult.stats,
    unconfirmedShifts: unconfirmedResult.data ?? [],
    swapRequests: swapsResult.data ?? [],
    complianceAlerts: complianceResult.data ?? [],
    equipmentIssues: equipmentResult.data ?? [],
    tasks: activeTasks,
    recentRatings,
  };
}
