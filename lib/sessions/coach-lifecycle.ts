import "server-only";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isCoachOnSession } from "@/lib/sessions/coach-membership";
import { sydneyIsoDateTime } from "@/lib/utils/sydney-time";

export interface CompletionMinutes {
  reportedMinutes: number | null;
  payableMinutes: number | null;
  needsReview: boolean;
}

/** A coach can report overtime, but only staff approval may increase paid hours. */
export function completionMinutes(startedAt: string | null, rosteredMinutes: number, now: number): CompletionMinutes {
  if (!startedAt) return { reportedMinutes: null, payableMinutes: null, needsReview: true };
  const elapsed = (now - Date.parse(startedAt)) / 60_000;
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error("Invalid session start time.");
  const rounded = Math.round(elapsed / 15) * 15;
  return { reportedMinutes: rounded, payableMinutes: Math.min(rounded, rosteredMinutes), needsReview: rounded > rosteredMinutes };
}

/**
 * Audit §2.9: the narrow alternative to direct REST writes of session status/time.
 * No caller-supplied pay fields or timestamps. Verify membership with the existing
 * shared helper and compare the row version when writing, so reassignment or an
 * ops correction between the check and write cannot be overwritten.
 */
export async function transitionCoachSession(
  sessionId: string,
  action: "confirm" | "start" | "complete",
  headcount?: number,
): Promise<{ error: string | null; completion?: CompletionMinutes; changed?: boolean }> {
  z.uuid().parse(sessionId);
  z.enum(["confirm", "start", "complete"]).parse(action);
  if (headcount !== undefined) z.number().int().min(0).max(1000).parse(headcount);
  const { supabase, user } = await requireRole(["admin", "ops", "coach"]);
  const { data: session, error: readError } = await supabase.from("sessions")
    .select("id, coach_id, status, date, time, duration_minutes, started_at, updated_at")
    .eq("id", sessionId).single();
  if (readError) throw readError;
  if (!session || !await isCoachOnSession(supabase, sessionId, user.id)) return { error: "Not your session." };
  if (action === "confirm" && session.coach_id !== user.id) return { error: "Only the lead coach can confirm." };

  const now = Date.now();
  const scheduled = Date.parse(sydneyIsoDateTime(session.date, session.time));
  if (!Number.isFinite(scheduled)) return { error: "Invalid session time." };
  let patch: Record<string, unknown>;
  let completion: CompletionMinutes | undefined;
  if (action === "confirm") {
    if (session.status !== "pending_confirmation") return { error: "Shift is no longer awaiting confirmation." };
    patch = { status: "confirmed" };
  } else if (action === "start") {
    if (session.status !== "confirmed") return { error: "Session must be confirmed before starting." };
    if (scheduled - now > 30 * 60_000) return { error: "You can start within 30 minutes of the session time." };
    patch = { status: "in_progress", started_at: new Date(now).toISOString() };
  } else {
    if (session.status === "completed") return { error: null, changed: false };
    if (session.status !== "in_progress" && session.status !== "confirmed") return { error: "Session cannot be completed in its current state." };
    // The legacy notes flow has no timer: it may close a confirmed shift only
    // after its scheduled end, at rostered pay, and must queue a staff review.
    if (!session.started_at && now < scheduled + session.duration_minutes * 60_000) return { error: "Start the session first, or wait until its scheduled end." };
    completion = completionMinutes(session.started_at, session.duration_minutes, now);
    patch = {
      status: "completed", completed_at: new Date(now).toISOString(),
      actual_duration_minutes: completion.payableMinutes,
      reported_duration_minutes: completion.reportedMinutes,
      needs_ops_review: completion.needsReview,
    };
    if (headcount !== undefined) patch.headcount = headcount;
  }
  const { data: written, error: writeError } = await createSupabaseAdmin().from("sessions")
    .update(patch).eq("id", sessionId).eq("status", session.status)
    .eq("updated_at", session.updated_at).select("id").maybeSingle();
  if (writeError) throw writeError;
  if (!written) return { error: "Session changed. Refresh and try again." };
  return { error: null, completion, changed: true };
}
