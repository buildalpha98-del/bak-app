// School year-group helpers (migration 080). A year_group is free text
// entered by admins — "K", "3", or a composite like "5/6" — so parsing
// is defensive throughout.

export const YEAR_GROUP_OPTIONS = ["K", "1", "2", "3", "4", "5", "6"] as const;

/** Childcare rooms store the platform band directly as their group. */
const AGE_BANDS = ["3-5", "5-8", "8-12"] as const;

/**
 * Derive the platform age band from a class's year group so programme
 * generation keeps working unchanged for school children:
 * K–2 → "5-8", 3–6 → "8-12". For composites the OLDER band wins
 * ("2/3" → "8-12") — programmes pitched slightly up beat programmes
 * pitched down. Unparseable input falls back to "8-12" (most school
 * work is primary Years 3–6).
 *
 * Childcare rooms (rooms parity) store a band ("3-5"/"5-8"/"8-12") as
 * their group — those pass through untouched, since "3-5" read as
 * "years 3 and 5" would derive the wrong band entirely.
 */
export function yearGroupToAgeBand(
  yearGroup: string
): "3-5" | "5-8" | "8-12" {
  const trimmed = yearGroup.trim();
  if ((AGE_BANDS as readonly string[]).includes(trimmed)) {
    return trimmed as (typeof AGE_BANDS)[number];
  }
  const tokens = trimmed
    .toUpperCase()
    .split(/[^0-9K]+/)
    .filter(Boolean);
  if (tokens.length === 0) return "8-12";
  const hasSenior = tokens.some((t) => {
    const n = Number(t);
    return Number.isFinite(n) && n >= 3;
  });
  return hasSenior ? "8-12" : "5-8";
}

/**
 * Human label for a group's year value: school years read "Year 3",
 * childcare rooms (which store an age band) read "Ages 3-5".
 */
export function yearGroupLabel(yearGroup: string): string {
  return /^\d+-\d+$/.test(yearGroup.trim())
    ? `Ages ${yearGroup.trim()}`
    : `Year ${yearGroup}`;
}

/** Sort key so K sorts before 1 and composites sort by their youngest year. */
export function yearGroupSortKey(yearGroup: string): number {
  const tokens = yearGroup
    .toUpperCase()
    .split(/[^0-9K]+/)
    .filter(Boolean);
  const values = tokens.map((t) => (t === "K" ? 0 : Number(t))).filter(Number.isFinite);
  return values.length > 0 ? Math.min(...values) : 99;
}
