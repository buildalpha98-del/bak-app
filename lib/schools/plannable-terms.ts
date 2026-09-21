// Which terms a school can plan, and how the picker describes them.
// Pure, date-only (ISO strings compare as days), so the rules are
// testable at a fixed "today".

export interface TermRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

/** How far ahead the picker reaches: this term plus the next three
 *  covers "plan the whole of next year's Term 1" from Term 4. */
const MAX_TERMS = 4;

/**
 * This term and the ones after it, in order. A completed term is never
 * planned; a term whose last day has passed is over whatever its status
 * says (nobody flipped it yet); a draft term is one Build Alpha Kids
 * has opened ahead of time.
 */
/** Not completed, and its last day has not passed. */
export function isPlannableTerm(term: Pick<TermRow, "status" | "end_date">, today: string): boolean {
  return term.status !== "completed" && term.end_date >= today;
}

export function plannableTerms<T extends TermRow>(terms: T[], today: string): T[] {
  return terms
    .filter((t) => isPlannableTerm(t, today))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, MAX_TERMS);
}

/** The term a request names if it is plannable, else the default: the
 *  active term, else the first upcoming one. */
export function pickPlanningTerm<T extends TermRow>(terms: T[], today: string, termId?: string | null): T | null {
  const open = plannableTerms(terms, today);
  return open.find((t) => t.id === termId) ?? open.find((t) => t.status === "active") ?? open[0] ?? null;
}

/** "This term", "Starts in 3 weeks", "Starts 27 Jan" — the chip's second line. */
export function termTiming(term: Pick<TermRow, "start_date" | "end_date">, today: string): string {
  if (term.start_date <= today && term.end_date >= today) return "This term";
  const days = Math.round((Date.parse(`${term.start_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return "Ended";
  if (days < 14) return days === 1 ? "Starts tomorrow" : `Starts in ${days} days`;
  if (days <= 70) return `Starts in ${Math.round(days / 7)} weeks`;
  const d = new Date(`${term.start_date}T00:00:00Z`);
  return `Starts ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
