// ============================================================
// Centre colour palette
// ============================================================
//
// A per-centre accent so the roster can be scanned by location, not just
// by sport (session-card already colours its border by sport via
// lib/utils/sport-colours; this is the other axis, chosen with a toggle).
//
// Colour is never the ONLY signal — every session card also shows the
// centre name as text and a status dot, and every centre card shows its
// name — so a colour-blind operator loses nothing. These are picked to
// stay distinguishable and to read as a 3px left-border accent against
// the card background in both light and dark themes.

export const CENTRE_COLOURS = [
  "#E8712A", // orange (brand)
  "#2563EB", // blue
  "#059669", // emerald
  "#7C3AED", // violet
  "#DB2777", // pink
  "#0891B2", // cyan
  "#CA8A04", // gold
  "#DC2626", // red
  "#4F46E5", // indigo
  "#65A30D", // lime
  "#0D9488", // teal
  "#9333EA", // purple
  "#EA580C", // deep orange
  "#0284C7", // sky
  "#BE123C", // rose
  "#15803D", // green
] as const;

/**
 * Deterministic default colour for a centre from its id — stable across
 * renders and requires no stored value. Used to seed the stored colour
 * on creation/backfill, and as the fallback if none is stored.
 */
export function defaultCentreColour(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CENTRE_COLOURS[Math.abs(hash) % CENTRE_COLOURS.length];
}

/**
 * Resolve the colour to render for a centre: the stored value if it's a
 * valid palette-shaped hex, otherwise the deterministic default. Tolerant
 * of a null/blank/legacy value so callers never have to guard.
 */
export function centreColour(centre: {
  id: string;
  colour?: string | null;
}): string {
  const stored = centre.colour?.trim();
  if (stored && /^#[0-9a-fA-F]{6}$/.test(stored)) return stored;
  return defaultCentreColour(centre.id);
}

/** Whether a string is an accepted centre colour (6-digit hex). */
export function isValidCentreColour(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}
