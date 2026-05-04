/**
 * Per-session start/end variance — was the coach on time?
 *
 * Compares the coach's `started_at` (set by `startSession`) against the
 * scheduled `time`, and the `completed_at` (set by `completeSession`)
 * against the scheduled end (`time + duration_minutes`).
 *
 * Variance bucket drives the visual badge in the weekly roster grid
 * and the session detail sheet:
 *
 *  - **none**      — not started yet (future session, or coach
 *                    forgot / hasn't arrived)
 *  - **active**    — clocked in, not yet completed (live session)
 *  - **on-time**   — started within ±5 minutes of scheduled
 *  - **early**     — started >5 minutes before scheduled (worth
 *                    flagging — sometimes the schedule is wrong)
 *  - **late**      — started 6–29 min after scheduled
 *  - **very-late** — started 30+ min after scheduled
 *
 * `endDeltaMin` is exposed for the tooltip ("ran 15 min over") but
 * does NOT drive the colour — under-time vs over-time have different
 * operational meanings (payroll vs coverage) and shouldn't share a pill.
 *
 * Adapted from amana-eos-dashboard's `timeclock-variance.ts` (PR #62).
 * BAK-APP names: `time`/`duration_minutes` instead of `shiftStart`/
 * `shiftEnd`, and `started_at`/`completed_at` instead of
 * `actualStart`/`actualEnd`. Semantics are identical.
 */

export type VarianceStatus =
  | "none"
  | "active"
  | "on-time"
  | "early"
  | "late"
  | "very-late";

export interface VarianceResult {
  status: VarianceStatus;
  /** Minutes between started_at and scheduled start. Positive = late;
   *  negative = early; null when no started_at. */
  startDeltaMin: number | null;
  /** Minutes between completed_at and scheduled end. Positive = ran
   *  over; negative = finished early; null when no completed_at. */
  endDeltaMin: number | null;
}

export interface VarianceInput {
  /** YYYY-MM-DD. */
  date: string;
  /** "HH:mm" or Postgres "HH:mm:ss". */
  time: string;
  duration_minutes: number;
  /** ISO timestamp of clock-in (sessions.started_at), or null. */
  started_at: string | Date | null;
  /** ISO timestamp of clock-out (sessions.completed_at), or null. */
  completed_at: string | Date | null;
}

function combineDateTime(date: string, time: string): Date {
  // time may be "HH:mm" or "HH:mm:ss" — extract the first two parts.
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function diffMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60_000);
}

export function computeSessionVariance(input: VarianceInput): VarianceResult {
  if (!input.started_at) {
    return { status: "none", startDeltaMin: null, endDeltaMin: null };
  }

  const scheduledStart = combineDateTime(input.date, input.time);
  const scheduledEnd = new Date(
    scheduledStart.getTime() + input.duration_minutes * 60_000,
  );
  const startedAt = new Date(input.started_at);
  const startDeltaMin = diffMinutes(startedAt, scheduledStart);

  const completedAt = input.completed_at ? new Date(input.completed_at) : null;
  const endDeltaMin = completedAt ? diffMinutes(completedAt, scheduledEnd) : null;

  if (!completedAt) {
    return { status: "active", startDeltaMin, endDeltaMin };
  }

  if (startDeltaMin <= -6) return { status: "early", startDeltaMin, endDeltaMin };
  if (startDeltaMin <= 5) return { status: "on-time", startDeltaMin, endDeltaMin };
  if (startDeltaMin <= 29) return { status: "late", startDeltaMin, endDeltaMin };
  return { status: "very-late", startDeltaMin, endDeltaMin };
}

/** Short pill label, e.g. "+0", "+12m", "-3m", "active", "—". */
export function varianceLabel(v: VarianceResult): string {
  if (v.status === "none") return "—";
  if (v.status === "active") return "active";
  const d = v.startDeltaMin ?? 0;
  if (d === 0) return "+0";
  return `${d > 0 ? "+" : ""}${d}m`;
}

/** Long form for tooltips: "Started 12 min late", "Started on time", etc. */
export function varianceDescription(v: VarianceResult): string {
  switch (v.status) {
    case "none":
      return "Not started";
    case "active":
      return v.startDeltaMin == null
        ? "In progress"
        : v.startDeltaMin > 5
          ? `In progress (started ${v.startDeltaMin} min late)`
          : v.startDeltaMin < -5
            ? `In progress (started ${Math.abs(v.startDeltaMin)} min early)`
            : "In progress (started on time)";
    case "on-time":
      return v.startDeltaMin === 0
        ? "Started on time"
        : `Started ${Math.abs(v.startDeltaMin ?? 0)} min ${
            (v.startDeltaMin ?? 0) > 0 ? "late" : "early"
          } (within ±5)`;
    case "early":
      return `Started ${Math.abs(v.startDeltaMin ?? 0)} min early`;
    case "late":
      return `Started ${v.startDeltaMin} min late`;
    case "very-late":
      return `Started ${v.startDeltaMin} min late`;
  }
}
