// ============================================================
// Cached wrappers for /admin home data sources
// ============================================================
//
// `unstable_cache` keeps server-rendered HTML repeat-visit fast by
// memoising the result for `revalidate` seconds across requests. The
// three actions we cache below all use `createSupabaseAdmin()` (no
// cookies), so the cache key doesn't need to be per-user — org-wide
// dashboard metrics are the same for every admin who looks at them.
//
// Tag-based revalidation is wired so write paths (new centre, new
// invoice, etc.) can call `revalidateTag('dashboard')` to bust the
// cache early instead of waiting out the TTL.

import { unstable_cache } from "next/cache";
import {
  getDashboardMetrics,
  getRecentActivity,
  getAdminStatusPulse,
} from "@/lib/launch/dashboard-actions";

// Metric tiles: counts + revenue rollups. 60s is fine — operators
// look at this every few minutes, not every second.
export const getCachedDashboardMetrics = unstable_cache(
  () => getDashboardMetrics(),
  ["admin-dashboard-metrics-v1"],
  { revalidate: 60, tags: ["dashboard"] }
);

// Activity feed: shorter window because new entries matter more.
// Client-side polling at 60s refreshes on top of this anyway.
export const getCachedRecentActivity = unstable_cache(
  (limit: number = 20) => getRecentActivity(limit),
  ["admin-recent-activity-v1"],
  { revalidate: 30, tags: ["dashboard", "activity"] }
);

// Status pulse: 4 counts (shifts needing coach, overdue invoices,
// leads replied today, churn risks). 30s keeps it snappy without
// thrashing the DB.
export const getCachedAdminStatusPulse = unstable_cache(
  () => getAdminStatusPulse(),
  ["admin-status-pulse-v1"],
  { revalidate: 30, tags: ["dashboard", "pulse"] }
);
