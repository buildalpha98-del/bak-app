"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseHoursAdjustmentTask,
  reviewCause,
  type ChangeRequestItem,
  type DecisionQueue,
  type HoursAdjustmentItem,
  type ReviewItem,
} from "@/lib/ops/decision-queue";

// The "Needs your decision" queue (lib/ops/decision-queue.ts). Reads go
// through the server client (admin/ops RLS); the change-request
// requester's name is a client_users row, which staff can read.

async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Not authenticated." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { supabase, user: null, error: "Not authorised." };
  }
  return { supabase, user, error: null };
}

export async function getDecisionQueue(): Promise<{ data: DecisionQueue | null; error: string | null }> {
  try {
    const { supabase, error: authErr } = await requireStaff();
    if (authErr) return { data: null, error: authErr };

    const [{ data: tasks }, { data: flagged }, { data: changes }] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, description, linked_entity_id, created_at, column:task_columns!column_id(is_final)")
        .like("title", "Hours adjustment:%")
        .order("created_at"),
      supabase
        .from("sessions")
        .select(
          "id, date, sport, duration_minutes, actual_duration_minutes, headcount, completed_at, updated_at, centres:centre_id(name), profiles:coach_id(name)"
        )
        .eq("needs_ops_review", true)
        .eq("status", "completed")
        .order("date", { ascending: false })
        .limit(50),
      supabase
        .from("session_change_requests")
        .select(
          "id, session_id, centre_id, request_type, requested_date, requested_time, reason, created_at, client_users:requested_by(name), sessions:session_id(date, time, sport, centres:centre_id(name))"
        )
        .eq("status", "pending")
        .order("created_at"),
    ]);

    // Hours adjustments: the task carries the ask; the session carries where.
    // Open = not in a final column (tasks has no status column).
    const parsed = (tasks ?? [])
      .filter((t) => !((t as { column?: { is_final?: boolean } | null }).column?.is_final))
      .map(parseHoursAdjustmentTask)
      .filter((t): t is NonNullable<typeof t> => t !== null);
    const sessionIds = parsed.map((t) => t.session_id);
    const { data: hoursSessions } = sessionIds.length
      ? await supabase.from("sessions").select("id, date, sport, centres:centre_id(name)").in("id", sessionIds)
      : { data: [] as Array<{ id: string; date: string; sport: string; centres: unknown }> };
    const sessionById = new Map((hoursSessions ?? []).map((s) => [s.id as string, s]));
    const hours: HoursAdjustmentItem[] = parsed.map((t) => {
      const s = sessionById.get(t.session_id);
      return {
        kind: "hours",
        ...t,
        centre_name: ((s?.centres as unknown as { name: string } | null)?.name as string) ?? "Unknown",
        sport: (s?.sport as string) ?? "",
        date: (s?.date as string) ?? "",
      };
    });
    // A review flag the coach has already asked about is one decision, not two.
    const askedAbout = new Set(hours.map((h) => h.session_id));

    const reviews: ReviewItem[] = (flagged ?? [])
      .filter((s) => !askedAbout.has(s.id as string))
      .map((s) => ({
        kind: "review",
        session_id: s.id as string,
        coach_name: ((s.profiles as unknown as { name: string } | null)?.name as string | undefined) ?? null,
        centre_name: ((s.centres as unknown as { name: string } | null)?.name as string) ?? "Unknown",
        sport: s.sport as string,
        date: s.date as string,
        rostered_minutes: s.duration_minutes as number,
        actual_minutes: (s.actual_duration_minutes as number | null) ?? null,
        headcount: (s.headcount as number | null) ?? null,
        cause: reviewCause({ actual_duration_minutes: (s.actual_duration_minutes as number | null) ?? null, duration_minutes: s.duration_minutes as number }),
        since: ((s.completed_at as string | null) ?? (s.updated_at as string)) as string,
      }));

    const changeItems: ChangeRequestItem[] = (changes ?? []).map((c) => {
      const s = c.sessions as unknown as { date: string; time: string; sport: string; centres: { name: string } | null } | null;
      return {
        kind: "change",
        request_id: c.id as string,
        session_id: c.session_id as string,
        centre_id: c.centre_id as string,
        centre_name: s?.centres?.name ?? "Unknown",
        sport: s?.sport ?? "",
        date: s?.date ?? "",
        time: s?.time ?? "",
        request_type: c.request_type as "reschedule" | "cancel",
        requested_date: (c.requested_date as string | null) ?? null,
        requested_time: (c.requested_time as string | null) ?? null,
        reason: (c.reason as string | null) ?? null,
        requester_name: ((c.client_users as unknown as { name: string } | null)?.name as string | undefined) ?? null,
        since: c.created_at as string,
      };
    });

    return {
      data: { hours, reviews, changes: changeItems, total: hours.length + reviews.length + changeItems.length },
      error: null,
    };
  } catch (err) {
    console.error("getDecisionQueue error:", err);
    return { data: null, error: "Failed to load the decision queue." };
  }
}

