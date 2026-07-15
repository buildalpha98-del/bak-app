// ============================================================
// Public impact stats — SERVER ONLY
// ============================================================
//
// Reads the pre-calculated public_stats_cache rows (same source as
// app/api/public/stats/route.ts) and shapes the four numbers shown
// in the homepage impact band. Uses the service-role client, so
// never import this from a "use client" component.
//
// Failure posture: a missing or unusable key falls back to that
// stat's em-dash placeholder; a failed fetch throws and the page
// catches it and renders IMPACT_FALLBACK. The band never breaks.

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { ImpactStat } from "@/components/marketing/impact-band";

/**
 * The four band stats, in display order. `plus` marks values that
 * read naturally as "and counting" ("1,200+ kids coached"); sports
 * are an exact roster, so no suffix there.
 */
const BAND_STATS = [
  { key: "total_children", label: "Kids coached", plus: true },
  { key: "centre_count", label: "Centres and schools", plus: true },
  { key: "sport_count", label: "Sports on offer", plus: false },
  { key: "sessions_this_term", label: "Sessions this term", plus: false },
] as const;

/** What the page renders when the stats fetch throws. */
export const IMPACT_FALLBACK: ImpactStat[] = BAND_STATS.map(({ label }) => ({
  label,
  value: "—",
}));

/**
 * Pure formatter for a public_stats_cache stat_value. Handles both
 * jsonb shapes the cron writes (raw number and `{ value: n }`),
 * tolerates numeric strings, and returns null for anything that
 * would look broken on the band (zero, negatives, junk) so callers
 * can fall back to the placeholder.
 *
 * Integer counts only (values are rounded) — do not reuse for
 * average_rating without a decimal-aware variant.
 */
export function formatStatValue(
  raw: unknown,
  opts: { plus?: boolean } = {}
): string | null {
  const unwrapped =
    raw && typeof raw === "object" && "value" in raw
      ? (raw as { value: unknown }).value
      : raw;

  const n =
    typeof unwrapped === "number"
      ? unwrapped
      : typeof unwrapped === "string" && unwrapped.trim() !== ""
        ? Number(unwrapped)
        : Number.NaN;

  if (!Number.isFinite(n) || n <= 0) return null;

  const rounded = Math.round(n);
  return `${rounded.toLocaleString("en-AU")}${opts.plus ? "+" : ""}`;
}

/**
 * Fetches the impact band's four stats. Throws on query failure
 * (callers wrap in try/catch and use IMPACT_FALLBACK); per-key
 * gaps degrade to that stat's em dash instead.
 */
export async function getImpactStats(): Promise<ImpactStat[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("public_stats_cache")
    .select("stat_key, stat_value")
    .in(
      "stat_key",
      BAND_STATS.map((s) => s.key)
    );
  if (error) throw error;

  const byKey = new Map(
    (data ?? []).map((row) => [row.stat_key as string, row.stat_value])
  );

  return BAND_STATS.map(({ key, label, plus }) => ({
    label,
    value: formatStatValue(byKey.get(key), { plus }) ?? "—",
  }));
}
