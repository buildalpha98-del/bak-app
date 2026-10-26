// ============================================================
// Month bookings — every school and centre's sessions for one month
// ============================================================
//
// The roster shows a week and the term board a term; this is the month,
// read the way a centre books us: who has sessions, on which days, which
// sports, how many hours, and what it's worth. Sessions are read by DATE
// window (never term_id), like the term board.
//
// "Booked" = every session that isn't cancelled, drafts included — a
// draft is still a session the centre is expecting; it just hasn't gone
// to a coach yet. Trials are counted but never valued.
//
// Pure: no I/O, date-only arithmetic.

export interface MonthSession {
  id: string;
  centre_id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM[:SS]
  duration_minutes: number;
  sport: string;
  status: string;
  is_trial: boolean;
  coach_name: string | null;
  /** Everyone on the shift (session_coaches); empty = no coach. */
  coach_count: number;
}

export interface MonthCentre {
  id: string;
  name: string;
  type: string; // "school" | "childcare_centre"
  colour: string;
  contract_status: string;
  /** Per-session price; null when not set or not visible to the viewer. */
  agreed_rate: number | null;
}

export interface CentreMonth {
  centre: MonthCentre;
  sessions: MonthSession[];
  booked: number;
  cancelled: number;
  trials: number;
  minutes: number;
  no_coach: number;
  unconfirmed: number;
  confirmed: number;
  /** Mon=1 … Sun=7 weekdays it runs on, in order. */
  weekdays: number[];
  sports: string[];
  /** Distinct start times, "15:00" form. */
  times: string[];
  /** agreed_rate × booked non-trial sessions; null when the rate is unknown. */
  value: number | null;
}

export interface MonthDay {
  date: string;
  /** Booked (non-cancelled) sessions that day, earliest first. */
  sessions: MonthSession[];
  centre_ids: string[];
}

export interface MonthBookings {
  month: string; // YYYY-MM
  first: string;
  last: string;
  /** Calendar grid: Monday-start weeks covering the month; days outside the month are null. */
  weeks: (MonthDay | null)[][];
  rows: CentreMonth[];
  /** Active / trial centres with nothing booked this month. */
  not_booked: MonthCentre[];
  totals: {
    booked: number;
    cancelled: number;
    trials: number;
    minutes: number;
    no_coach: number;
    unconfirmed: number;
    confirmed: number;
    schools: number;
    centres: number;
    value: number;
    /** Booked sessions at centres with no rate — value is understated by these. */
    unpriced: number;
  };
}

const CONFIRMED = new Set(["confirmed", "in_progress", "completed"]);
const UNCONFIRMED = new Set(["published", "pending_confirmation"]);

/** "2026-11" → true. */
export function isMonthKey(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(days).padStart(2, "0")}` };
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mon=1 … Sun=7 for a YYYY-MM-DD. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function hhmm(t: string): string {
  return t.slice(0, 5);
}

function byTime(a: MonthSession, b: MonthSession) {
  return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
}

export function buildMonthBookings(
  month: string,
  centres: MonthCentre[],
  sessions: MonthSession[],
): MonthBookings {
  const { first, last } = monthBounds(month);
  const inMonth = sessions.filter((s) => s.date >= first && s.date <= last).sort(byTime);
  const centreById = new Map(centres.map((c) => [c.id, c]));

  // ---- Per centre
  const byCentre = new Map<string, MonthSession[]>();
  for (const s of inMonth) {
    if (!centreById.has(s.centre_id)) continue;
    const list = byCentre.get(s.centre_id) ?? [];
    list.push(s);
    byCentre.set(s.centre_id, list);
  }

  const rows: CentreMonth[] = [];
  for (const [centreId, list] of byCentre) {
    const centre = centreById.get(centreId)!;
    const live = list.filter((s) => s.status !== "cancelled");
    const billable = live.filter((s) => !s.is_trial).length;
    rows.push({
      centre,
      sessions: list,
      booked: live.length,
      cancelled: list.length - live.length,
      trials: live.filter((s) => s.is_trial).length,
      minutes: live.reduce((n, s) => n + (s.duration_minutes || 0), 0),
      no_coach: live.filter((s) => s.coach_count === 0).length,
      unconfirmed: live.filter((s) => UNCONFIRMED.has(s.status)).length,
      confirmed: live.filter((s) => CONFIRMED.has(s.status)).length,
      weekdays: [...new Set(live.map((s) => isoWeekday(s.date)))].sort((a, b) => a - b),
      sports: [...new Set(live.map((s) => s.sport).filter(Boolean))].sort(),
      times: [...new Set(live.map((s) => hhmm(s.time)))].sort(),
      value: centre.agreed_rate == null ? null : centre.agreed_rate * billable,
    });
  }
  // Busiest first; a centre whose every session was cancelled sinks.
  rows.sort((a, b) => b.booked - a.booked || a.centre.name.localeCompare(b.centre.name));

  const bookedIds = new Set(rows.filter((r) => r.booked > 0).map((r) => r.centre.id));
  const not_booked = centres
    .filter((c) => (c.contract_status === "active" || c.contract_status === "trial") && !bookedIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ---- Calendar: Monday-start weeks covering the month.
  const days = new Map<string, MonthDay>();
  const lastDay = Number(last.slice(8));
  for (let d = 1; d <= lastDay; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    days.set(date, { date, sessions: [], centre_ids: [] });
  }
  for (const s of inMonth) {
    if (s.status === "cancelled" || !centreById.has(s.centre_id)) continue;
    const day = days.get(s.date)!;
    day.sessions.push(s);
    if (!day.centre_ids.includes(s.centre_id)) day.centre_ids.push(s.centre_id);
  }
  const weeks: (MonthDay | null)[][] = [];
  let week: (MonthDay | null)[] = Array(isoWeekday(first) - 1).fill(null);
  for (const day of days.values()) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);

  // ---- Totals
  const live = rows.filter((r) => r.booked > 0);
  const totals = {
    booked: rows.reduce((n, r) => n + r.booked, 0),
    cancelled: rows.reduce((n, r) => n + r.cancelled, 0),
    trials: rows.reduce((n, r) => n + r.trials, 0),
    minutes: rows.reduce((n, r) => n + r.minutes, 0),
    no_coach: rows.reduce((n, r) => n + r.no_coach, 0),
    unconfirmed: rows.reduce((n, r) => n + r.unconfirmed, 0),
    confirmed: rows.reduce((n, r) => n + r.confirmed, 0),
    schools: live.filter((r) => r.centre.type === "school").length,
    centres: live.filter((r) => r.centre.type !== "school").length,
    value: rows.reduce((n, r) => n + (r.value ?? 0), 0),
    unpriced: rows.filter((r) => r.value == null).reduce((n, r) => n + r.booked - r.trials, 0),
  };

  return { month, first, last, weeks, rows, not_booked, totals };
}
