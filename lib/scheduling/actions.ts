"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { triggerNotification } from "@/lib/notifications/send";
import { sendEmail } from "@/lib/launch/email";
import { rosterAssignment } from "@/lib/launch/email-templates";
import {
  bulkCheckCoachCertsForSessions,
  checkCoachCertsForSession,
} from "@/lib/utils/compliance/check-coach-certs";
import { setSessionCoaches } from "@/lib/sessions/session-coaches";
import type { SchedulingAdjustment } from "@/lib/types/database";

/**
 * Get the latest scheduling run for a week.
 */
export async function getSchedulingRun(weekStart: string, weekEnd: string) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("scheduling_runs")
    .select("*")
    .eq("week_start", weekStart)
    .eq("week_end", weekEnd)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

/**
 * Record an adjustment when ops overrides an AI assignment.
 */
export async function recordAdjustment(
  runId: string,
  sessionId: string,
  originalCoachId: string | null,
  originalScore: number,
  replacementCoachId: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get current run
  const { data: run } = await supabase
    .from("scheduling_runs")
    .select("adjustments_json")
    .eq("id", runId)
    .single();

  if (!run) return { error: "Scheduling run not found" };

  // Cert guard — refuse to write a coach with expired/rejected wwcc or
  // first_aid for the session date. Same gate as the rest of the
  // assignment paths (createSession, updateSession, etc.).
  const { data: sessionForGuard } = await supabase
    .from("sessions")
    .select("date")
    .eq("id", sessionId)
    .single();
  if (sessionForGuard?.date) {
    const certCheck = await checkCoachCertsForSession(
      replacementCoachId,
      sessionForGuard.date,
    );
    if (!certCheck.ok) return { error: certCheck.message };
  }

  const adjustments = (run.adjustments_json || []) as SchedulingAdjustment[];
  adjustments.push({
    session_id: sessionId,
    original_coach_id: originalCoachId,
    original_score: originalScore,
    replacement_coach_id: replacementCoachId,
    adjusted_by: user.id,
    adjusted_at: new Date().toISOString(),
  });

  // Update the run
  await supabase
    .from("scheduling_runs")
    .update({ adjustments_json: adjustments, status: "reviewed" })
    .eq("id", runId);

  // Update the session — funnel through the single write path so the
  // session_coaches mirror and downstream triggers stay consistent.
  const { error: writeErr } = await setSessionCoaches({
    sessionId,
    coaches: [{ userId: replacementCoachId, isPrimary: true }],
    assignedBy: user.id,
  });
  if (writeErr) throw new Error(writeErr);

  // Check for auto-learn: 3+ consistent overrides for same coach-centre
  await checkAutoLearnPreference(user.id, originalCoachId, sessionId);

  // Log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "scheduling_adjustment",
    entity_type: "scheduling_run",
    entity_id: runId,
    metadata: {
      session_id: sessionId,
      original_coach_id: originalCoachId,
      replacement_coach_id: replacementCoachId,
    },
  });

  revalidatePath("/ops/roster");
  revalidatePath("/admin/roster");
  return { data: { adjusted: true } };
}

/**
 * Auto-learn scheduling preferences from repeated overrides.
 */
async function checkAutoLearnPreference(
  userId: string,
  overriddenCoachId: string | null,
  sessionId: string
) {
  if (!overriddenCoachId) return;

  const supabase = await createSupabaseServerClient();

  // Get the session's centre
  const { data: session } = await supabase
    .from("sessions")
    .select("centre_id")
    .eq("id", sessionId)
    .single();

  if (!session) return;

  // Count how many times this coach has been overridden for this centre
  const { data: allRuns } = await supabase
    .from("scheduling_runs")
    .select("adjustments_json")
    .not("adjustments_json", "eq", "[]");

  let overrideCount = 0;
  for (const run of allRuns || []) {
    const adjustments = (run.adjustments_json || []) as SchedulingAdjustment[];
    for (const adj of adjustments) {
      if (adj.original_coach_id === overriddenCoachId) {
        // Check if this adjustment's session was at the same centre
        const { data: adjSession } = await supabase
          .from("sessions")
          .select("centre_id")
          .eq("id", adj.session_id)
          .single();

        if (adjSession?.centre_id === session.centre_id) {
          overrideCount++;
        }
      }
    }
  }

  if (overrideCount >= 3) {
    // Check if preference already exists
    const { data: existing } = await supabase
      .from("scheduling_preferences")
      .select("id")
      .eq("coach_id", overriddenCoachId)
      .eq("centre_id", session.centre_id)
      .single();

    if (!existing) {
      await supabase.from("scheduling_preferences").insert({
        coach_id: overriddenCoachId,
        centre_id: session.centre_id,
        preference_type: "avoid",
        reason: "Auto-learned: consistently overridden by ops",
        learned: true,
        created_by: userId,
      });
    }
  }
}

