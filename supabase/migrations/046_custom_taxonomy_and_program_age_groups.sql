-- ============================================================
-- Migration 046: Custom taxonomy (sports + equipment) and
--   multi-age-group programs
-- ============================================================

-- 1. custom_sports — org-wide; admin/ops can create + delete, coach reads
CREATE TABLE custom_sports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness (functional index — table-constraint
-- form does not accept expressions in Postgres).
CREATE UNIQUE INDEX custom_sports_name_unique
  ON custom_sports (lower(name));

ALTER TABLE custom_sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_sports read for authenticated"
  ON custom_sports FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "custom_sports write for admin/ops"
  ON custom_sports FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- 2. custom_equipment — same shape + same RLS
CREATE TABLE custom_equipment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX custom_equipment_name_unique
  ON custom_equipment (lower(name));

ALTER TABLE custom_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_equipment read for authenticated"
  ON custom_equipment FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "custom_equipment write for admin/ops"
  ON custom_equipment FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- 3. programs.age_groups — multi-age support
-- Keep the existing age_group varchar(50) column for v1 (denormalised
-- "primary band" — drop in a later migration once all readers are
-- migrated to age_groups). Backfill any existing rows.
ALTER TABLE programs
  ADD COLUMN age_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE programs
SET age_groups = jsonb_build_array(age_group)
WHERE age_group IS NOT NULL AND age_groups = '[]'::jsonb;
