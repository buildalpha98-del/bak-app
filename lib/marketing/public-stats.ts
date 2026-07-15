// ============================================================
// Public marketing stats — pure helpers
// ============================================================
//
// Used by /api/public/refresh-stats (daily cron) to compute the
// numbers cached in public_stats_cache for the marketing homepage.
// Kept pure so the term-selection logic is unit-testable without a
// database.
//
// These numbers are published on the client's public marketing site.
// Every stat must come from a real record count — never estimate a
// public figure from a proxy (contracted capacity, targets, etc.).
// A stat with no data yet is 0, and the marketing band renders 0 as
// an em-dash by design.

export interface TermRow {
  id: string;
  start_date: string; // "YYYY-MM-DD"
  end_date: string; // "YYYY-MM-DD"
  status: "draft" | "active" | "completed";
}

/**
 * Pick the term to treat as "current" for public stats.
 *
 * Precedence:
 * 1. The admin-flagged active term — matches how the client portal and
 *    admin dashboard resolve "this term", so the marketing site shows
 *    the same number ops sees internally.
 * 2. A term whose start/end window contains Sydney-today (inclusive) —
 *    covers the gap where a new term row exists but nobody flipped its
 *    status yet.
 * 3. The most recently started term that has already begun — a stale
 *    but real term beats writing a hard zero to the marketing site.
 *
 * `todayIso` must be Sydney-today ("YYYY-MM-DD" via sydneyTodayIso) —
 * server-local dates drift around midnight (see lib/utils/sydney-time).
 */
export function pickCurrentTerm(
  terms: TermRow[],
  todayIso: string
): TermRow | null {
  const active = terms.find((t) => t.status === "active");
  if (active) return active;

  const inWindow = terms.find(
    (t) => t.start_date <= todayIso && t.end_date >= todayIso
  );
  if (inWindow) return inWindow;

  const started = terms
    .filter((t) => t.start_date <= todayIso)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return started[0] ?? null;
}
