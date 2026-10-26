// ============================================================
// Who may see money — the one rule
// ============================================================
//
// Rates, booked value, wage costs, payroll, invoicing and projected
// income are for ADMIN accounts only, and only those with the
// `financial_access` flag on (Daniel, Oct 2026). Ops and every role
// below never see them, even if the flag was switched on for them
// earlier — the flag alone used to be the whole rule, which let an ops
// manager be granted it.
//
// Pure and edge-safe (no server-only import) so middleware can use it.
// Every gate reads this; never test `financial_access` on its own.

export function canSeeFinancials(
  profile: { role?: string | null; financial_access?: boolean | null } | null | undefined,
): boolean {
  return !!profile && profile.role === "admin" && profile.financial_access === true;
}
