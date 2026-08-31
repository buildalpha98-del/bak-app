// Age-band matching between programmes and sessions (roster-to-report
// Seam C). Pure — no IO — so the ranking rule is testable at a fixed
// point: a session's targeted classes give it age bands, a programme
// declares bands via age_groups (P2 multi-age jsonb) with the legacy
// age_group column as fallback, and band-matched programmes outrank
// usage frequency in suggestions.

import { yearGroupToAgeBand } from "@/lib/schools/year-groups";

/** The bands a programme is pitched at. */
export function programBands(p: {
  age_group?: string | null;
  age_groups?: unknown;
}): string[] {
  const multi = Array.isArray(p.age_groups)
    ? (p.age_groups as unknown[]).filter((b): b is string => typeof b === "string")
    : [];
  if (multi.length > 0) return multi;
  return p.age_group ? [p.age_group] : [];
}

/** The bands a school session serves, from its targeted classes' years. */
export function bandsForYearGroups(yearGroups: string[]): string[] {
  return [...new Set(yearGroups.map(yearGroupToAgeBand))];
}

/**
 * 1 when the programme covers at least one of the session's bands,
 * 0 otherwise. With no session bands (childcare, whole-school) or an
 * untagged programme, returns 0 — the sort falls back to usage.
 */
export function bandMatchScore(
  pBands: string[],
  sessionBands: string[]
): number {
  if (sessionBands.length === 0 || pBands.length === 0) return 0;
  return pBands.some((b) => sessionBands.includes(b)) ? 1 : 0;
}