/**
 * Publish a scheduling run — sets sessions to published and notifies coaches.
 */
export async function publishSchedulingRun(runId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: run } = await supabase
    .from("scheduling_runs")
    .select("id, assignments_json, status")
    .eq("id", runId)
    .single();

  if (!run) return { error: "Run not found" };
  if (run.status === "published") return { error: "Already published" };

  const assignments = run.assignments_json as any[];
  const assignedSessions = assignments.filter((a: any) => a.assigned_coach_id);

  // Cert guard — between generate and publish, a coach's WWCC or
  // first_aid could have expired. Refuse to publish any session whose
  // assigned coach is now invalid for the session date. Skipped
  // sessions stay in `draft` and are reported back to the caller.
  const sessionIds = assignedSessions.map((a: any) => a.session_id);
  let certBlocked: Array<{ sessionId: string; reason: string }> = [];

  if (sessionIds.length > 0) {
    const { data: sessionDates } = await supabase
      .from("sessions")
      .select("id, date")
      .in("id", sessionIds);
    const dateBySession = new Map(
      (sessionDates ?? []).map((s) => [s.id as string, s.date as string]),
    );

    const pairs = assignedSessions
      .map((a: any) => ({
        sessionId: a.session_id as string,
        coachId: a.assigned_coach_id as string,
        sessionDate: dateBySession.get(a.session_id) ?? "",
      }))
      .filter((p) => p.sessionDate);

    const certCheck = await bulkCheckCoachCertsForSessions(pairs);
    certBlocked = certCheck.blocked.map((b) => ({
      sessionId: b.sessionId,
      reason: b.result.message,
    }));

    const validSessionIds = certCheck.valid.map((p) => p.sessionId);

    if (validSessionIds.length > 0) {
      await supabase
        .from("sessions")
        .update({ status: "published" })
        .in("id", validSessionIds)
        .eq("status", "draft");
    }
  }

  // Update run status
  await supabase
    .from("scheduling_runs")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", runId);

  // Notify each assigned coach — but only for sessions that actually
  // got published (skip the cert-blocked ones).
  const blockedSessionIds = new Set(certBlocked.map((b) => b.sessionId));
  const coachSessionMap = new Map<string, string[]>();
  for (const a of assignedSessions) {
    if (blockedSessionIds.has(a.session_id)) continue;
    const list = coachSessionMap.get(a.assigned_coach_id) || [];
    list.push(a.session_id);
    coachSessionMap.set(a.assigned_coach_id, list);
  }

  // Fetch coach details for notifications
  const coachIds = Array.from(coachSessionMap.keys());
  const { data: coachProfiles } = coachIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, email, name, role")
        .in("id", coachIds)
    : { data: [] };

  // Fetch session details for email templates (only the published ones)
  const publishedSessionIds = sessionIds.filter(
    (id: string) => !blockedSessionIds.has(id),
  );
  const { data: sessionDetails } = publishedSessionIds.length > 0
    ? await supabase
        .from("sessions")
        .select("id, sport, session_date, start_time, end_time, centre_id, centres:centre_id(name, address)")
        .in("id", publishedSessionIds)
    : { data: [] };

  const sessionMap = new Map(
    (sessionDetails || []).map((s: any) => [s.id, s])
  );

  for (const [coachId, sessions] of coachSessionMap) {
    const coach = coachProfiles?.find((c) => c.id === coachId);
    if (!coach) continue;

    await triggerNotification(
      {
        type: "roster_published",
        title: "New Shifts Available",
        body: `You have ${sessions.length} new shift${sessions.length > 1 ? "s" : ""} to confirm`,
        entityType: "scheduling_run",
        entityId: runId,
      },
      [{ userId: coach.id, email: coach.email, name: coach.name, role: coach.role }]
    );

    // Send individual roster assignment emails (fire-and-forget)
    if (coach.email) {
      for (const sid of sessions) {
        const s = sessionMap.get(sid) as any;
        if (!s) continue;

        const centreName = s.centres?.name || "TBC";
        const centreAddress = s.centres?.address || "";

        const assignEmail = rosterAssignment({
          coachName: coach.name || "Coach",
          sessionName: s.sport || "Coaching Session",
          centreName,
          date: s.session_date,
          time: `${s.start_time} – ${s.end_time}`,
          address: centreAddress,
        });

        void sendEmail({
          to: coach.email,
          subject: assignEmail.subject,
          html: assignEmail.html,
          recipientId: coach.id,
          emailType: "roster_assignment",
          metadata: { session_id: sid, scheduling_run_id: runId },
        }).catch(console.error);
      }
    }
  }

  // Log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "scheduling_run_published",
    entity_type: "scheduling_run",
    entity_id: runId,
    metadata: { sessions_published: sessionIds.length, coaches_notified: coachSessionMap.size },
  });

  revalidatePath("/ops/roster");
  revalidatePath("/admin/roster");
  revalidatePath("/coach/schedule");

  return {
    data: {
      published: true,
      sessionsCount: sessionIds.length - certBlocked.length,
      coachesNotified: coachSessionMap.size,
      certBlocked,
    },
  };
}

