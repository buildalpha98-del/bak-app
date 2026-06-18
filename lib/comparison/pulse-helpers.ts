"use server";

// ============================================================
// Pulse-compare helpers
// ============================================================
//
// Shared utilities for the `getXxxStatusPulseWithCompare` family of
// wrappers. Each wrapper resolves the comparison period once and
// then asks "how many rows of type X were created within that
// window?" via a thin `countRowsInWindow` helper. The wrappers
// stay tiny and uniform; the per-pulse semantic decisions
// (which table, which date column, which filter) stay localised
// to the wrapper itself.
//
// We deliberately keep this stateless and side-effect-free so it's
// safe to call from any pulse action without bloating the import
// graph — the comparison-period resolver is the only dependency.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePeriod, type PeriodKey, type PeriodRange } from "./period";

/**
 * Resolve the period and emit the inclusive end-of-day ISO string
 * most consumers want. Centralises the `T23:59:59.999Z` suffix so
 * we don't drift between pulses.
 */
export async function resolveCompareWindow(key: PeriodKey): Promise<{
  period: PeriodRange;
  startIso: string;
  endIso: string;
}> {
  const period = await resolvePeriod(key);
  return {
    period,
    startIso: `${period.start}T00:00:00.000Z`,
    endIso: `${period.end}T23:59:59.999Z`,
  };
}

/**
 * Count rows in `table` whose `dateColumn` falls within `[start, end]`.
 * Optional `filters` apply additional `.eq()` constraints.
 *
 * Defensive: any error returns 0 so a single broken sub-query
 * doesn't blank the whole pulse. Mirrors the per-pulse error
 * handling pattern used everywhere else in this codebase.
 */
export async function countRowsInWindow(opts: {
  table: string;
  dateColumn: string;
  startIso: string;
  endIso: string;
  filters?: Record<string, string | number | boolean | null>;
}): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    let q = supabase
      .from(opts.table)
      .select("id", { count: "exact", head: true })
      .gte(opts.dateColumn, opts.startIso)
      .lte(opts.dateColumn, opts.endIso);

    for (const [key, value] of Object.entries(opts.filters ?? {})) {
      // Each chain step returns a fresh builder — cast through any
      // because the supabase query builder generics narrow per call
      // and the dynamic-keys + dynamic-values usage here is by design.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q = (q as any).eq(key, value);
    }

    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
