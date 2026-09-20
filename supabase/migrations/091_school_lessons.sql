-- ============================================================
-- 091 — School-owned lessons (teachers generate from the portal)
-- ============================================================
-- Until now every programme was authored by Build Alpha Kids staff
-- (programs.created_by → profiles, NOT NULL). A teacher generating an
-- English or Mathematics lesson from the portal has no profile, and the
-- lesson belongs to their school, not the shared library:
--
--   * created_by becomes nullable; created_by_client_user_id records a
--     portal author (exactly one of the two is set, NOT VALID for history)
--   * centre_id scopes a programme to one school's own library
--     (NULL = Build Alpha Kids' shared library, every pre-091 row)
--   * school_class_id tags the class it was written for
--   * clients read their own school's programmes; writes go through the
--     admin client after the portal auth check, as every portal write does

ALTER TABLE programs ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS created_by_client_user_id uuid
    REFERENCES client_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS centre_id uuid
    REFERENCES centres(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS school_class_id uuid
    REFERENCES school_classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_programs_centre ON programs(centre_id);

ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_has_author;
ALTER TABLE programs
  ADD CONSTRAINT programs_has_author
  CHECK (created_by IS NOT NULL OR created_by_client_user_id IS NOT NULL) NOT VALID;

DROP POLICY IF EXISTS client_read_own_school_programs ON programs;
CREATE POLICY client_read_own_school_programs ON programs
  FOR SELECT USING (centre_id IN (SELECT auth_client_centre_ids()));