/**
 * Get scheduling run history.
 */
export async function getSchedulingRunHistory(limit = 20) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("scheduling_runs")
    .select("id, term_id, week_start, week_end, input_summary, output_summary, adjustments_json, status, generated_at, published_at, created_by")
    .order("generated_at", { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * Resolve adjustment UUIDs to human-readable names.
 * Returns maps: coachNames (id -> name), sessionLabels (id -> "Centre - Sport").
 */
export async function resolveAdjustmentNames(
  coachIds: string[],
  sessionIds: string[]
): Promise<{
  coachNames: Record<string, string>;
  sessionLabels: Record<string, string>;
}> {
  const supabase = await createSupabaseServerClient();
  const coachNames: Record<string, string> = {};
  const sessionLabels: Record<string, string> = {};

  if (coachIds.length > 0) {
    const uniqueCoachIds = [...new Set(coachIds)];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", uniqueCoachIds);
    for (const p of profiles ?? []) {
      coachNames[p.id] = p.name ?? "Unknown Coach";
    }
  }

  if (sessionIds.length > 0) {
    const uniqueSessionIds = [...new Set(sessionIds)];
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, sport, centres:centre_id(name)")
      .in("id", uniqueSessionIds);
    for (const s of sessions ?? []) {
      const centreName = (s.centres as unknown as { name: string } | null)?.name ?? "Unknown";
      sessionLabels[s.id] = `${centreName} - ${s.sport}`;
    }
  }

  return { coachNames, sessionLabels };
}

/**
 * Get all scheduling preferences.
 */
export async function getSchedulingPreferences() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("scheduling_preferences")
    .select(`
      id, coach_id, centre_id, preference_type, reason, learned, created_by, created_at,
      coach:profiles!scheduling_preferences_coach_id_fkey(name),
      centre:centres!scheduling_preferences_centre_id_fkey(name)
    `)
    .order("created_at", { ascending: false });

  return data || [];
}

/**
 * Create or update a scheduling preference.
 */
export async function upsertSchedulingPreference(
  coachId: string,
  centreId: string,
  preferenceType: "preferred" | "avoid",
  reason?: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("scheduling_preferences")
    .upsert(
      {
        coach_id: coachId,
        centre_id: centreId,
        preference_type: preferenceType,
        reason: reason || null,
        learned: false,
        created_by: user.id,
      },
      { onConflict: "coach_id,centre_id" }
    )
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/settings/scheduling");
  return { data };
}

/**
 * Delete a scheduling preference.
 */
export async function deleteSchedulingPreference(id: string) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("scheduling_preferences")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/settings/scheduling");
  return { data: { deleted: true } };
}