/**
 * Settle a flagged session: record the minutes it ran (which pay uses)
 * and clear the flag. Rejecting the app's longer figure means setting it
 * back to the rostered length.
 */
export async function resolveSessionReview(input: { sessionId: string; actualMinutes: number }): Promise<{ error: string | null }> {
  try {
    const { supabase, user, error: authErr } = await requireStaff();
    if (authErr || !user) return { error: authErr };
    if (!Number.isInteger(input.actualMinutes) || input.actualMinutes < 0 || input.actualMinutes > 720) {
      return { error: "Minutes must be between 0 and 720." };
    }
    const { error } = await supabase
      .from("sessions")
      .update({ actual_duration_minutes: input.actualMinutes, needs_ops_review: false, updated_at: new Date().toISOString() })
      .eq("id", input.sessionId)
      .eq("needs_ops_review", true);
    if (error) throw error;
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_review_resolved",
      entity_type: "session",
      entity_id: input.sessionId,
      metadata: { actual_minutes: input.actualMinutes },
    });
    revalidatePath("/ops");
    revalidatePath("/admin");
    return { error: null };
  } catch (err) {
    console.error("resolveSessionReview error:", err);
    return { error: "Failed to settle the session." };
  }
}

/**
 * Settle every auto-closed session at its rostered length in one go —
 * the nightly cron flagged them because nobody checked out, and pay
 * already uses the rostered minutes when nothing was recorded.
 */
export async function settleAutoClosedSessions(): Promise<{ data: { settled: number } | null; error: string | null }> {
  try {
    const { supabase, user, error: authErr } = await requireStaff();
    if (authErr || !user) return { data: null, error: authErr };
    const { data: rows } = await supabase
      .from("sessions")
      .select("id, duration_minutes, actual_duration_minutes")
      .eq("needs_ops_review", true)
      .eq("status", "completed");
    const auto = (rows ?? []).filter((s) => reviewCause({ actual_duration_minutes: (s.actual_duration_minutes as number | null) ?? null, duration_minutes: s.duration_minutes as number }) === "auto_closed");
    for (const s of auto) {
      const { error } = await supabase
        .from("sessions")
        .update({ actual_duration_minutes: s.duration_minutes, needs_ops_review: false, updated_at: new Date().toISOString() })
        .eq("id", s.id)
        .eq("needs_ops_review", true);
      if (error) throw error;
    }
    if (auto.length > 0) {
      await supabase.from("activity_log").insert({
        user_id: user.id,
        action: "auto_closed_sessions_settled",
        entity_type: "session",
        entity_id: auto[0].id,
        metadata: { settled: auto.length, session_ids: auto.map((s) => s.id) },
      });
    }
    revalidatePath("/ops");
    revalidatePath("/admin");
    return { data: { settled: auto.length }, error: null };
  } catch (err) {
    console.error("settleAutoClosedSessions error:", err);
    return { data: null, error: "Failed to settle the sessions." };
  }
}

/** How many decisions are waiting — for the dashboards' pulse strips. */
export async function getDecisionCount(): Promise<number> {
  const { data } = await getDecisionQueue();
  return data?.total ?? 0;
}
