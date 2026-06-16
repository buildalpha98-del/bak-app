-- ============================================================
-- Migration 050: profiles.financial_access
-- ============================================================
--
-- Per-profile gate for financial-data visibility. Admins default to
-- true; ops/coach/client/parent default to false.
--
-- Routes gated by `requireFinancialAccess()` (server helper at
-- `lib/auth/financial-access.ts`):
--   /admin|ops/invoicing
--   /admin/payroll
--   /admin/analytics
--   /admin/grants
--   /admin/intelligence
--
-- Sidebar / bottom-tabs / command-palette also mirror this via the
-- `financial?: boolean` flag on `NavItem` in
-- `components/shared/navigation/nav-config.ts` — UI hide, server-side
-- redirect is the source of truth.
--
-- Toggle UX: admin → staff detail → "Financial access" switch
-- (deferred to a follow-up — current cohort updates the column
-- directly via SQL).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS financial_access boolean NOT NULL DEFAULT false;

-- Existing admins keep full visibility.
UPDATE profiles SET financial_access = true WHERE role = 'admin';

COMMENT ON COLUMN profiles.financial_access IS
  'Per-profile financial-data visibility gate. Admins default true; ops/coach/client/parent default false. Read by requireFinancialAccess() server helper.';
