"use server";

// ============================================================
// P4 — Drag-and-drop scheduling server action
// ============================================================
//
// `dragMoveSession` is the single endpoint backing every drop on the
// admin/ops roster. It handles three drop shapes:
//
//   1. Date-only       — calendar drop to a different day, same coach.
//   2. Time-only       — calendar drop to a different time slot.
//   3. Coach-only      — staff-view drop to a different coach row.
//
// (Any combination is allowed; the patch carries whichever fields
// changed.)
//
// Three guarantees, all called out in the spec §6 P4 / §10 Decision D:
//
//   * Optimistic concurrency via `expectedUpdatedAt` — server rejects
//     when another writer has touched the row since the drag started.
//   * Cert-guard fan-out — when the date is in the patch, every coach
//     currently in `session_coaches` is re-checked against the new
//     date. Multi-coach (P5) safe.
//   * Conflict drop is **allowed**, not refused — the helper computes
//     a conflict flag so the UI can mark the landed card red. Decision
//     D in the spec: "Allow + mark red".
//
// Coach reassignment is always routed via `setSessionCoaches` — the
// CI guard at `lib/__tests__/no-direct-coach-id-writes.test.ts`
// prevents anything else from writing `sessions.coach_id` directly.
//
// @see docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
//      §5 P4 (UX), §6 P4 (backend), §9 edge cases 1/2/14/16, §10 Decision D

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bulkCheckCoachCertsForSessions,
  type BulkCertPair,
} from "@/lib/utils/compliance/check-coach-certs";
import { setSessionCoaches } from "@/lib/sessions/session-coaches";

// ============================================================
// Types
// ============================================================

export interface DragMoveSessionInput {
  sessionId: string;
  /** YYYY-MM-DD — new date if the drop crossed days. */
  newDate?: string;
  /** "HH:MM" — new time if the drop crossed slots. */
  newTime?: string;
  /**
   * New primary coach if the drop crossed coach rows. `null` clears
   * the shift entirely; `undefined` means "don't touch the coaches".
   */
  newCoachId?: string | null;
  /**
   * ISO timestamp captured from `session.updated_at` at the moment the
   * drag started. The server refuses the write if the row has moved
   * since — covers the two-ops race in spec §9 edge case 2.
   */
  expectedUpdatedAt: string;
}

export interface DragMoveSessionResult {
  ok: boolean;
  /**
   * True when the landed card is on a (date, time, coach) tuple that
   * overlaps another non-cancelled shift. Decision D: drop is still
   * allowed; the UI marks the card red for 8 seconds.
   */
  conflict?: boolean;
  error?: string;
}

// ============================================================
// dragMoveSession
// ============================================================

