// ============================================================
// Pure route-access helpers (edge-safe, no imports)
// ============================================================
//
// Extracted from middleware.ts so the access rules can be tested
// without standing up a NextRequest. The middleware is the only
// caller; keep this module free of `next/*` imports so it stays cheap
// to run at the edge.

/**
 * Sections gated on `profiles.financial_access`. Every one of these is
 * ALSO guarded server-side by requireFinancialAccess() in its layout —
 * that is the real enforcement. This list exists so the middleware can
 * redirect from the edge before React renders, which is what keeps a
 * denied navigation from tripping React #310 in Next's AppRouter.
 *
 * Keep in sync with the callers of requireFinancialAccess().
 */
export const FINANCIAL_ROUTES = [
  "/admin/invoicing",
  "/admin/payroll",
  "/admin/analytics",
  "/admin/grants",
  "/admin/intelligence",
  "/admin/staff/rate-card",
  "/ops/invoicing",
] as const;

/** Prefix match on a path segment boundary — "/admin/payrollx" is not a match. */
export function isFinancialRoute(pathname: string): boolean {
  return FINANCIAL_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

export type RoleHint = {
  role: string;
  status: string;
  financialAccess: boolean;
};

export const ROLE_HINT_COOKIE = "bak-role";
export const ROLE_HINT_MAX_AGE = 600;

/**
 * Parse the routing hint cookie. Returns null for anything unusable —
 * a different user, a missing field, or a hint written before
 * financial_access was part of the format. Null means "go ask the
 * database", which is always safe; a wrong guess is not.
 */
export function parseRoleHint(
  raw: string | undefined,
  userId: string
): RoleHint | null {
  if (!raw) return null;
  const [uid, role, status, fin] = raw.split(":");
  if (uid !== userId || !role || !status) return null;
  if (fin !== "0" && fin !== "1") return null;
  return { role, status, financialAccess: fin === "1" };
}

export function serializeRoleHint(
  userId: string,
  role: string,
  status: string,
  financialAccess: boolean
): string {
  return `${userId}:${role}:${status}:${financialAccess ? "1" : "0"}`;
}
