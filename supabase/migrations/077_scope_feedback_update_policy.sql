-- ============================================================
-- 077 — scope the feedback UPDATE policy to the client's centres
-- ============================================================
--
-- 015's feedback_ratings_public_submit was FOR UPDATE USING (true):
-- written as a "safety net" when all submissions went through the
-- service role, it actually let ANY principal (client, coach, anon)
-- update ANY feedback row so long as the new values had a rating and
-- submitted_at — a client at centre A could overwrite centre B's
-- ratings, and comments could be rewritten arbitrarily, given a row id.
--
-- Every token-based feedback flow (app/api/feedback/submit,
-- lib/feedback/actions.ts createFeedbackRequest / submitPublicFeedback)
-- uses createSupabaseAdmin() — service role, bypasses RLS — so nothing
-- relies on the open policy. The only cookie-client writers are the
-- client portal's submitSessionFeedback (covered below, paired with
-- 076's INSERT policy) and admin/ops bulk-acknowledge/delete (covered
-- by their FOR ALL policies from 006).
--
-- Replacement scopes rows AND new values to the caller's centres via
-- auth_client_centre_ids() (061 pattern), keeping 015's "only actual
-- submissions" check. Row-level only: a client can still write any
-- column on their own centre's rows (e.g. acknowledged_at) — column
-- grants can't tighten that without also breaking admin/ops, who share
-- the authenticated DB role.

DROP POLICY IF EXISTS feedback_ratings_public_submit ON feedback_ratings;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feedback_ratings'
      AND policyname = 'client_update_centre_feedback'
  ) THEN
    CREATE POLICY client_update_centre_feedback ON feedback_ratings
      FOR UPDATE
      USING (centre_id IN (SELECT auth_client_centre_ids()))
      WITH CHECK (
        centre_id IN (SELECT auth_client_centre_ids())
        AND submitted_at IS NOT NULL
        AND rating IS NOT NULL
      );
  END IF;
END $$;
