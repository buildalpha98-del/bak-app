"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  resolvePayRate,
  calculateSessionPay,
  getFortnightlyPeriod,
} from "@/lib/utils/payRates";
import type { RateUnit, SessionType, CentreType } from "@/lib/types/enums";
import type { PayRateRecord } from "@/lib/utils/payRates";
import { priceShiftForCoach } from "@/lib/pay-rates/coach-shift-pay";
import { MEMBERSHIP_FILTER, MEMBERSHIP_JOIN_WITH_ROLE, isCoachOnSession, isLeadOf } from "@/lib/sessions/coach-membership";

// ============================================================
// Types
// ============================================================

export interface CoachPayRateDisplay {
  id: string;
  session_type: SessionType;
  rate: number;
  rate_unit: RateUnit;
  effective_from: string;
}

export interface CoachEarningsSummary {
  periodStart: string;
  periodEnd: string;
  sessionCount: number;
  totalHours: number;
  totalEarnings: number;
  sessions: EarningsSessionItem[];
}

export interface EarningsSessionItem {
  id: string;
  date: string;
  time: string;
  sport: string;
  centre_name: string;
  duration_minutes: number;
  pay_rate_resolved: number | null;
  rate_unit: RateUnit;
  amount: number;
}

export interface HoursAdjustmentRequest {
  id: string;
  session_id: string;
  coach_id: string;
  coach_name: string;
  session_date: string;
  session_sport: string;
  centre_name: string;
  rostered_duration: number;
  requested_duration: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface SessionRateInfo {
  rate: number | null;
  rate_unit: RateUnit;
  tier: string | null;
  tierLabel: string;
  amount: number | null;
  overrideReason: string | null;
}

// ============================================================
// Coach pay rates — own profile
// ============================================================

export async function getCoachPayRates(): Promise<{
  data: {
    defaultRate: number | null;
    rates: CoachPayRateDisplay[];
  } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const [profileRes, ratesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("default_pay_rate")
        .eq("id", user.id)
        .single(),
      supabase
        .from("pay_rates")
        .select("*")
        .eq("user_id", user.id)
        .order("session_type")
        .order("effective_from", { ascending: false }),
    ]);

    return {
      data: {
        defaultRate: profileRes.data?.default_pay_rate ?? null,
        rates: (ratesRes.data ?? []) as CoachPayRateDisplay[],
      },
      error: null,
    };
  } catch (err) {
    console.error("getCoachPayRates error:", err);
    return { data: null, error: "Failed to fetch pay rates." };
  }
}

export async function updateCoachDefaultRate(
  rate: number
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("profiles")
      .update({
        default_pay_rate: rate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) return { error: error.message };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "default_rate_updated",
      entity_type: "profile",
      entity_id: user.id,
      metadata: { new_rate: rate },
    });

    revalidatePath("/coach/profile");
    return { error: null };
  } catch (err) {
    console.error("updateCoachDefaultRate error:", err);
    return { error: "Failed to update default rate." };
  }
}

export async function upsertCoachSessionRate(input: {
  id?: string;
  session_type: SessionType;
  rate: number;
  rate_unit: RateUnit;
  effective_from: string;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    if (input.id) {
      const { error } = await supabase
        .from("pay_rates")
        .update({
          rate: input.rate,
          rate_unit: input.rate_unit,
          effective_from: input.effective_from,
        })
        .eq("id", input.id)
        .eq("user_id", user.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("pay_rates").insert({
        user_id: user.id,
        session_type: input.session_type,
        rate: input.rate,
        rate_unit: input.rate_unit,
        effective_from: input.effective_from,
      });
      if (error) return { error: error.message };
    }

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_rate_updated",
      entity_type: "pay_rate",
      entity_id: user.id,
      metadata: {
        session_type: input.session_type,
        rate: input.rate,
        rate_unit: input.rate_unit,
        effective_from: input.effective_from,
      },
    });

    revalidatePath("/coach/profile");
    return { error: null };
  } catch (err) {
    console.error("upsertCoachSessionRate error:", err);
    return { error: "Failed to save session rate." };
  }
}

export async function deleteCoachSessionRate(
  rateId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("pay_rates")
      .delete()
      .eq("id", rateId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/coach/profile");
    return { error: null };
  } catch (err) {
    console.error("deleteCoachSessionRate error:", err);
    return { error: "Failed to delete rate." };
  }
}

// ============================================================
// Session rate override (admin/ops)
// ============================================================

