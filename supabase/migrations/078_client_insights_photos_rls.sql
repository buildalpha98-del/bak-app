-- ============================================================
-- 078 — client portal build-out: insights + session photos
-- ============================================================
--
-- Two tables were generated/populated for other audiences but
-- invisible to the client (director/school) role:
--
--   * child_insights — AI term-end narratives, readable by staff
--     (039 child_insights_staff) and parents (child_insights_parent)
--     but never by the portal role, even though the term-pack email
--     promised them to directors.
--   * session_photos — coach uploads. 042 shipped a "Centre directors
--     read their session photos" policy keyed on
--     centres.primary_contact_email matching a profiles row, which is
--     the pre-client_users model: portal users have no profiles row,
--     so that policy matches nobody real.
--
-- Both get additive SELECT policies scoped through
-- auth_client_centre_ids() (migration 061), the same gate as every
-- other portal table. No existing role behaviour changes.
--
-- (Numbered 078: 076/077 are reserved for the feedback-INSERT and
-- shared-links fixes developed in parallel.)

-- AI child insights: scoped by the insight's centre, falling back to
-- the child's enrolment when the generator left centre_id null.
CREATE POLICY client_read_child_insights ON child_insights
  FOR SELECT USING (
    centre_id IN (SELECT auth_client_centre_ids())
    OR (
      centre_id IS NULL
      AND child_id IN (
        SELECT cc.child_id
        FROM centre_children cc
        WHERE cc.centre_id IN (SELECT auth_client_centre_ids())
      )
    )
  );

-- Session photos: via the session's centre. Draft sessions are already
-- invisible to clients (061), and photo files themselves are served as
-- short-lived signed URLs minted server-side — this policy only governs
-- the metadata rows.
CREATE POLICY client_read_session_photos ON session_photos
  FOR SELECT USING (
    session_id IN (
      SELECT s.id FROM sessions s
      WHERE s.centre_id IN (SELECT auth_client_centre_ids())
    )
  );
