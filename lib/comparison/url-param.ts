// ============================================================
// compareParamToPeriodKey — server-safe URL parser
// ============================================================
//
// Lives in `lib/comparison/` (NOT in `components/shared/compare-select.tsx`,
// which is `"use client"`) so server components can import it directly
// without crossing the client boundary. Pages call this from their
// async server `Promise<{compare?: string}>` searchParams handler.

import type { PeriodKey } from "./period";

/**
 * Map the URL `?compare=...` value to a `PeriodKey | undefined`.
 * Accepts the raw `searchParams` shape Next gives us (string or
 * string[]) and returns `undefined` for anything we don't recognise
 * so callers can pass it through to the no-compare branch.
 */
export function compareParamToPeriodKey(
  value: string | string[] | undefined | null
): PeriodKey | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "last_week" || v === "last_month" || v === "last_term") {
    return v;
  }
  return undefined;
}
