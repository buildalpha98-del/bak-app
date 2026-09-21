import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// "Is this coach on this shift?" — the one way to ask it
// ============================================================
//
// Since multi-coach shifts (migration 048) `sessions.coach_id` is only
// the LEAD coach — a trigger-maintained cache of the primary row in
// `session_coaches`. Every coach on a shift has a membership row there,
// the lead included (backfilled; the trigger keeps it so). Code that
// means "the coaches working this shift" must ask the join table, or the
// second coach silently has no shift: that is how three real shared
// shifts never appeared in their second coach's app (migration 099).
//
//   * "my shifts" queries: add MEMBERSHIP_JOIN to the select and filter
//     with `.eq(MEMBERSHIP_FILTER, coachId)`. It is an aliased INNER
//     join, so it does not disturb a `session_coaches(...)` embed the
//     same query uses to list everyone on the shift.
//   * action gates: `isCoachOnSession`.
//
// Lead-only by design: confirming or declining the shift and asking for
// a swap — they are about the lead assignment; changing who the second
// coach is stays with ops. Pay and invoicing are also still lead-only:
// a shift stores one resolved rate, the lead's.

export const MEMBERSHIP_JOIN = "membership:session_coaches!inner(user_id)";
export const MEMBERSHIP_FILTER = "membership.user_id";

/** The same join, also telling you whether the coach LEADS the shift —
 *  pay needs it (the lead is paid the shift's rate, a second coach their
 *  own). Read it with `isLeadOf(row)`. */
export const MEMBERSHIP_JOIN_WITH_ROLE = "membership:session_coaches!inner(user_id, is_primary)";

/** Whether the filtered coach leads this row's shift. An inner join on
 *  one user returns one membership row (object or one-element array). */
export function isLeadOf(row: unknown): boolean {
  const m = (row as { membership?: unknown }).membership;
  const first = Array.isArray(m) ? m[0] : m;
  return Boolean((first as { is_primary?: boolean } | undefined)?.is_primary);
}

/** True when the user is any coach on the session, lead or not. */
export async function isCoachOnSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("session_coaches")
    .select("user_id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
