-- ============================================================
-- 103: centres.invoiced_via — which system a client is invoiced through
-- ============================================================
--
-- Who pays is already on the row (pricing_model: centre_funded /
-- per_head = the service pays, parent_funded = families pay). How the
-- money is collected wasn't: some clients are invoiced through Square,
-- some through QuickBooks. Monthly Bookings colour-codes by both.
--
-- Nullable on purpose — "not set yet" is a real state for most rows
-- today, and the UI shows it as such rather than guessing.

ALTER TABLE public.centres
  ADD COLUMN IF NOT EXISTS invoiced_via text
  CHECK (invoiced_via IN ('square', 'quickbooks'));

COMMENT ON COLUMN public.centres.invoiced_via IS
  'Invoicing system for this client: square | quickbooks | null (not set). See lib/centres/billing.ts.';
