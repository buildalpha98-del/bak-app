import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionCoachInput {
  userId: string;
  isPrimary: boolean;
}

export interface SetSessionCoachesParams {
  sessionId: string;
  coaches: SessionCoachInput[];
  /** Acting user id — recorded in `session_coaches.assigned_by`. */
  assignedBy: string;
}

/**
 * Defensive cap on the number of coaches per shift. The product
 * surface tops out around 3 (primary + 2 secondaries); 10 is well
 * above any realistic value while still preventing a runaway jsonb
 * payload if a buggy caller passes a giant array.
 */
export const MAX_SESSION_COACHES = 10;

/**
 * The single write path to `session_coaches`. Every call site that
 * previously wrote `sessions.coach_id` directly funnels through here.
 *
 * Validates the one-primary invariant client-side (DB partial unique
 * index is the backstop), then calls the `set_session_coaches` RPC
 * which performs the delete-not-in / upsert atomically.
 *
 * Empty coach array is allowed and clears the shift; the sync trigger
 * then auto-flips published/pending/confirmed sessions to
 * `needs_replacement` (edge case 4 in spec §9).
 *
 * @see docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md §6 P5
 */
export async function setSessionCoaches({
  sessionId,
  coaches,
  assignedBy,
}: SetSessionCoachesParams): Promise<{ error: string | null }> {
  // Pre-flight client-side validation — fails fast before round-trip.
  if (coaches.length > MAX_SESSION_COACHES) {
    return {
      error: `session_coaches: too many coaches (got ${coaches.length}, max ${MAX_SESSION_COACHES})`,
    };
  }
  // The empty array is a valid "clear shift" state; only validate the
  // one-primary invariant when there's at least one coach to assign.
  if (coaches.length > 0) {
    const primaries = coaches.filter((c) => c.isPrimary).length;
    if (primaries !== 1) {
      return {
        error: `session_coaches: exactly one primary required (got ${primaries})`,
      };
    }
  }
  const seen = new Set<string>();
  for (const c of coaches) {
    if (seen.has(c.userId)) {
      return { error: `session_coaches: duplicate userId ${c.userId}` };
    }
    seen.add(c.userId);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_session_coaches", {
    p_session_id: sessionId,
    p_coaches: coaches.map((c) => ({
      user_id: c.userId,
      is_primary: c.isPrimary,
    })),
    p_assigned_by: assignedBy,
  });

  if (error) {
    // Supabase errors should always carry `.message`, but fall back
    // defensively so we never return `{ error: undefined }` against
    // the typed `string | null` contract.
    return { error: error.message ?? "set_session_coaches RPC failed" };
  }
  return { error: null };
}
