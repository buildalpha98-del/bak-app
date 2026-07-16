"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionStatus, ComplianceDocType, ComplianceStatus, CentreType } from "@/lib/types/enums";
import type { Centre, Profile } from "@/lib/types/database";
import {
  checkAvailability,
  detectClashes,
  checkComplianceStatus,
  rankReplacements,
  timeToMinutes,
  type CoachAvailabilityResult,
  type ClashResult,
  type ComplianceCheckResult,
  type ReplacementSuggestion,
  type AvailabilityStatus,
} from "@/lib/utils/scheduling";
import type { SessionWithRelations } from "./actions";
import { toLocalIso } from "@/lib/utils/roster";

// ============================================================
// 1. getCoachAvailabilityForSession
// ============================================================

/**
 * For a given session, returns all active coaches with their availability
 * status (available/partial/unavailable) and reasons.
 */
export async function getCoachAvailabilityForSession(
  sessionId: string
): Promise<{
  data: CoachAvailabilityResult[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get session details
    const { data: session, error: sessError } = await supabase
      .from("sessions")
      .select("date, time, duration_minutes, centre_id")
      .eq("id", sessionId)
      .single();

    if (sessError) throw sessError;
    if (!session) return { data: null, error: "Session not found." };

    // Get centre address
    const { data: centre } = await supabase
      .from("centres")
      .select("address")
      .eq("id", session.centre_id)
      .single();

    // Calculate day of week (1=Mon...7=Sun)
    const d = new Date(session.date + "T00:00:00");
    const jsDay = d.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    // Get end time
    const startMin = timeToMinutes(session.time);
    const endMin = startMin + session.duration_minutes;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

    // Get all active coaches
    const { data: coaches, error: coachError } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "coach")
      .eq("status", "active")
      .order("name");

    if (coachError) throw coachError;
    if (!coaches || coaches.length === 0) return { data: [], error: null };

    const coachIds = coaches.map((c) => c.id);

    // Get all availability slots for these coaches
    const { data: allSlots } = await supabase
      .from("availability_slots")
      .select("user_id, day_of_week, start_time, end_time, location_preferences")
      .in("user_id", coachIds);

    // Get existing sessions for these coaches on this date
    const { data: existingSessions } = await supabase
      .from("sessions")
      .select("coach_id, time, duration_minutes, centre_id, centres:centre_id(name)")
      .eq("date", session.date)
      .in("coach_id", coachIds)
      .neq("id", sessionId) // Exclude current session
      .not("status", "eq", "cancelled");

    // Build results
    const results: CoachAvailabilityResult[] = coaches.map((coach) => {
      const coachSlots = (allSlots ?? []).filter(
        (s) => s.user_id === coach.id
      );

      const coachExisting = (existingSessions ?? [])
        .filter((s) => s.coach_id === coach.id)
        .map((s) => ({
          time: s.time,
          duration_minutes: s.duration_minutes,
          centre_name:
            (s.centres as unknown as { name: string } | null)?.name ??
            "Unknown",
        }));

      const result = checkAvailability(
        coachSlots.map((s) => ({
          id: "",
          user_id: s.user_id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          location_preferences: s.location_preferences,
          created_at: "",
        })),
        dayOfWeek,
        session.time.slice(0, 5),
        endTime,
        centre?.address,
        coachExisting
      );

      return {
        coachId: coach.id,
        coachName: coach.name,
        status: result.status,
        reason: result.reason,
        timeMatch: result.status !== "unavailable",
        locationMatch: result.status === "available",
      };
    });

    // Sort: available first, then partial, then unavailable
    const statusOrder: Record<AvailabilityStatus, number> = {
      available: 0,
      partial: 1,
      unavailable: 2,
    };

    results.sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        a.coachName.localeCompare(b.coachName)
    );

    return { data: results, error: null };
  } catch (err) {
    console.error("getCoachAvailabilityForSession error:", err);
    return { data: null, error: "Failed to check coach availability." };
  }
}

// ============================================================
// 2. checkWeekClashes
// ============================================================

/**
 * Scan all sessions for a given week and detect time overlaps,
 * insufficient travel buffer, and compliance gaps.
 */
