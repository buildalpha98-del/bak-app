// ============================================================
// Term coverage board — centre × week, what is and isn't done
// ============================================================
//
// The roster shows one week; the board shows the term. For every active
// centre and every week: how many sessions are rostered, whether they
// have a coach, whether they're confirmed, whether they carry a
// programme. The gap is the point — a centre with no row of sessions,
// a week nobody has confirmed. Sessions are read by DATE window, not
// term_id, so a mislabelled term cannot hide or invent coverage.
//
// Pure: no I/O, date-only arithmetic.

import { mondayOf, termWeekMondays } from "@/lib/terms/term-setup";

export interface CoverageSession {
  centre_id: string;
  date: string;
  status: string;
  coach_id: string | null;
  program_id: string | null;
}

export interface CoverageCentre {
  id: string;
  name: string;
  type: string;
  /** Centres that had a session last term but none this term matter most. */
  had_last_term?: boolean;
}

export type CellState =
  /** No sessions rostered this week. */
  | "none"
  /** At least one session has no coach. */
  | "unassigned"
  /** Coaches on, but at least one session still a draft (unpublished). */
  | "draft"
  /** Published, waiting on a coach to confirm. */
  | "unconfirmed"
  /** Every session confirmed, running or done. */
  | "ready"
  /** Every session cancelled. */
  | "cancelled";

export interface CoverageCell {
  week_start: string;
  total: number;
  unassigned: number;
  draft: number;
  unconfirmed: number;
  ready: number;
  cancelled: number;
  programmed: number;
  state: CellState;
}

export interface CoverageRow {
  centre: CoverageCentre;
  cells: CoverageCell[];
  sessions: number;
  /** A centre that ran last term and has nothing this term. */
  missing: boolean;
}

export interface CoverageBoard {
  weeks: string[];
  rows: CoverageRow[];
  totals: {
    sessions: number;
    unassigned: number;
    draft: number;
    unconfirmed: number;
    ready: number;
    programmed: number;
    /** Every live draft, with or without a coach — what Publish sends. */
    drafts_total: number;
    /** Sessions that are both confirmed (or beyond) and programmed — the one number. */
    readiness_percent: number;
    centres_missing: number;
  };
}

const CONFIRMED = new Set(["confirmed", "in_progress", "completed"]);
const UNCONFIRMED = new Set(["published", "pending_confirmation"]);

function cellState(c: Omit<CoverageCell, "state">): CellState {
  if (c.total === 0) return "none";
  const live = c.total - c.cancelled;
  if (live === 0) return "cancelled";
  if (c.unassigned > 0) return "unassigned";
  if (c.draft > 0) return "draft";
  if (c.unconfirmed > 0) return "unconfirmed";
  return "ready";
}

export function buildCoverageBoard(
  term: { start_date: string; end_date: string },
  centres: CoverageCentre[],
  sessions: CoverageSession[]
): CoverageBoard {
  const weeks = termWeekMondays(term.start_date, term.end_date);
  const inTerm = sessions.filter((s) => s.date >= term.start_date && s.date <= term.end_date);
  const byCentre = new Map<string, CoverageSession[]>();
  for (const s of inTerm) byCentre.set(s.centre_id, [...(byCentre.get(s.centre_id) ?? []), s]);

  const totals = { sessions: 0, unassigned: 0, draft: 0, unconfirmed: 0, ready: 0, programmed: 0, drafts_total: 0, readyAndProgrammed: 0, centres_missing: 0 };

  const rows: CoverageRow[] = centres
    .map((centre) => {
      const mine = byCentre.get(centre.id) ?? [];
      const cells = weeks.map((week_start) => {
        const inWeek = mine.filter((s) => mondayOf(s.date) === week_start);
        const c = {
          week_start,
          total: inWeek.length,
          cancelled: inWeek.filter((s) => s.status === "cancelled").length,
          unassigned: inWeek.filter((s) => s.status !== "cancelled" && !s.coach_id).length,
          draft: inWeek.filter((s) => s.status === "draft" && s.coach_id).length,
          unconfirmed: inWeek.filter((s) => UNCONFIRMED.has(s.status) && s.coach_id).length,
          ready: inWeek.filter((s) => CONFIRMED.has(s.status)).length,
          programmed: inWeek.filter((s) => s.status !== "cancelled" && s.program_id).length,
        };
        totals.readyAndProgrammed += inWeek.filter((s) => CONFIRMED.has(s.status) && s.program_id).length;
        return { ...c, state: cellState(c) };
      });
      const live = mine.filter((s) => s.status !== "cancelled").length;
      totals.sessions += live;
      totals.drafts_total += mine.filter((s) => s.status === "draft").length;
      for (const c of cells) {
        totals.unassigned += c.unassigned;
        totals.draft += c.draft;
        totals.unconfirmed += c.unconfirmed;
        totals.ready += c.ready;
        totals.programmed += c.programmed;
      }
      const missing = live === 0 && Boolean(centre.had_last_term);
      if (missing) totals.centres_missing++;
      return { centre, cells, sessions: live, missing };
    })
    // Gaps first: centres that ran last term and have nothing; then by name.
    .sort((a, b) => Number(b.missing) - Number(a.missing) || a.centre.name.localeCompare(b.centre.name));

  return {
    weeks,
    rows,
    totals: {
      sessions: totals.sessions,
      unassigned: totals.unassigned,
      draft: totals.draft,
      unconfirmed: totals.unconfirmed,
      ready: totals.ready,
      programmed: totals.programmed,
      drafts_total: totals.drafts_total,
      readiness_percent: totals.sessions === 0 ? 0 : Math.round((totals.readyAndProgrammed / totals.sessions) * 100),
      centres_missing: totals.centres_missing,
    },
  };
}
