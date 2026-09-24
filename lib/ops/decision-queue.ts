// ============================================================
// "Needs your decision" — pure shapes and parsing
// ============================================================
//
// Three coach- or centre-originated asks had no staff screen at all:
// an hours adjustment (stored as a `tasks` row the coach's request
// writes; approve/reject actions existed with no caller), a session the
// app flagged for review (ran long, or the nightly cron closed it
// because nobody checked out), and a centre's change request (visible
// only inside that one session's roster sheet). This module is the
// shape the queue renders and the parsing of the task form; the I/O is
// in decision-actions.ts.

export interface HoursAdjustmentItem {
  kind: "hours";
  task_id: string;
  session_id: string;
  coach_name: string;
  centre_name: string;
  sport: string;
  date: string;
  rostered_minutes: number;
  requested_minutes: number;
  reason: string;
  since: string;
}

export interface ReviewItem {
  kind: "review";
  session_id: string;
  coach_name: string | null;
  centre_name: string;
  sport: string;
  date: string;
  rostered_minutes: number;
  actual_minutes: number | null;
  headcount: number | null;
  /** Why it was flagged. */
  cause: "ran_long" | "auto_closed";
  since: string;
}

export interface ChangeRequestItem {
  kind: "change";
  request_id: string;
  session_id: string;
  centre_id: string;
  centre_name: string;
  sport: string;
  date: string;
  time: string;
  request_type: "reschedule" | "cancel";
  requested_date: string | null;
  requested_time: string | null;
  reason: string | null;
  requester_name: string | null;
  since: string;
}

export type DecisionItem = HoursAdjustmentItem | ReviewItem | ChangeRequestItem;

export interface DecisionQueue {
  hours: HoursAdjustmentItem[];
  reviews: ReviewItem[];
  changes: ChangeRequestItem[];
  total: number;
}

/**
 * The coach's request is a task whose description is "Key: value" lines
 * (requestHoursAdjustment). Read the numbers back out; null when the
 * task is not one of ours.
 */
export function parseHoursAdjustmentTask(task: {
  id: string;
  title: string;
  description: string | null;
  linked_entity_id: string | null;
  created_at: string;
}): Omit<HoursAdjustmentItem, "kind" | "centre_name" | "sport" | "date"> & { session_id: string } | null {
  if (!task.title.startsWith("Hours adjustment:") || !task.description) return null;
  const field = (name: string) => task.description!.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
  const minutes = (v: string) => Number(v.match(/(\d+)\s*min/)?.[1] ?? NaN);
  const rostered = minutes(field("Rostered"));
  const requested = minutes(field("Requested"));
  const sessionId = task.linked_entity_id ?? field("Session ID");
  if (!Number.isFinite(rostered) || !Number.isFinite(requested) || !sessionId) return null;
  return {
    task_id: task.id,
    session_id: sessionId,
    coach_name: field("Coach") || "Coach",
    rostered_minutes: rostered,
    requested_minutes: requested,
    reason: field("Reason"),
    since: task.created_at,
  };
}

/** A session ran long when the app recorded more time than rostered;
 *  otherwise the nightly cron closed it with nothing recorded. */
export function reviewCause(s: { actual_duration_minutes: number | null; duration_minutes: number }): ReviewItem["cause"] {
  return s.actual_duration_minutes !== null && s.actual_duration_minutes > s.duration_minutes ? "ran_long" : "auto_closed";
}
