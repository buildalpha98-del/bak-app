-- ============================================================
-- Migration 049: centre_onboarding_emails queueing + error tracking
-- ============================================================
--
-- Wave A Item 6 hardens centre onboarding so ops can actually drive a
-- centre through the wizard. Two schema gaps blocked the write path:
--
-- 1. `sent_at` was NOT NULL DEFAULT now(), which meant inserting a row
--    was indistinguishable from "this email has been sent". The cron
--    needs to queue lifecycle emails (welcome, halfway, completion,
--    docs_reminder) and only mark them sent after Resend succeeds.
--
-- 2. There was no place to record a delivery failure, so a failed
--    send could not be distinguished from one that hadn't been
--    attempted, and the cron would keep retrying in a tight loop.
--
-- This migration:
--  - Drops the NOT NULL + DEFAULT on `sent_at` so it acts as a
--    "sent marker" (NULL = queued, NOT NULL = sent).
--  - Adds `error_text` for failure logging. Rows with a non-NULL
--    error_text are skipped by the cron — manual intervention.
--  - Adds a unique index on (checklist_id, email_type) so the
--    lifecycle queue helper is naturally idempotent. The existing
--    cron writes one row per (checklist_id, step_number) where
--    step_number is the auto_email step (3, 4, 9, 10); those
--    email_type values are derived from step_name and are distinct
--    per checklist, so the unique constraint does not break them.

BEGIN;

ALTER TABLE centre_onboarding_emails
  ALTER COLUMN sent_at DROP NOT NULL,
  ALTER COLUMN sent_at DROP DEFAULT;

ALTER TABLE centre_onboarding_emails
  ADD COLUMN IF NOT EXISTS error_text text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_emails_unique_per_type
  ON centre_onboarding_emails (checklist_id, email_type);

COMMIT;