export async function dragMoveSession(
  input: DragMoveSessionInput,
): Promise<DragMoveSessionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // ---- Auth: admin / ops only -----------------------------------
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { ok: false, error: "Only admin or ops can move sessions." };
    }

    // ---- Snapshot current row -------------------------------------
    // `updated_at` powers the optimistic-concurrency check. `date` and
    // `time` are the fallbacks for whichever field the patch omits.
    const { data: current, error: fetchErr } = await supabase
      .from("sessions")
      .select("id, date, time, updated_at, duration_minutes")
      .eq("id", input.sessionId)
      .single();
    if (fetchErr || !current) {
      return { ok: false, error: "Session not found." };
    }

    // ---- Optimistic concurrency check ----------------------------
    if (current.updated_at !== input.expectedUpdatedAt) {
      return {
        ok: false,
        error: "Session changed since you started — refresh and try again.",
      };
    }

    // Effective date/time after the drop — used for the cert guard
    // fan-out and the conflict probe.
    const effectiveDate = input.newDate ?? (current.date as string);
    const effectiveTime = input.newTime ?? (current.time as string);
    const effectiveDuration = current.duration_minutes as number;

    // ---- Cert-guard fan-out --------------------------------------
    // Spec §6 P4 gap-fix: when `date` is in the patch, the guard runs
    // for every coach currently in `session_coaches`. Post-P5 sessions
    // can have multiple assignees, so we can't lean on the single
    // `coach_id` cache column. We also include `newCoachId` if the
    // patch reassigns the primary, since that coach must also pass.
    const coachIdsToCheck = new Set<string>();
    if (input.newDate) {
      const { data: scRows } = await supabase
        .from("session_coaches")
        .select("user_id")
        .eq("session_id", input.sessionId);
      for (const row of (scRows ?? []) as Array<{ user_id: string }>) {
        coachIdsToCheck.add(row.user_id);
      }
    }
    if (input.newCoachId) {
      // A reassign means the new primary takes over — they need to
      // pass at the effective date too. (The existing roster of
      // secondaries gets cleared when the primary changes; we keep
      // the contract simple: `newCoachId` means "make this the sole
      // primary". Multi-coach edits happen through `assignCoaches`.)
      coachIdsToCheck.clear();
      coachIdsToCheck.add(input.newCoachId);
    }

    if (coachIdsToCheck.size > 0) {
      const pairs: BulkCertPair[] = Array.from(coachIdsToCheck).map(
        (coachId) => ({
          coachId,
          sessionId: input.sessionId,
          sessionDate: effectiveDate,
        }),
      );
      const certResult = await bulkCheckCoachCertsForSessions(pairs);
      if (certResult.blocked.length > 0) {
        const blockedIds = certResult.blocked.map((b) => b.coachId);
        const { data: blockedProfiles } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", blockedIds);
        const nameById = new Map(
          (blockedProfiles ?? []).map((p) => [
            p.id as string,
            (p.name as string | null) ?? null,
          ]),
        );
        const summary = certResult.blocked
          .map(
            (b) => `${nameById.get(b.coachId) ?? b.coachId}: ${b.result.message}`,
          )
          .join("; ");
        return {
          ok: false,
          error: `Cert guard refused move — ${summary}`,
        };
      }
    }

    // ---- Conflict probe ------------------------------------------
    // Decision D: a conflicting drop is allowed; we just flag it so
    // the UI can mark the card red. We check against the *full*
    // assigned-coach set at the effective date/time, excluding the
    // candidate session itself. If `newCoachId` is set we probe just
    // that coach; otherwise the existing roster.
    const conflictCoachIds = new Set<string>();
    if (input.newCoachId) {
      conflictCoachIds.add(input.newCoachId);
    } else {
      const { data: scRows } = await supabase
        .from("session_coaches")
        .select("user_id")
        .eq("session_id", input.sessionId);
      for (const row of (scRows ?? []) as Array<{ user_id: string }>) {
        conflictCoachIds.add(row.user_id);
      }
    }
    const conflict = await probeConflict({
      supabase,
      excludeSessionId: input.sessionId,
      coachIds: Array.from(conflictCoachIds),
      date: effectiveDate,
      time: effectiveTime,
      durationMinutes: effectiveDuration,
    });

    // ---- Apply patch ---------------------------------------------
    // Non-coach fields (date, time) go straight to the row. Coach
    // changes route via `setSessionCoaches` per the CI guard — never
    // touch `sessions.coach_id` directly.
    const rowPatch: Record<string, string> = {};
    if (input.newDate) rowPatch.date = input.newDate;
    if (input.newTime) rowPatch.time = input.newTime;
    if (Object.keys(rowPatch).length > 0) {
      const { error: updateErr } = await supabase
        .from("sessions")
        .update(rowPatch)
        .eq("id", input.sessionId);
      if (updateErr) {
        return { ok: false, error: updateErr.message ?? "Failed to update session." };
      }
    }

    if (input.newCoachId !== undefined) {
      const coaches =
        input.newCoachId === null
          ? []
          : [{ userId: input.newCoachId, isPrimary: true }];
      const writeResult = await setSessionCoaches({
        sessionId: input.sessionId,
        coaches,
        assignedBy: user.id,
      });
      if (writeResult.error) {
        return { ok: false, error: writeResult.error };
      }
    }

    // ---- Activity log --------------------------------------------
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_dnd_moved",
      entity_type: "session",
      entity_id: input.sessionId,
      metadata: {
        new_date: input.newDate ?? null,
        new_time: input.newTime ?? null,
        new_coach_id: input.newCoachId ?? null,
        conflict,
      },
    });

    return conflict ? { ok: true, conflict: true } : { ok: true };
  } catch (err) {
    console.error("dragMoveSession error:", err);
    return { ok: false, error: "Failed to move session." };
  }
}

// ============================================================
// Helpers
// ============================================================

/** Add minutes to "HH:mm" time, returns "HH:mm" */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60);
  const newM = totalMin % 60;
  return `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
}

/**
 * Returns true when at least one of `coachIds` already has a non-
 * cancelled `session_coaches` row whose owning session overlaps
 * (date, time, time+duration) — excluding the candidate session.
 *
 * Reads through `session_coaches` so a coach who is primary on shift
 * X and secondary on shift Y both surface as overlaps.
 */
async function probeConflict(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  excludeSessionId: string;
  coachIds: string[];
  date: string;
  time: string;
  durationMinutes: number;
}): Promise<boolean> {
  const { supabase, excludeSessionId, coachIds, date, time, durationMinutes } =
    params;
  if (coachIds.length === 0) return false;

  const { data: scRows } = await supabase
    .from("session_coaches")
    .select(
      "user_id, sessions:session_id(id, date, time, duration_minutes, status)",
    )
    .in("user_id", coachIds);

  const candTime = time.slice(0, 5);
  const candEnd = addMinutes(candTime, durationMinutes);

  for (const row of (scRows ?? []) as unknown as Array<{
    user_id: string;
    sessions: {
      id: string;
      date: string;
      time: string;
      duration_minutes: number;
      status: string;
    } | null;
  }>) {
    const s = row.sessions;
    if (!s) continue;
    if (s.id === excludeSessionId) continue;
    if (s.status === "cancelled") continue;
    if (s.date !== date) continue;

    const esTime = s.time.slice(0, 5);
    const esEnd = addMinutes(esTime, s.duration_minutes);
    // Half-open overlap: candStart < existingEnd AND candEnd > existingStart
    if (candTime < esEnd && candEnd > esTime) {
      return true;
    }
  }
  return false;
}
