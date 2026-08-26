-- ============================================================
-- 079 — coach observations shared to the portal, on coach opt-in
-- ============================================================
--
-- child_observations were written by coaches assuming an internal
-- audience. Rather than expose the backlog wholesale to directors and
-- schools, sharing is opt-in per save: the completion sheet gains a
-- "share with the centre" toggle, and only rows written with it on are
-- ever visible in the portal. Everything already written stays
-- internal (DEFAULT false backfills the history as private).

ALTER TABLE child_observations
  ADD COLUMN IF NOT EXISTS visible_to_centre boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN child_observations.visible_to_centre IS
  'Coach opted to share this observation with the centre/school portal. Historical rows default to private.';

-- Portal read: same auth_client_centre_ids() gate as every other
-- portal table (061), plus the explicit opt-in flag.
CREATE POLICY client_read_shared_observations ON child_observations
  FOR SELECT USING (
    visible_to_centre
    AND session_id IN (
      SELECT s.id FROM sessions s
      WHERE s.centre_id IN (SELECT auth_client_centre_ids())
    )
  );
