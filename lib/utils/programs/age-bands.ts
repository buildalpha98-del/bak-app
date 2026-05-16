/**
 * Age bands used across program generation, program library, and
 * curriculum reporting. The bands themselves are a product convention
 * (Early Childhood / Junior / Senior) and live here as the single
 * source of truth — the AI prompt, the program form's checkboxes, and
 * the program-view scaffold renderer all consume these constants.
 *
 * 3–5  → Early Childhood
 * 5–8  → Junior
 * 8–12 → Senior
 *
 * Adapted from the P2 spec at:
 * docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
 */

export const AGE_BANDS = ["3-5", "5-8", "8-12"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  "3-5": "3–5 years (Early Childhood)",
  "5-8": "5–8 years (Junior)",
  "8-12": "8–12 years (Senior)",
};

export function isValidAgeBand(value: string): value is AgeBand {
  return (AGE_BANDS as readonly string[]).includes(value);
}

export type AgeBandValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateAgeBands(bands: string[]): AgeBandValidation {
  if (bands.length === 0) {
    return { ok: false, message: "Select at least one age band." };
  }
  const seen = new Set<string>();
  for (const b of bands) {
    if (!isValidAgeBand(b)) {
      return { ok: false, message: `Unknown age band: ${b}` };
    }
    if (seen.has(b)) {
      return { ok: false, message: `Duplicate age band: ${b}` };
    }
    seen.add(b);
  }
  return { ok: true };
}

export function formatAgeBands(bands: AgeBand[]): string {
  if (bands.length === 0) return "No bands selected";
  return bands.map((b) => AGE_BAND_LABELS[b]).join(", ");
}

/**
 * Resolve the effective age bands for a programme row, with a legacy
 * fallback to the denormalised primary band. Use this everywhere the
 * UI needs to display or filter against age — never read
 * `program.age_group` directly in new code.
 *
 * Order of precedence:
 *   1. `age_groups` array if populated (P2+, post-migration 046)
 *   2. `[age_group]` if only the legacy column has a value
 *   3. `[]` if both are empty (shouldn't happen post-migration, but
 *      defensive against partial backfill)
 */
export function getProgramAgeBands(
  program: { age_group: string | null; age_groups?: string[] | null }
): string[] {
  if (program.age_groups && program.age_groups.length > 0) {
    return program.age_groups;
  }
  if (program.age_group) {
    return [program.age_group];
  }
  return [];
}

/**
 * Render a programme's age bands as a UI label, e.g. "3-5, 5-8" — or
 * `null` if the programme has no bands at all (callers can skip the
 * badge entirely).
 */
export function formatProgramAgeBandsShort(
  program: { age_group: string | null; age_groups?: string[] | null }
): string | null {
  const bands = getProgramAgeBands(program);
  if (bands.length === 0) return null;
  return bands.join(", ");
}

/**
 * Human-readable tooltip form for a programme's age bands, mapping
 * each band to its full `AGE_BAND_LABELS` description. Falls back to
 * the raw token if a band string isn't a known `AgeBand` (legacy data,
 * custom future bands).
 */
export function formatProgramAgeBandsTooltip(
  program: { age_group: string | null; age_groups?: string[] | null }
): string | null {
  const bands = getProgramAgeBands(program);
  if (bands.length === 0) return null;
  return bands
    .map((b) => (isValidAgeBand(b) ? AGE_BAND_LABELS[b] : b))
    .join(", ");
}
