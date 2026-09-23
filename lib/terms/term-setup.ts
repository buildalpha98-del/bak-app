// ============================================================
// Term setup — roll a term forward from what actually ran
// ============================================================
//
// Ops rostered Term 3 2026 by hand: ~75 sessions across ten centres,
// typed in one at a time, and attached to whichever term row happened
// to be current (most landed on "Term 1 2026"). The weekly pattern is
// real, though — Al Bayan Liverpool every Wednesday and Thursday at
// 11:30, Little Genius Mondays at 13:30 — so the fastest way to a full
// next term is to read that pattern back out of the sessions and offer
// it as templates. Sessions are read by DATE, never by term_id, so a
// mislabelled term cannot hide its pattern.
//
// Pure: no I/O, date-only arithmetic (ISO strings compare as days).

export interface SourceSession {
  centre_id: string;
  centre_name: string;
  date: string;
  /** "HH:MM:SS" */
  time: string;
  duration_minutes: number;
  sport: string;
  status: string;
  coach_id: string | null;
  coach_name: string | null;
  school_class_ids: string[] | null;
}

export interface InferredEntry {
  /** Stable key for the UI: centre|dow|time|sport|duration. */
  key: string;
  centre_id: string;
  centre_name: string;
  /** 1 = Monday … 7 = Sunday. */
  day_of_week: number;
  time: string;
  duration_minutes: number;
  sport: string;
  /** The coach who took it most often, if any. */
  coach_id: string | null;
  coach_name: string | null;
  school_class_ids: string[] | null;
  /** Distinct weeks the slot ran, out of the weeks the source term ran anything. */
  weeks_seen: number;
  weeks_in_term: number;
  /** regular = ran most weeks (ticked by default); occasional = a few times. */
  confidence: "regular" | "occasional";
  /** Things a human should look at before rolling it forward. */
  flags: Array<"odd_time" | "weekend" | "long">;
}

function dayNumber(iso: string): number {
  return Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
}
function isoFromDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}
/** 1 = Monday … 7 = Sunday. */
export function isoDow(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
/** The Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  return isoFromDay(dayNumber(iso) - (isoDow(iso) - 1));
}

function mode<T>(values: T[]): T | null {
  const counts = new Map<string, { v: T; n: number }>();
  for (const v of values) {
    const k = JSON.stringify(v);
    const e = counts.get(k) ?? { v, n: 0 };
    e.n++;
    counts.set(k, e);
  }
  let best: { v: T; n: number } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  return best?.v ?? null;
}

/**
 * The weekly slots a set of sessions describes. Cancelled sessions are
 * ignored. A slot is the same centre, weekday, time, sport and length;
 * the coach is whoever took it most often.
 */
export function inferWeeklyPattern(sessions: SourceSession[]): InferredEntry[] {
  const live = sessions.filter((s) => s.status !== "cancelled");
  const weeksInTerm = new Set(live.map((s) => mondayOf(s.date))).size;
  const groups = new Map<string, SourceSession[]>();
  for (const s of live) {
    const time = s.time.slice(0, 5);
    const key = `${s.centre_id}|${isoDow(s.date)}|${time}|${s.sport}|${s.duration_minutes}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const entries: InferredEntry[] = [];
  for (const [key, rows] of groups) {
    const first = rows[0];
    const dow = isoDow(first.date);
    const time = first.time.slice(0, 5);
    const weeksSeen = new Set(rows.map((r) => mondayOf(r.date))).size;
    const coaches = rows.filter((r) => r.coach_id).map((r) => ({ id: r.coach_id as string, name: r.coach_name }));
    const coach = mode(coaches);
    const classes = mode(rows.map((r) => (r.school_class_ids ?? []).slice().sort()));
    const hour = Number(time.slice(0, 2));
    const flags: InferredEntry["flags"] = [];
    if (hour < 6 || hour >= 19) flags.push("odd_time"); // 02:30 is a 14:30 typed without the 1
    if (dow >= 6) flags.push("weekend");
    if (first.duration_minutes > 240) flags.push("long"); // a whole-day carnival, not a weekly slot
    const regular = weeksSeen >= 2 && weeksSeen >= Math.ceil(weeksInTerm * 0.4);
    entries.push({
      key,
      centre_id: first.centre_id,
      centre_name: first.centre_name,
      day_of_week: dow,
      time,
      duration_minutes: first.duration_minutes,
      sport: first.sport,
      coach_id: coach?.id ?? null,
      coach_name: coach?.name ?? null,
      school_class_ids: classes && classes.length > 0 ? classes : null,
      weeks_seen: weeksSeen,
      weeks_in_term: weeksInTerm,
      confidence: regular ? "regular" : "occasional",
      flags,
    });
  }
  return entries.sort(
    (a, b) => a.centre_name.localeCompare(b.centre_name) || a.day_of_week - b.day_of_week || a.time.localeCompare(b.time)
  );
}

/** Ticked by default: regular, on a weekday, nothing odd about it. */
export function defaultSelected(e: InferredEntry): boolean {
  return e.confidence === "regular" && e.flags.length === 0;
}

// ------------------------------------------------------------
// The generation calendar
// ------------------------------------------------------------

/**
 * NSW public holidays that can fall inside a school term. Extend by year;
 * the setup screen pre-ticks whichever fall in the term and ops can untick.
 * (Australia Day, Christmas and New Year sit in the holidays.)
 */
export const NSW_PUBLIC_HOLIDAYS: Record<string, string> = {
  "2026-04-03": "Good Friday",
  "2026-04-06": "Easter Monday",
  "2026-06-08": "King's Birthday",
  "2026-10-05": "Labour Day",
  "2027-03-26": "Good Friday",
  "2027-03-29": "Easter Monday",
  "2027-06-14": "King's Birthday",
  "2027-10-04": "Labour Day",
};

export function holidaysWithin(startIso: string, endIso: string): Array<{ date: string; name: string }> {
  return Object.entries(NSW_PUBLIC_HOLIDAYS)
    .filter(([d]) => d >= startIso && d <= endIso)
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Every Monday whose week touches the term, first to last. */
export function termWeekMondays(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  for (let d = dayNumber(mondayOf(startIso)); d <= dayNumber(endIso); d += 7) out.push(isoFromDay(d));
  return out;
}

export interface TemplateSlot {
  id: string;
  day_of_week: number;
}

/**
 * The (template, date) pairs a term generates: each template on its
 * weekday of every week, clipped to the term's dates, minus skip dates
 * and minus what already exists. Pure so the count shown before
 * generating is exactly what generating does.
 */
export function plannedSessionDates(
  templates: TemplateSlot[],
  term: { start_date: string; end_date: string },
  skipDates: Iterable<string>,
  existing: Iterable<string> // `${template_id}_${date}`
): Array<{ template_id: string; date: string }> {
  const skip = new Set(skipDates);
  const have = new Set(existing);
  const out: Array<{ template_id: string; date: string }> = [];
  for (const monday of termWeekMondays(term.start_date, term.end_date)) {
    for (const t of templates) {
      const date = isoFromDay(dayNumber(monday) + (t.day_of_week - 1));
      if (date < term.start_date || date > term.end_date) continue;
      if (skip.has(date) || have.has(`${t.id}_${date}`)) continue;
      out.push({ template_id: t.id, date });
    }
  }
  return out;
}