export async function setSessionRateOverride(input: {
  sessionId: string;
  rate: number;
  reason: string;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("sessions")
      .update({
        pay_rate_override: input.rate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.sessionId);

    if (error) return { error: error.message };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "pay_rate_override_set",
      entity_type: "session",
      entity_id: input.sessionId,
      metadata: {
        rate: input.rate,
        reason: input.reason,
      },
    });

    revalidatePath("/ops");
    revalidatePath("/admin");
    return { error: null };
  } catch (err) {
    console.error("setSessionRateOverride error:", err);
    return { error: "Failed to set rate override." };
  }
}

export async function removeSessionRateOverride(
  sessionId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("sessions")
      .update({
        pay_rate_override: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) return { error: error.message };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "pay_rate_override_removed",
      entity_type: "session",
      entity_id: sessionId,
    });

    revalidatePath("/ops");
    revalidatePath("/admin");
    return { error: null };
  } catch (err) {
    console.error("removeSessionRateOverride error:", err);
    return { error: "Failed to remove override." };
  }
}

export async function getSessionRateInfo(
  sessionId: string
): Promise<{ data: SessionRateInfo | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: session, error: sessErr } = await supabase
      .from("sessions")
      .select(
        "id, pay_rate_override, pay_rate_resolved, coach_id, duration_minutes, centre_id, date"
      )
      .eq("id", sessionId)
      .single();

    if (sessErr || !session) return { data: null, error: "Session not found." };

    // If no coach assigned, return minimal info
    if (!session.coach_id) {
      return {
        data: {
          rate: session.pay_rate_override ?? session.pay_rate_resolved,
          rate_unit: "per_session",
          tier: session.pay_rate_override ? "override" : null,
          tierLabel: session.pay_rate_override
            ? "Manual override"
            : "No coach assigned",
          amount: null,
          overrideReason: null,
        },
        error: null,
      };
    }

    // Fetch centre type
    const { data: centre } = await supabase
      .from("centres")
      .select("type")
      .eq("id", session.centre_id)
      .single();

    // Fetch coach pay rates + profile
    const [ratesRes, profileRes] = await Promise.all([
      supabase
        .from("pay_rates")
        .select("session_type, rate, rate_unit, effective_from")
        .eq("user_id", session.coach_id),
      supabase
        .from("profiles")
        .select("default_pay_rate")
        .eq("id", session.coach_id)
        .single(),
    ]);

    const resolved = resolvePayRate(
      {
        pay_rate_override: session.pay_rate_override,
        coach_id: session.coach_id,
        duration_minutes: session.duration_minutes,
        centre_type: (centre?.type as CentreType) ?? "childcare_centre",
      },
      ratesRes.data ?? [],
      profileRes.data ?? null,
      session.date
    );

    if (!resolved) {
      return {
        data: {
          rate: null,
          rate_unit: "per_session",
          tier: null,
          tierLabel: "No rate configured",
          amount: null,
          overrideReason: null,
        },
        error: null,
      };
    }

    const pay = calculateSessionPay(resolved, session.duration_minutes);

    // Check if there's an override reason in activity log
    let overrideReason: string | null = null;
    if (resolved.tier === "override") {
      const { data: log } = await supabase
        .from("activity_log")
        .select("metadata")
        .eq("entity_id", sessionId)
        .eq("action", "pay_rate_override_set")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      overrideReason =
        (log?.metadata as unknown as Record<string, unknown>)?.reason as string ?? null;
    }

    return {
      data: {
        rate: resolved.rate,
        rate_unit: resolved.rate_unit,
        tier: resolved.tier,
        tierLabel: resolved.tierLabel,
        amount: pay.amount,
        overrideReason,
      },
      error: null,
    };
  } catch (err) {
    console.error("getSessionRateInfo error:", err);
    return { data: null, error: "Failed to resolve rate." };
  }
}

// ============================================================
// Earnings summary (coach dashboard widget)
// ============================================================

