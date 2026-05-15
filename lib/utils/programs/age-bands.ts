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
