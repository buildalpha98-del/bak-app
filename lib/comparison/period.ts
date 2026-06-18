"use server";

// ============================================================
// Period resolver — turns a `PeriodKey` into concrete date bounds
// ============================================================
//
// Centralises every "this term / last term / this month / last week"
// lookup used by the compare-aware pulses and KPI cards. The shape
// is intentionally tiny — three string fields — so the result can be
// embedded directly in URL params or passed to a server action
// without serialisation gymnastics.
//
// Time-zone handling: we anchor everything to Australia/Sydney so
// the same "this week" boundary lines up with the operations day,
// regardless of where the Vercel function happens to be running
// (Sydney is UTC+10/+11 depending on DST). We compute the bound
// dates in Sydney wall time and then emit them as `YYYY-MM-DD`
// strings — the consumers (Supabase queries on `start_date` /
// `created_at`) all treat those as inclusive day boundaries.

import { createSupabaseServerClient } from "@/lib/supabase/server";

// ----- Types ------------------------------------------------------

export type PeriodKey =
  | "this_term"
  | "last_term"
  | "this_quarter"
  | "last_quarter"
  | "this_month"
  | "last_month"
  | "this_week"
  | "last_week";

export interface PeriodRange {
  key: PeriodKey;
  /** ISO date (YYYY-MM-DD) — inclusive start, Sydney TZ. */
  start: string;
  /** ISO date (YYYY-MM-DD) — inclusive end, Sydney TZ. */
  end: string;
  /** Human-readable label, e.g. "Term 2 2026", "Last month", "This week". */
  label: string;
}

// ----- Sydney TZ helpers (no external deps) -----------------------

/**
 * Return the wall-clock parts of `date` as seen in Australia/Sydney.
 * Uses `Intl.DateTimeFormat` so we honour DST transitions correctly
 * without pulling in `date-fns-tz` or similar — no new deps for this
 * feature, per spec.
 */
function sydneyParts(date: Date): {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 1 = Monday ... 7 = Sunday
} {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? 1,
  };
}

/** Format Y/M/D ints as `YYYY-MM-DD`. Pure — no Date involvement. */
function toIsoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Add `days` to a Y/M/D and roll over month/year boundaries. Pure —
 * uses `Date.UTC` so DST never shifts the count (we apply Sydney TZ
 * only when reading wall-clock parts).
 */
function addDays(
  year: number,
  month: number,
  day: number,
  days: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Last day of a given month/year (handles Feb 29 / leap years). */
function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ----- Resolver ---------------------------------------------------

/**
 * Resolve a `PeriodKey` to a concrete date range. Term-based keys
 * hit the `terms` table; calendar-based keys are computed in pure
 * Sydney wall-clock math. Always returns a range — even when a
 * term lookup fails we fall back to the calendar quarter so callers
 * don't need to handle null.
 */
export async function resolvePeriod(key: PeriodKey): Promise<PeriodRange> {
  const now = sydneyParts(new Date());

  if (key === "this_term" || key === "last_term") {
    return resolveTermPeriod(key, now);
  }

  if (key === "this_quarter" || key === "last_quarter") {
    return resolveQuarterPeriod(key, now);
  }

  if (key === "this_month" || key === "last_month") {
    return resolveMonthPeriod(key, now);
  }

  // this_week / last_week — Monday-anchored ISO week
  return resolveWeekPeriod(key, now);
}

/**
 * Convenience: given the current period the UI is showing, return
 * the matching prior period. Most callers want "this_X → last_X",
 * which is mechanical, but term comparisons require a DB hit so
 * we expose this as a single async entry point.
 */
export async function resolveComparisonPeriod(
  currentKey: PeriodKey
): Promise<PeriodRange> {
  const map: Record<PeriodKey, PeriodKey> = {
    this_term: "last_term",
    last_term: "last_term",
    this_quarter: "last_quarter",
    last_quarter: "last_quarter",
    this_month: "last_month",
    last_month: "last_month",
    this_week: "last_week",
    last_week: "last_week",
  };
  return resolvePeriod(map[currentKey]);
}

// ----- Per-bucket resolvers ---------------------------------------

async function resolveTermPeriod(
  key: "this_term" | "last_term",
  now: ReturnType<typeof sydneyParts>
): Promise<PeriodRange> {
  try {
    const supabase = await createSupabaseServerClient();

    // Pull the most recent active term first; if none, fall back to
    // most-recent term overall so we still have *something* to anchor.
    const { data: activeRows } = await supabase
      .from("terms")
      .select("id, name, start_date, end_date, year, status")
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1);

    let current = activeRows?.[0] as
      | {
          id: string;
          name: string;
          start_date: string;
          end_date: string;
          year: number;
          status: string;
        }
      | undefined;

    if (!current) {
      const { data: fallbackRows } = await supabase
        .from("terms")
        .select("id, name, start_date, end_date, year, status")
        .order("start_date", { ascending: false })
        .limit(1);
      current = fallbackRows?.[0];
    }

    if (key === "this_term" && current) {
      return {
        key,
        start: current.start_date,
        end: current.end_date,
        label: current.name,
      };
    }

    if (key === "last_term" && current) {
      const { data: priorRows } = await supabase
        .from("terms")
        .select("id, name, start_date, end_date")
        .lt("end_date", current.start_date)
        .order("end_date", { ascending: false })
        .limit(1);
      const prior = priorRows?.[0];
      if (prior) {
        return {
          key,
          start: prior.start_date,
          end: prior.end_date,
          label: prior.name,
        };
      }
    }
  } catch {
    // Swallow and fall through to the calendar fallback below.
  }

  // Empty-database fallback: behave like a calendar quarter so the
  // page renders something sensible instead of blowing up.
  return resolveQuarterPeriod(
    key === "last_term" ? "last_quarter" : "this_quarter",
    now
  );
}