export async function getCoachEarnings(): Promise<{
  data: CoachEarningsSummary | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { start, end } = getFortnightlyPeriod();
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    // Every completed shift the coach was ON this fortnight — lead or
    // second (099) — each priced for THIS coach.
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select(
        `id, date, time, sport, duration_minutes, actual_duration_minutes, pay_rate_override, pay_rate_resolved, centre_id, centres(name, type), ${MEMBERSHIP_JOIN_WITH_ROLE}`
      )
      .eq(MEMBERSHIP_FILTER, user.id)
      .eq("status", "completed")
      .gte("date", startStr)
      .lte("date", endStr)
      .order("date", { ascending: false });

    if (sessErr) return { data: null, error: sessErr.message };

    // Fetch coach's pay rates + profile for resolution
    const [ratesRes, profileRes] = await Promise.all([
      supabase
        .from("pay_rates")
        .select("session_type, rate, rate_unit, effective_from")
        .eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("default_pay_rate")
        .eq("id", user.id)
        .single(),
    ]);

    let totalEarnings = 0;
    let totalMinutes = 0;

    const earningsSessions: EarningsSessionItem[] = (sessions ?? []).map(
      (s: Record<string, unknown>) => {
        const centre = s.centres as { name: string; type: CentreType } | null;
        const duration =
          (s.actual_duration_minutes as number) ??
          (s.duration_minutes as number);
        totalMinutes += duration;

        const pay = priceShiftForCoach(
          {
            isLead: isLeadOf(s),
            coachId: user.id,
            date: s.date as string,
            durationMinutes: duration,
            centreType: centre?.type ?? "childcare_centre",
            payRateOverride: (s.pay_rate_override as number | null) ?? null,
            payRateResolved: (s.pay_rate_resolved as number | null) ?? null,
          },
          (ratesRes.data ?? []) as PayRateRecord[],
          profileRes.data ? { default_pay_rate: profileRes.data.default_pay_rate as number | null } : null
        );
        totalEarnings += pay.amount;

        return {
          id: s.id as string,
          date: s.date as string,
          time: s.time as string,
          sport: s.sport as string,
          centre_name: centre?.name ?? "Unknown",
          duration_minutes: duration,
          pay_rate_resolved: pay.rate,
          rate_unit: pay.rate_unit,
          amount: pay.amount,
        };
      }
    );

    return {
      data: {
        periodStart: startStr,
        periodEnd: endStr,
        sessionCount: earningsSessions.length,
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        sessions: earningsSessions,
      },
      error: null,
    };
  } catch (err) {
    console.error("getCoachEarnings error:", err);
    return { data: null, error: "Failed to fetch earnings." };
  }
}

// ============================================================
// Hours adjustment requests
// ============================================================

export async function requestHoursAdjustment(input: {
  sessionId: string;
  requestedDuration: number;
  reason: string;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify coach owns session and it's completed
    const { data: session } = await supabase
      .from("sessions")
      .select("id, coach_id, status, duration_minutes, date, sport, centre_id")
      .eq("id", input.sessionId)
      .single();

    if (!session) return { error: "Session not found." };
    // How long the shift ran is a fact about the shift: any coach on it
    // can ask ops to correct it.
    if (!(await isCoachOnSession(supabase, input.sessionId, user.id)))
      return { error: "Not your session." };
    if (session.status !== "completed")
      return { error: "Session must be completed." };

    // Get coach name and centre name
    const [profileRes, centreRes] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", user.id).single(),
      supabase
        .from("centres")
        .select("name")
        .eq("id", session.centre_id)
        .single(),
    ]);

    // File the request as a task for ops. Two things stopped every
    // request before: tasks.column_id is NOT NULL with no default, and a
    // coach has no INSERT policy on tasks (it is an ops record) — so the
    // write goes through the admin client after the coach's own checks
    // above, the way every portal write does.
    const admin = createSupabaseAdmin();
    const { data: column } = await admin
      .from("task_columns")
      .select("id")
      .eq("is_final", false)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!column) return { error: "The task board has no open column to file the request in." };
    // tasks has no status column — the board's columns are the status.
    const { error: taskErr } = await admin.from("tasks").insert({
      column_id: column.id,
      source: "system",
      title: `Hours adjustment: ${profileRes.data?.name ?? "Coach"} — ${session.sport} ${session.date}`,
      description: [
        `Coach: ${profileRes.data?.name ?? "Unknown"}`,
        `Session: ${session.sport} at ${centreRes.data?.name ?? "Unknown"} on ${session.date}`,
        `Rostered: ${session.duration_minutes} min`,
        `Requested: ${input.requestedDuration} min`,
        `Reason: ${input.reason}`,
        `Session ID: ${session.id}`,
      ].join("\n"),
      priority: "medium",
      column_order: 0,
      linked_entity_type: "session",
      linked_entity_id: session.id,
      created_by: user.id,
    });

    if (taskErr) return { error: taskErr.message };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "hours_adjustment_requested",
      entity_type: "session",
      entity_id: session.id,
      metadata: {
        rostered_duration: session.duration_minutes,
        requested_duration: input.requestedDuration,
        reason: input.reason,
      },
    });

    revalidatePath("/coach");
    return { error: null };
  } catch (err) {
    console.error("requestHoursAdjustment error:", err);
    return { error: "Failed to submit adjustment request." };
  }
}

