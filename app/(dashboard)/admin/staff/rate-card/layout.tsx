import { requireFinancialAccess } from "@/lib/auth/financial-access";

/**
 * Rate card exposes per-coach pay rates — financial data by definition.
 * Mirrors the gate already in place on /admin/payroll and /admin/invoicing.
 * Ops users without `financial_access` are redirected to /admin?denied=financial.
 *
 * There is no /ops/staff/rate-card route today, so this is the only
 * page-level gate needed for the rate card. If we ever surface an Ops
 * variant of the page, add a sibling layout that wraps the same guard.
 */
export default async function RateCardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFinancialAccess();
  return <>{children}</>;
}
