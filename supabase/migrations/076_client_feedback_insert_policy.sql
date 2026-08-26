-- ============================================================
-- 076 — client feedback INSERT policy (portal bug)
-- ============================================================
--
-- submitSessionFeedback (lib/client/feedback-actions.ts) INSERTs a
-- first-time rating through the cookie (client-role) Supabase client,
-- but feedback_ratings has no INSERT policy for portal users:
--   006  admin/ops FOR ALL
--   015  feedback_ratings_public_submit — FOR UPDATE only
--   061  client_read_centre_feedback — FOR SELECT only
-- So a director's very first rating on a session dies with 42501,
-- while edits to an existing rating (the UPDATE path via 015) work.
-- Reproduced live 2026-08-26 with a minted client session.
--
-- Scope mirrors 061: centres reachable via auth_client_centre_ids(),
-- and the target session must belong to the centre being rated. The
-- sessions subquery runs under the caller's own RLS (061's
-- client_read_centre_sessions), which also keeps draft sessions
-- unratable. No sessions policy references feedback_ratings, so this
-- cannot recreate 075's policy recursion. The submitted_at/rating
-- check mirrors 015's UPDATE policy: only actual submissions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feedback_ratings'
      AND policyname = 'client_submit_centre_feedback'
  ) THEN
    CREATE POLICY client_submit_centre_feedback ON feedback_ratings
      FOR INSERT
      WITH CHECK (
        centre_id IN (SELECT auth_client_centre_ids())
        AND EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = feedback_ratings.session_id
            AND s.centre_id = feedback_ratings.centre_id
        )
        AND submitted_at IS NOT NULL
        AND rating IS NOT NULL
      );
  END IF;
END $$;