export async function checkWeekClashes(
  weekStartDate: string // "YYYY-MM-DD" Monday
): Promise<{
  data: ClashResult[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Calculate Friday
    const monday = new Date(weekStartDate + "T00:00:00");
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const weekEndDate = toLocalIso(friday);

    // Get all sessions for the week with joins
    const { data: raw, error: sessError } = await supabase
      .from("sessions")
      .select(
        "*, centres:centre_id(name, type, address, colour), profiles:coach_id(name, phone), terms:term_id(name), programs:program_id(sport, skill_focus), session_coaches(user_id, is_primary, profiles:user_id(name))"
      )
      .gte("date", weekStartDate)
      .lte("date", weekEndDate)
      .not("status", "eq", "cancelled")
      .order("date")
      .order("time");

    if (sessError) throw sessError;

    const sessions: SessionWithRelations[] = (raw ?? []).map((s) => ({
      id: s.id,
      term_id: s.term_id,
      template_id: s.template_id,
      date: s.date,
      time: s.time,
      duration_minutes: s.duration_minutes,
      centre_id: s.centre_id,
      coach_id: s.coach_id,
      sport: s.sport,
      program_id: s.program_id,
      equipment_kit_id: s.equipment_kit_id,
      status: s.status as SessionStatus,
      pay_rate_override: s.pay_rate_override,
      pay_rate_resolved: s.pay_rate_resolved,
      cancellation_reason: s.cancellation_reason,
      actual_duration_minutes: (s as Record<string, unknown>).actual_duration_minutes as number | null ?? null,
      headcount: (s as Record<string, unknown>).headcount as number | null ?? null,
      coach_notes: (s as Record<string, unknown>).coach_notes as string | null ?? null,
      notes: (s as Record<string, unknown>).notes as string | null ?? null,
      needs_ops_review: (s as Record<string, unknown>).needs_ops_review as boolean ?? false,
      is_trial: (s as Record<string, unknown>).is_trial as boolean ?? false,
      started_at: s.started_at,
      completed_at: s.completed_at,
      created_at: s.created_at,
      updated_at: s.updated_at,
      centre_name:
        (s.centres as unknown as { name: string } | null)?.name ?? "Unknown",
      centre_type:
        (s.centres as unknown as { type: CentreType } | null)?.type ??
        "childcare_centre",
      centre_address:
        (s.centres as unknown as { address: string | null } | null)?.address ??
        null,
      centre_colour:
        (s.centres as unknown as { colour: string | null } | null)?.colour ??
        null,
      coach_name:
        (s.profiles as unknown as { name: string } | null)?.name ?? null,
      coach_phone:
        (s.profiles as unknown as { phone: string } | null)?.phone ?? null,
      term_name:
        (s.terms as unknown as { name: string } | null)?.name ?? "Unknown",
      program_title: ((): string | null => {
        const p = s.programs as unknown as { sport?: string; skill_focus?: string } | null;
        if (!p) return null;
        if (p.skill_focus && p.sport) return `${p.sport} · ${p.skill_focus}`;
        return p.skill_focus ?? p.sport ?? null;
      })(),
      assigned_coaches: (() => {
        const rows = (s.session_coaches as unknown as Array<{
          user_id: string;
          is_primary: boolean;
          profiles: { name: string | null } | null;
        }>) ?? [];
        return rows
          .map((sc) => ({
            user_id: sc.user_id,
            name: sc.profiles?.name ?? null,
            is_primary: sc.is_primary,
          }))
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      })(),
    }));

    // Get unique coach IDs
    const coachIds = [
      ...new Set(sessions.filter((s) => s.coach_id).map((s) => s.coach_id!)),
    ];

    if (coachIds.length === 0) {
      return { data: [], error: null };
    }

    // Get compliance docs for assigned coaches
    const { data: complianceDocs } = await supabase
      .from("compliance_docs")
      .select("coach_id:user_id, doc_type, expiry_date, status")
      .in("user_id", coachIds);

    // Get centres with coordinates
    const centreIds = [
      ...new Set(sessions.map((s) => s.centre_id)),
    ];
    const { data: centreData } = await supabase
      .from("centres")
      .select("id, latitude, longitude")
      .in("id", centreIds);

    // Build coach name map
    const coachNames = new Map<string, string>();
    for (const s of sessions) {
      if (s.coach_id && s.coach_name) {
        coachNames.set(s.coach_id, s.coach_name);
      }
    }

    // Map compliance docs to expected format
    const docsForDetection = (complianceDocs ?? []).map((d) => ({
      coach_id: (d as Record<string, unknown>).coach_id as string,
      doc_type: d.doc_type as ComplianceDocType,
      expiry_date: d.expiry_date as string | null,
      status: d.status as ComplianceStatus,
    }));

    const clashes = detectClashes(
      sessions,
      docsForDetection,
      (centreData ?? []) as Pick<Centre, "id" | "latitude" | "longitude">[],
      coachNames
    );

    return { data: clashes, error: null };
  } catch (err) {
    console.error("checkWeekClashes error:", err);
    return { data: null, error: "Failed to check for clashes." };
  }
}