function resolveQuarterPeriod(
  key: "this_quarter" | "last_quarter",
  now: ReturnType<typeof sydneyParts>
): PeriodRange {
  // Quarter index 0-3. Sydney calendar — Q1 = Jan-Mar, etc.
  const thisQ = Math.floor((now.month - 1) / 3); // 0..3
  const isLast = key === "last_quarter";
  let q = isLast ? thisQ - 1 : thisQ;
  let year = now.year;
  if (q < 0) {
    q = 3;
    year -= 1;
  }
  const startMonth = q * 3 + 1; // 1, 4, 7, 10
  const endMonth = startMonth + 2;
  const endDay = lastDayOfMonth(year, endMonth);

  return {
    key,
    start: toIsoDate(year, startMonth, 1),
    end: toIsoDate(year, endMonth, endDay),
    label: `${isLast ? "Last" : "This"} quarter (Q${q + 1} ${year})`,
  };
}

function resolveMonthPeriod(
  key: "this_month" | "last_month",
  now: ReturnType<typeof sydneyParts>
): PeriodRange {
  const isLast = key === "last_month";
  let month = isLast ? now.month - 1 : now.month;
  let year = now.year;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  const endDay = lastDayOfMonth(year, month);
  const monthName = new Intl.DateTimeFormat("en-AU", {
    month: "long",
    timeZone: "Australia/Sydney",
  }).format(new Date(Date.UTC(year, month - 1, 15)));

  return {
    key,
    start: toIsoDate(year, month, 1),
    end: toIsoDate(year, month, endDay),
    label: `${monthName} ${year}`,
  };
}

function resolveWeekPeriod(
  key: "this_week" | "last_week",
  now: ReturnType<typeof sydneyParts>
): PeriodRange {
  // Mon-Sun in Sydney TZ. `weekday`: 1=Mon ... 7=Sun.
  const daysSinceMonday = now.weekday - 1;
  // Step back to this Monday.
  const monday = addDays(now.year, now.month, now.day, -daysSinceMonday);
  const isLast = key === "last_week";
  const start = isLast
    ? addDays(monday.year, monday.month, monday.day, -7)
    : monday;
  const end = addDays(start.year, start.month, start.day, 6);

  return {
    key,
    start: toIsoDate(start.year, start.month, start.day),
    end: toIsoDate(end.year, end.month, end.day),
    label: isLast ? "Last week" : "This week",
  };
}
