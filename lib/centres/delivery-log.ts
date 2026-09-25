// ============================================================
// Delivery log — what a centre actually got this term (pure)
// ============================================================
//
// The term report (lib/reports) is the client-facing narrative. Ops need
// the plain record behind it — every session, who coached, what
// programme, which outcomes, how many children — to attach to an invoice
// or take into a renewal. Sessions are read by DATE window (a term_id
// that was set to the wrong term row hides nothing).

export interface DeliveryLogSession {
  id: string;
  date: string;
  time: string;
  status: string;
  sport: string;
  duration_minutes: number;
  actual_duration_minutes: number | null;
  headcount: number | null;
  coach_names: string[];
  programme_title: string | null;
  outcome_codes: string[];
  class_names: string[];
}

export interface DeliveryLog {
  sessions: DeliveryLogSession[];
  totals: {
    delivered: number;
    cancelled: number;
    upcoming: number;
    minutes_delivered: number;
    children_sum: number;
    sports: string[];
    outcome_codes: string[];
    coaches: string[];
  };
}

const DELIVERED = new Set(["completed", "in_progress"]);

export function buildDeliveryLog(sessions: DeliveryLogSession[]): DeliveryLog {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const delivered = sorted.filter((s) => DELIVERED.has(s.status));
  const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();
  return {
    sessions: sorted,
    totals: {
      delivered: delivered.length,
      cancelled: sorted.filter((s) => s.status === "cancelled").length,
      upcoming: sorted.filter((s) => !DELIVERED.has(s.status) && s.status !== "cancelled").length,
      minutes_delivered: delivered.reduce((n, s) => n + (s.actual_duration_minutes ?? s.duration_minutes), 0),
      children_sum: delivered.reduce((n, s) => n + (s.headcount ?? 0), 0),
      sports: uniq(delivered.map((s) => s.sport)),
      outcome_codes: uniq(delivered.flatMap((s) => s.outcome_codes)),
      coaches: uniq(delivered.flatMap((s) => s.coach_names)),
    },
  };
}

function csvCell(v: string | number | null): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The log as a spreadsheet: one row per session, delivered or not. */
export function deliveryLogCsv(log: DeliveryLog): string {
  const header = ["Date", "Time", "Status", "Sport", "Classes", "Coach(es)", "Programme", "Outcomes", "Rostered min", "Actual min", "Children"];
  const rows = log.sessions.map((s) => [
    s.date,
    s.time.slice(0, 5),
    s.status,
    s.sport,
    s.class_names.join("; "),
    s.coach_names.join("; "),
    s.programme_title ?? "",
    s.outcome_codes.join(" "),
    s.duration_minutes,
    s.actual_duration_minutes,
    s.headcount,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