// ============================================================
// 3. getComplianceStatusForCoach
// ============================================================

/**
 * Check a specific coach's compliance document status.
 */
export async function getComplianceStatusForCoach(
  coachId: string
): Promise<{
  data: ComplianceCheckResult | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get coach name
    const { data: coach } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("id", coachId)
      .single();

    if (!coach) return { data: null, error: "Coach not found." };

    // Get compliance docs
    const { data: docs } = await supabase
      .from("compliance_docs")
      .select("doc_type, expiry_date, status")
      .eq("user_id", coachId);

    const result = checkComplianceStatus(
      coach.id,
      coach.name,
      (docs ?? []).map((d) => ({
        doc_type: d.doc_type as ComplianceDocType,
        expiry_date: d.expiry_date,
        status: d.status as ComplianceStatus,
      }))
    );

    return { data: result, error: null };
  } catch (err) {
    console.error("getComplianceStatusForCoach error:", err);
    return { data: null, error: "Failed to check compliance." };
  }
}

// ============================================================
// 4. getReplacementSuggestions
// ============================================================

/**
 * When a coach declines/is removed, suggest ranked replacements.
 */
export async function getReplacementSuggestions(
  sessionId: string
): Promise<{
  data: ReplacementSuggestion[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get session details
    const { data: session, error: sessError } = await supabase
      .from("sessions")
      .select("date, time, duration_minutes, centre_id, sport, coach_id")
      .eq("id", sessionId)
      .single();

    if (sessError) throw sessError;
    if (!session) return { data: null, error: "Session not found." };

    // Get centre details
    const { data: centre } = await supabase
      .from("centres")
      .select("address, latitude, longitude")
      .eq("id", session.centre_id)
      .single();

    // Calculate day/time
    const d = new Date(session.date + "T00:00:00");
    const jsDay = d.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const startMin = timeToMinutes(session.time);
    const endMin = startMin + session.duration_minutes;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

    // Calculate week range for utilisation
    const monday = new Date(d);
    const dayDiff = jsDay === 0 ? -6 : 1 - jsDay;
    monday.setDate(monday.getDate() + dayDiff);
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const weekStart = toLocalIso(monday);
    const weekEnd = toLocalIso(friday);

    // Get all active coaches except the current one
    const { data: coaches } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "coach")
      .eq("status", "active")
      .neq("id", session.coach_id ?? "")
      .order("name");

    if (!coaches || coaches.length === 0) return { data: [], error: null };

    const coachIds = coaches.map((c) => c.id);

    // Get availability slots
    const { data: allSlots } = await supabase
      .from("availability_slots")
      .select("user_id, day_of_week, start_time, end_time, location_preferences")
      .in("user_id", coachIds);

    // Get existing sessions on the same date
    const { data: existingSessions } = await supabase
      .from("sessions")
      .select("coach_id, time, duration_minutes, centre_id, centres:centre_id(name)")
      .eq("date", session.date)
      .in("coach_id", coachIds)
      .not("status", "eq", "cancelled");

    // Get week sessions for utilisation
    const { data: weekSessions } = await supabase
      .from("sessions")
      .select("coach_id, duration_minutes")
      .in("coach_id", coachIds)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .not("status", "eq", "cancelled");

    // Get past sessions for sport experience
    const { data: pastSessions } = await supabase
      .from("sessions")
      .select("coach_id")
      .in("coach_id", coachIds)
      .eq("sport", session.sport)
      .eq("status", "completed")
      .limit(500);

    // Build utilisation map (hours per coach this week)
    const utilisationMap = new Map<string, number>();
    for (const ws of weekSessions ?? []) {
      if (!ws.coach_id) continue;
      const current = utilisationMap.get(ws.coach_id) ?? 0;
      utilisationMap.set(
        ws.coach_id,
        current + ws.duration_minutes / 60
      );
    }

    // Build sport experience set
    const sportExperienceSet = new Set(
      (pastSessions ?? []).map((s) => s.coach_id)
    );

    // Build candidates
    const candidates = coaches.map((coach) => {
      const coachSlots = (allSlots ?? []).filter(
        (s) => s.user_id === coach.id
      );

      const coachExisting = (existingSessions ?? [])
        .filter((s) => s.coach_id === coach.id)
        .map((s) => ({
          time: s.time,
          duration_minutes: s.duration_minutes,
          centre_name:
            (s.centres as unknown as { name: string } | null)?.name ??
            "Unknown",
        }));

      const availability = checkAvailability(
        coachSlots.map((s) => ({
          id: "",
          user_id: s.user_id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          location_preferences: s.location_preferences,
          created_at: "",
        })),
        dayOfWeek,
        session.time.slice(0, 5),
        endTime,
        centre?.address,
        coachExisting
      );

      // Distance score based on location preferences (rough proxy)
      let distanceScore = 0.5; // Default middle score
      if (centre?.address) {
        const addressLower = centre.address.toLowerCase();
        const matchingSlots = coachSlots.filter((s) =>
          s.location_preferences.some((pref: string) =>
            addressLower.includes(pref.toLowerCase())
          )
        );
        if (matchingSlots.length > 0) {
          distanceScore = 1.0;
        }
      }

      return {
        coachId: coach.id,
        coachName: coach.name,
        availability: availability.status,
        distanceScore,
        utilisationHours: utilisationMap.get(coach.id) ?? 0,
        sportExperience: sportExperienceSet.has(coach.id),
      };
    });

    // Filter out unavailable and rank
    const availableCandidates = candidates.filter(
      (c) => c.availability !== "unavailable"
    );

    const ranked = rankReplacements(availableCandidates);

    return { data: ranked.slice(0, 5), error: null };
  } catch (err) {
    console.error("getReplacementSuggestions error:", err);
    return { data: null, error: "Failed to suggest replacements." };
  }
}

