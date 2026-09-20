// School year-group helpers (migration 080). A year_group is free text
// entered by admins — "K", "3", or a composite like "5/6" — so parsing
// is defensive throughout. Victorian schools write the first year as
// "F", "P" or "Prep" (migration 095); all of those parse as year 0.

/** Tokenise a year group into year numbers (K/F/P/Prep/Foundation → 0). */
function yearTokens(yearGroup: string): number[] {
  return yearGroup
    .toUpperCase()
    .split(/[^0-9A-Z]+/)
    .filter(Boolean)
    .map((t) => (/^(K|F|P|PREP|FOUNDATION|KINDY|KINDERGARTEN)$/.test(t) ? 0 : Number(t)))
    .filter((n) => Number.isFinite(n));
}

export const YEAR_GROUP_OPTIONS = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

/** Childcare rooms store the platform band directly as their group. */
const AGE_BANDS = ["3-5", "5-8", "8-12", "12-16"] as const;

/**
 * Derive the platform age band from a class's year group so programme
 * generation keeps working unchanged for school children:
 * K–2 → "5-8", 3–6 → "8-12", 7–10 → "12-16". For composites the OLDER band wins
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
): "3-5" | "5-8" | "8-12" | "12-16" {
  const trimmed = yearGroup.trim();
  if ((AGE_BANDS as readonly string[]).includes(trimmed)) {
    return trimmed as (typeof AGE_BANDS)[number];
  }
  const years = yearTokens(trimmed);
  if (years.length === 0) return "8-12";
  if (years.some((n) => n >= 7)) return "12-16";
  return years.some((n) => n >= 3) ? "8-12" : "5-8";
}

/**
 * Human label for a group's year value: school years read "Year 3",
 * childcare rooms (which store an age band) read "Ages 3-5", and a
 * Victorian first year ("F" / "Prep") reads "Prep".
 */
export function yearGroupLabel(yearGroup: string): string {
  const trimmed = yearGroup.trim();
  if (/^\d+-\d+$/.test(trimmed)) return `Ages ${trimmed}`;
  if (/^(F|P|PREP|FOUNDATION)$/i.test(trimmed)) return "Prep";
  return `Year ${yearGroup}`;
}

/** Sort key so K sorts before 1 and composites sort by their youngest year. */
export function yearGroupSortKey(yearGroup: string): number {
  const values = yearTokens(yearGroup);
  return values.length > 0 ? Math.min(...values) : 99;
}

// Canonical year bands — how both NSW and Victoria group school years:
// K/Prep, 1-2, 3-4, 5-6, 7-8, 9-10 (migration 094 added the secondary
// years). The ids are the NSW stage names because that is where the
// platform started; lib/curriculum/frameworks.ts labels them per state
// ("Stage 2" / "Levels 3–4"). Never print an id — print its label.
export const NSW_STAGES = [
  "Early Stage 1",
  "Stage 1",
  "Stage 2",
  "Stage 3",
  "Stage 4",
  "Stage 5",
] as const;
export type NswStage = (typeof NSW_STAGES)[number];

/**
 * Map a class's year group to its NSW stage. Composites take the OLDER
 * year's stage ("2/3" → Stage 2), matching the age-band rule. Childcare
 * rooms store age bands ("3-5") — band-form input returns null so room
 * data never masquerades as a syllabus stage. Unparseable → null.
 */
export function yearGroupToStage(yearGroup: string): NswStage | null {
  const trimmed = yearGroup.trim();
  if (/^\d+-\d+$/.test(trimmed)) return null; // age band, not a school year
  const values = yearTokens(trimmed).filter((n) => n >= 0 && n <= 10);
  if (values.length === 0) return null;
  const oldest = Math.max(...values);
  if (oldest === 0) return "Early Stage 1";
  if (oldest <= 2) return "Stage 1";
  if (oldest <= 4) return "Stage 2";
  if (oldest <= 6) return "Stage 3";
  if (oldest <= 8) return "Stage 4";
  return "Stage 5";
}

// Band *labels* (Stage 2 / Levels 3–4, band ranges for an age band) live
// in lib/curriculum/frameworks.ts — they depend on the school's state.