/** Move a task to the board's first final column (tasks has no status). */
async function closeTask(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  taskId: string
): Promise<{ error: string | null }> {
  const { data: done } = await supabase
    .from("task_columns")
    .select("id")
    .eq("is_final", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!done) return { error: "The task board has no final column to close the request in." };
  const { error } = await supabase
    .from("tasks")
    .update({ column_id: done.id, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  return { error: error?.message ?? null };
}

export async function approveHoursAdjustment(input: {
  taskId: string;
  sessionId: string;
  approvedDuration: number;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Update session duration
    const { error: sessErr } = await supabase
      .from("sessions")
      .update({
        actual_duration_minutes: input.approvedDuration,
        needs_ops_review: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.sessionId);

    if (sessErr) return { error: sessErr.message };

    // Close the task: move it to the board's final column.
    const { error: taskErr } = await closeTask(supabase, input.taskId);
    if (taskErr) return { error: taskErr };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "hours_adjustment_approved",
      entity_type: "session",
      entity_id: input.sessionId,
      metadata: {
        approved_duration: input.approvedDuration,
        task_id: input.taskId,
      },
    });

    revalidatePath("/ops");
    revalidatePath("/admin");
    return { error: null };
  } catch (err) {
    console.error("approveHoursAdjustment error:", err);
    return { error: "Failed to approve adjustment." };
  }
}

export async function rejectHoursAdjustment(input: {
  taskId: string;
  sessionId: string;
  reason: string;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Mark session as no longer needing review
    await supabase
      .from("sessions")
      .update({
        needs_ops_review: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.sessionId);

    // Close the task: move it to the board's final column.
    const { error: taskErr } = await closeTask(supabase, input.taskId);
    if (taskErr) return { error: taskErr };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "hours_adjustment_rejected",
      entity_type: "session",
      entity_id: input.sessionId,
      metadata: {
        reason: input.reason,
        task_id: input.taskId,
      },
    });

    revalidatePath("/ops");
    revalidatePath("/admin");
    return { error: null };
  } catch (err) {
    console.error("rejectHoursAdjustment error:", err);
    return { error: "Failed to reject adjustment." };
  }
}

// ============================================================
// Completed sessions history (for coach adjustment requests)
// ============================================================

export async function getCoachCompletedSessions(): Promise<{
  data:
    | {
        id: string;
        date: string;
        time: string;
        sport: string;
        centre_name: string;
        duration_minutes: number;
        actual_duration_minutes: number | null;
        needs_ops_review: boolean;
        pay_rate_resolved: number | null;
      }[]
    | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("sessions")
      .select(
        `id, date, time, sport, duration_minutes, actual_duration_minutes, needs_ops_review, pay_rate_override, pay_rate_resolved, centres(name, type), ${MEMBERSHIP_JOIN_WITH_ROLE}`
      )
      .eq(MEMBERSHIP_FILTER, user.id)
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(30);

    if (error) return { data: null, error: error.message };

    // The rate shown is THIS coach's — never the lead's to a second coach.
    const [{ data: myRates }, { data: myProfile }] = await Promise.all([
      supabase.from("pay_rates").select("session_type, rate, rate_unit, effective_from").eq("user_id", user.id),
      supabase.from("profiles").select("default_pay_rate").eq("id", user.id).single(),
    ]);

    const mapped = (data ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      date: s.date as string,
      time: s.time as string,
      sport: s.sport as string,
      centre_name:
        (s.centres as { name: string } | null)?.name ?? "Unknown",
      duration_minutes: s.duration_minutes as number,
      actual_duration_minutes: s.actual_duration_minutes as number | null,
      needs_ops_review: s.needs_ops_review as boolean,
      pay_rate_resolved: priceShiftForCoach(
        {
          isLead: isLeadOf(s),
          coachId: user.id,
          date: s.date as string,
          durationMinutes: (s.actual_duration_minutes as number | null) ?? (s.duration_minutes as number),
          centreType: (s.centres as { type: CentreType } | null)?.type ?? "childcare_centre",
          payRateOverride: (s.pay_rate_override as number | null) ?? null,
          payRateResolved: (s.pay_rate_resolved as number | null) ?? null,
        },
        (myRates ?? []) as PayRateRecord[],
        myProfile ? { default_pay_rate: myProfile.default_pay_rate as number | null } : null
      ).rate,
    }));

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getCoachCompletedSessions error:", err);
    return { data: null, error: "Failed to fetch sessions." };
  }
}