// ============================================================
// 5. acknowledgeClash
// ============================================================

/**
 * Log that an ops user acknowledged a clash warning.
 */
export async function acknowledgeClash(
  clashDescription: string,
  sessionIds: string[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("activity_log").insert({
      user_id: user?.id ?? null,
      action: "clash_acknowledged",
      entity_type: "session",
      entity_id: sessionIds[0] ?? null,
      metadata: {
        clash_description: clashDescription,
        session_ids: sessionIds,
        acknowledged_at: new Date().toISOString(),
      },
    });

    return { error: null };
  } catch (err) {
    console.error("acknowledgeClash error:", err);
    return { error: "Failed to log acknowledgement." };
  }
}

// (Removed `getComplianceWarningsForSessions` — superseded by
// `getSessionCertWarningsForWeek` in lib/roster/cert-warnings-actions.ts,
// which keys by session_id and runs the per-session-date hard-guard
// predicate. The old function checked against today's date and keyed by
// coach, which produced wrong verdicts later in the week and is no
// longer used by any caller after the roster-grid migration.)

// ============================================================
// 6. publishDraftSessionsForWeek — admin/ops bulk-publish
// ============================================================
//
// Bulk-flip every `draft` session in the given Mon→Fri week to
// `published`. Backs the toolbar's "Publish week (N drafts)" CTA.
//
// Permission: admin / ops only. Coach attempts are rejected outright
// (matches every other write-side roster action).
//
// We deliberately do NOT touch any column other than `status`. The
// `pending_confirmation_at` column called out in the brief doesn't
// exist on `sessions` (pending_confirmation is only a status enum
// value, set by the existing per-session "Send for Confirmation"
// flow). Each row gets its own activity_log entry so the audit trail
// stays granular — mirrors the centres bulk-status pattern.

export async function publishDraftSessionsForWeek(weekStart: string): Promise<{
  published: number;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Auth: admin / ops only.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { published: 0, error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { published: 0, error: "Not authorised." };
    }

    // Mon→Fri inclusive — matches the rest of the week pulse maths.
    const monday = new Date(weekStart + "T00:00:00");
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const weekEndDate = toLocalIso(friday);

    // Pull only the drafts so the activity log is accurate even if a
    // race between the count query and the update lets a non-draft
    // sneak in. The .eq("status","draft") below double-guards.
    const { data: drafts, error: selErr } = await supabase
      .from("sessions")
      .select("id")
      .gte("date", weekStart)
      .lte("date", weekEndDate)
      .eq("status", "draft");

    if (selErr) throw selErr;
    if (!drafts || drafts.length === 0) {
      return { published: 0, error: null };
    }

    const draftIds = drafts.map((d) => d.id as string);

    const { error: updErr } = await supabase
      .from("sessions")
      .update({ status: "published" })
      .in("id", draftIds)
      .eq("status", "draft");

    if (updErr) throw updErr;

    // One activity log row per session so the per-shift timeline is
    // accurate — best-effort, don't sink the whole call on logging
    // hiccups.
    const logRows = draftIds.map((id) => ({
      user_id: user.id,
      action: "session_published_via_bulk",
      entity_type: "session",
      entity_id: id,
      metadata: { week_start: weekStart },
    }));
    const { error: logErr } = await supabase
      .from("activity_log")
      .insert(logRows);
    if (logErr) {
      console.error("publishDraftSessionsForWeek log error:", logErr);
    }

    revalidatePath("/admin/roster");
    revalidatePath("/ops/roster");
    return { published: draftIds.length, error: null };
  } catch (err) {
    console.error("publishDraftSessionsForWeek error:", err);
    return { published: 0, error: "Failed to publish drafts." };
  }
}

