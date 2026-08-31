-- ============================================================
-- 081 — clients read their coaches' WWCC + first-aid status
-- ============================================================
--
-- The portal's "Our Coaches" page has always tried to show WWCC and
-- first-aid status — it's the compliance-transparency selling point —
-- but the client role had NO SELECT policy on compliance_docs (and the
-- query also named columns that don't exist, fixed alongside this in
-- lib/client/staff-actions.ts). Directors and schools saw every coach
-- as "not on file".
--
-- Scope is deliberately narrow: ONLY wwcc + first_aid rows (never
-- police checks, insurance or other doc types), and only for coaches
-- who actually have sessions at the caller's centres. Numbers are
-- masked to the last 4 digits in the application layer.

CREATE POLICY client_read_coach_compliance ON compliance_docs
  FOR SELECT USING (
    doc_type IN ('wwcc', 'first_aid')
    AND user_id IN (
      SELECT s.coach_id FROM sessions s
      WHERE s.centre_id IN (SELECT auth_client_centre_ids())
        AND s.coach_id IS NOT NULL
    )
  );
