// ============================================================
// Sport colour palette (8 colours cycled by sport name hash)
// Shared between template-entry-card and session-card
// ============================================================

export const SPORT_COLOURS = [
  "#E8712A", // orange (brand)
  "#3B82F6", // blue
  "#10B981", // emerald
  "#8B5CF6", // violet
  "#F59E0B", // amber
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#6366F1", // indigo
];

export function sportColour(sport: string): string {
  let hash = 0;
  for (let i = 0; i < sport.length; i++) {
    hash = sport.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SPORT_COLOURS[Math.abs(hash) % SPORT_COLOURS.length];
}