// ============================================================
// 7. confirmSessionsForWeek — admin/ops bulk-confirm
// ============================================================
//
// Bulk-flip every `published` / `pending_confirmation` session in the
// Mon→Fri week that has a coach assigned to `confirmed`, then send ONE
// grouped notification per affected coach (bulk_shifts_confirmed).
// Backs the toolbar's "Confirm week" CTA — before this, Abdul clicked
// through each session individually after reviewing an AI run.
//
// Sessions with no coach are skipped (nothing to confirm), as are
// needs_replacement / cancelled / completed.

export async function confirmSessionsForWeek(weekStart: string): Promise<{
  confirmed: number;
  coachesNotified: number;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { confirmed: 0, coachesNotified: 0, error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { confirmed: 0, coachesNotified: 0, error: "Not authorised." };
    }

    const monday = new Date(weekStart + "T00:00:00Z");
    const friday = new Date(monday);
    friday.setUTCDate(friday.getUTCDate() + 4);
    const weekEndDate = toLocalIso(friday);

    const { data: candidates, error: selErr } = await supabase
      .from("sessions")
      .select("id, date, time, sport, coach_id, session_coaches(user_id)")
      .gte("date", weekStart)
      .lte("date", weekEndDate)
      .in("status", ["published", "pending_confirmation"])
      .not("coach_id", "is", null);

    if (selErr) throw selErr;
    if (!candidates || candidates.length === 0) {
      return { confirmed: 0, coachesNotified: 0, error: null };
    }

    const ids = candidates.map((s) => s.id as string);

    const { error: updErr } = await supabase
      .from("sessions")
      .update({ status: "confirmed" })
      .in("id", ids)
      .in("status", ["published", "pending_confirmation"]);

    if (updErr) throw updErr;

    // Granular audit trail, best-effort.
    const logRows = ids.map((id) => ({
      user_id: user.id,
      action: "session_confirmed_via_bulk",
      entity_type: "session",
      entity_id: id,
      metadata: { week_start: weekStart },
    }));
    const { error: logErr } = await supabase.from("activity_log").insert(logRows);
    if (logErr) console.error("confirmSessionsForWeek log error:", logErr);

    // One grouped notification per coach — every coach on the shift
    // (session_coaches), not just the primary.
    const sessionsByCoach = new Map<string, number>();
    for (const s of candidates) {
      const coachIds = new Set<string>(
        ((s.session_coaches as Array<{ user_id: string }> | null) ?? []).map(
          (sc) => sc.user_id
        )
      );
      if (s.coach_id) coachIds.add(s.coach_id as string);
      for (const cid of coachIds) {
        sessionsByCoach.set(cid, (sessionsByCoach.get(cid) ?? 0) + 1);
      }
    }

    let coachesNotified = 0;
    if (sessionsByCoach.size > 0) {
      const { data: coaches } = await supabase
        .from("profiles")
        .select("id, email, name, role")
        .in("id", [...sessionsByCoach.keys()]);

      const { triggerNotification } = await import("@/lib/notifications/send");
      for (const coach of coaches ?? []) {
        const count = sessionsByCoach.get(coach.id) ?? 0;
        try {
          await triggerNotification(
            {
              type: "bulk_shifts_confirmed",
              title: `${count} shift${count === 1 ? "" : "s"} confirmed`,
              body: `Your shifts for the week of ${weekStart} are confirmed. Check your schedule for details.`,
              entityType: "session",
              entityId: ids[0],
              data: { week_start: weekStart, count },
            },
            [
              {
                userId: coach.id,
                email: coach.email,
                name: coach.name,
                role: coach.role,
              },
            ]
          );
          coachesNotified++;
        } catch (notifyErr) {
          console.error(
            `confirmSessionsForWeek: notify failed for coach ${coach.id}:`,
            notifyErr
          );
        }
      }
    }

    revalidatePath("/admin/roster");
    revalidatePath("/ops/roster");
    revalidatePath("/coach/schedule");
    return { confirmed: ids.length, coachesNotified, error: null };
  } catch (err) {
    console.error("confirmSessionsForWeek error:", err);
    return { confirmed: 0, coachesNotified: 0, error: "Failed to confirm sessions." };
  }
}
