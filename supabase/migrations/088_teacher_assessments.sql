-- ============================================================
-- 088 — Teacher-entered assessments
-- ============================================================
-- Until now every skill rating was written by a coach (profiles). Schools
-- want their own teachers to complete the term's assessments in the
-- portal, into the same table, so report cards, the term report, class
-- rollups, Impact and the CSV need no second source.
--
--   * client_users.class_ids — a teacher's class scope (empty = every
--     class at the centre, which is what the principal and colleagues get).
--   * skill_ratings.coach_id becomes nullable; skill_ratings.client_user_id
--     records a portal author instead. Exactly one of the two is set.
--   * auth_client_user_ids() — the caller's client_users ids, SECURITY
--     DEFINER in the same bypass-RLS pattern as auth_client_centre_ids().
--   * client INSERT/UPDATE policies on skill_ratings: the row must be the
--     caller's own (client_user_id), the child enrolled at one of their
--     centres, and the template global or theirs. A coach's row has
--     client_user_id NULL, so a teacher can never rewrite it.
--
-- Class scope is enforced in the application layer, not here: a teacher
-- is school staff and the school already reads every student.

ALTER TABLE client_users
  ADD COLUMN IF NOT EXISTS class_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE skill_ratings
  ALTER COLUMN coach_id DROP NOT NULL;

ALTER TABLE skill_ratings
  ADD COLUMN IF NOT EXISTS client_user_id uuid
    REFERENCES client_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_skill_ratings_client_user
  ON skill_ratings(client_user_id);

-- ON DELETE SET NULL on either author column could leave a row with no
-- author; NOT VALID keeps historical rows out of the check and the
-- application never writes a row without one.
ALTER TABLE skill_ratings
  DROP CONSTRAINT IF EXISTS skill_ratings_has_author;
ALTER TABLE skill_ratings
  ADD CONSTRAINT skill_ratings_has_author
  CHECK (coach_id IS NOT NULL OR client_user_id IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION auth_client_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cu.id FROM client_users cu WHERE cu.user_id = auth.uid()
$$;

DROP POLICY IF EXISTS client_insert_own_skill_ratings ON skill_ratings;
CREATE POLICY client_insert_own_skill_ratings ON skill_ratings
  FOR INSERT
  WITH CHECK (
    client_user_id IN (SELECT auth_client_user_ids())
    AND coach_id IS NULL
    AND child_id IN (
      SELECT cc.child_id FROM centre_children cc
      WHERE cc.centre_id IN (SELECT auth_client_centre_ids())
    )
    AND assessment_template_id IN (
      SELECT t.id FROM assessment_templates t
      WHERE t.centre_id IS NULL
         OR t.centre_id IN (SELECT auth_client_centre_ids())
    )
  );

DROP POLICY IF EXISTS client_update_own_skill_ratings ON skill_ratings;
CREATE POLICY client_update_own_skill_ratings ON skill_ratings
  FOR UPDATE
  USING (client_user_id IN (SELECT auth_client_user_ids()))
  WITH CHECK (
    client_user_id IN (SELECT auth_client_user_ids())
    AND coach_id IS NULL
    AND child_id IN (
      SELECT cc.child_id FROM centre_children cc
      WHERE cc.centre_id IN (SELECT auth_client_centre_ids())
    )
  );
