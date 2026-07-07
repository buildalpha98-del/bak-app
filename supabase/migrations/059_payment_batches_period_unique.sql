-- ============================================================
-- 059 — payment_batches period uniqueness
-- ============================================================
--
-- The Monday payroll cron checks for an existing batch before
-- inserting, but two overlapping invocations (Vercel cold-start
-- retry, manual trigger racing the cron) could both pass the check
-- and insert duplicate batches for the same fortnight. A duplicate
-- batch means coaches get double-calculated draft invoices.
--
-- DB-level uniqueness closes the race for good — the second insert
-- fails loudly instead of silently duplicating.

CREATE UNIQUE INDEX IF NOT EXISTS payment_batches_period_unique
  ON public.payment_batches (period_start, period_end);

COMMENT ON INDEX public.payment_batches_period_unique IS
  'Race guard for the Monday payroll cron — one batch per fortnight, ever.';
