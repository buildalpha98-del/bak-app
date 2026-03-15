-- ============================================================
-- 033: Parent Portal — auth, profiles, children linking
-- ============================================================

-- 1. Enum additions
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'parent';

CREATE TYPE parent_relationship AS ENUM ('parent', 'guardian', 'carer');

-- 2. parent_profiles table
CREATE TABLE parent_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text NOT NULL,
  phone           text,
  suburb          text,
  marketing_opt_in boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_parent_profiles_user_id ON parent_profiles(user_id);
CREATE INDEX idx_parent_profiles_email ON parent_profiles(email);
CREATE INDEX idx_parent_profiles_suburb ON parent_profiles(suburb);

CREATE TRIGGER parent_profiles_updated_at
  BEFORE UPDATE ON parent_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. parent_children junction table
CREATE TABLE parent_children (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  child_id     uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  relationship parent_relationship NOT NULL DEFAULT 'parent',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_id, child_id)
);

ALTER TABLE parent_children ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_parent_children_parent ON parent_children(parent_id);
CREATE INDEX idx_parent_children_child ON parent_children(child_id);

-- ============================================================
-- 4. RLS Policies
-- ============================================================

-- parent_profiles: parents can read/update own record
CREATE POLICY "Parents can view own profile"
  ON parent_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Parents can update own profile"
  ON parent_profiles FOR UPDATE
  USING (user_id = auth.uid());

-- parent_profiles: admin/ops full access
CREATE POLICY "Admin and ops full access to parent_profiles"
  ON parent_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );

-- parent_profiles: allow insert during registration (user creates own)
CREATE POLICY "Users can create own parent profile"
  ON parent_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- parent_children: parents can manage own links
CREATE POLICY "Parents can view own child links"
  ON parent_children FOR SELECT
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can add child links"
  ON parent_children FOR INSERT
  WITH CHECK (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can remove child links"
  ON parent_children FOR DELETE
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

-- parent_children: admin/ops full access
CREATE POLICY "Admin and ops full access to parent_children"
  ON parent_children FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );

-- children: parents can read their linked children
CREATE POLICY "Parents can view own children"
  ON children FOR SELECT
  USING (id IN (
    SELECT child_id FROM parent_children
    WHERE parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid())
  ));

-- children: parents can update their linked children
CREATE POLICY "Parents can update own children"
  ON children FOR UPDATE
  USING (id IN (
    SELECT child_id FROM parent_children
    WHERE parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid())
  ));

-- children: parents can insert new children (during registration)
CREATE POLICY "Parents can create children"
  ON children FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parent_profiles WHERE user_id = auth.uid()
    )
  );
