-- ============================================================
-- Migration 017: Children records and named attendance
-- Adds: children, centre_children, session_attendances tables
-- ============================================================

-- New enums
CREATE TYPE age_group AS ENUM ('3-5', '5-8', '8-12');
CREATE TYPE gender AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE child_status AS ENUM ('active', 'inactive');
CREATE TYPE enrolment_status AS ENUM ('active', 'withdrawn');

-- ========================
-- children
-- ========================
CREATE TABLE children (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  date_of_birth date,
  age_group   age_group NOT NULL,
  gender      gender,
  medical_notes text,
  parent_name text,
  parent_phone text,
  parent_email text,
  photo_url   text,
  status      child_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER children_updated_at
  BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- centre_children (many-to-many)
-- ========================
CREATE TABLE centre_children (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  centre_id   uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  enrolled_at date NOT NULL DEFAULT CURRENT_DATE,
  status      enrolment_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id, centre_id)
);

-- ========================
-- session_attendances
-- ========================
CREATE TABLE session_attendances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  child_id    uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  present     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, child_id)
);

-- ========================
-- Indexes
-- ========================
CREATE INDEX idx_centre_children_centre ON centre_children(centre_id);
CREATE INDEX idx_centre_children_child ON centre_children(child_id);
CREATE INDEX idx_centre_children_status ON centre_children(centre_id, status);
CREATE INDEX idx_session_attendances_session ON session_attendances(session_id);
CREATE INDEX idx_session_attendances_child ON session_attendances(child_id);
CREATE INDEX idx_children_status ON children(status);
CREATE INDEX idx_children_name ON children(first_name, last_name);

-- ========================
-- RLS
-- ========================
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE centre_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendances ENABLE ROW LEVEL SECURITY;

-- Admin: full access on all three tables
CREATE POLICY "admin_full_children" ON children
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "admin_full_centre_children" ON centre_children
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "admin_full_session_attendances" ON session_attendances
  FOR ALL USING (auth_user_role() = 'admin');

-- Ops: full access on all three tables
CREATE POLICY "ops_full_children" ON children
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "ops_full_centre_children" ON centre_children
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "ops_full_session_attendances" ON session_attendances
  FOR ALL USING (auth_user_role() = 'ops');

-- Coach: read children linked to centres where they have sessions
CREATE POLICY "coach_read_children" ON children
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND id IN (
      SELECT cc.child_id FROM centre_children cc
      WHERE cc.centre_id IN (
        SELECT s.centre_id FROM sessions s WHERE s.coach_id = auth.uid()
      )
    )
  );

-- Coach: can create new children (quick-add during session)
CREATE POLICY "coach_insert_children" ON children
  FOR INSERT WITH CHECK (auth_user_role() = 'coach');

-- Coach: read centre_children for centres they have sessions at
CREATE POLICY "coach_read_centre_children" ON centre_children
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND centre_id IN (
      SELECT s.centre_id FROM sessions s WHERE s.coach_id = auth.uid()
    )
  );

-- Coach: can link children to centres (quick-add flow)
CREATE POLICY "coach_insert_centre_children" ON centre_children
  FOR INSERT WITH CHECK (
    auth_user_role() = 'coach'
    AND centre_id IN (
      SELECT s.centre_id FROM sessions s WHERE s.coach_id = auth.uid()
    )
  );

-- Coach: read/write session_attendances for their own sessions
CREATE POLICY "coach_read_session_attendances" ON session_attendances
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND session_id IN (
      SELECT id FROM sessions WHERE coach_id = auth.uid()
    )
  );

CREATE POLICY "coach_insert_session_attendances" ON session_attendances
  FOR INSERT WITH CHECK (
    auth_user_role() = 'coach'
    AND session_id IN (
      SELECT id FROM sessions WHERE coach_id = auth.uid()
    )
  );

CREATE POLICY "coach_update_session_attendances" ON session_attendances
  FOR UPDATE USING (
    auth_user_role() = 'coach'
    AND session_id IN (
      SELECT id FROM sessions WHERE coach_id = auth.uid()
    )
  );
