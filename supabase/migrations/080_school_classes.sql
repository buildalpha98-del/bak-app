-- ============================================================
-- 080 — school classes & year groups (design: docs/superpowers/
--        specs/2026-08-26-school-classes-design.md)
-- ============================================================
--
-- Schools organise children by class within year groups; the platform
-- organised them by childcare age bands. Classes are labels over
-- existing enrolments — centre_children stays the enrolment source of
-- truth. Additive and optional: childcare centres never see any of
-- this, and a school without class data behaves exactly as before.
--
-- Design decisions locked in here:
--   * Composite classes ("5/6M") are one row with year_group '5/6' —
--     year level lives on the class, not the child.
--   * Classes belong to a school year (school_year int) so "3B 2026"
--     and "3B 2027" are different rows and history survives rollover.
--   * sessions gains a nullable uuid[] of target classes rather than a
--     join table: a session serves 1–2 classes, there is no per-link
--     metadata, and the roster grid reads sessions in one query.

-- 1. Classes within a school
CREATE TABLE school_classes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id     uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  name          text NOT NULL,            -- "3B", "Kindy Red"
  year_group    text NOT NULL,            -- "K", "1"…"6", composites like "5/6"
  school_year   int  NOT NULL,            -- 2026
  teacher_name  text,
  teacher_email text,                     -- collected later; column now so the shape is stable
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (centre_id, school_year, name)
);

CREATE INDEX idx_school_classes_centre ON school_classes(centre_id);

-- 2. Membership. A child can move classes mid-year — history kept via
--    ended_at; "current" membership is ended_at IS NULL.
CREATE TABLE school_class_children (
  class_id   uuid NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  child_id   uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  ended_at   date,
  PRIMARY KEY (class_id, child_id)
);

CREATE INDEX idx_school_class_children_child ON school_class_children(child_id);

-- 3. Sessions can target classes (nullable — childcare sessions and
--    untargeted school sessions ignore it). Consumed by session
--    targeting (phase 4 of the design); added now so the schema ships
--    once.
ALTER TABLE sessions ADD COLUMN school_class_ids uuid[] DEFAULT NULL;

-- ============================================================
-- RLS — staff manage, coaches read, clients read their own school's
-- ============================================================

ALTER TABLE school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_class_children ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_classes write for admin/ops"
  ON school_classes FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- Coaches see class names for the session cards they deliver to.
CREATE POLICY "school_classes read for coaches"
  ON school_classes FOR SELECT
  USING (auth_user_role() = 'coach');

CREATE POLICY client_read_school_classes ON school_classes
  FOR SELECT USING (centre_id IN (SELECT auth_client_centre_ids()));

CREATE POLICY "school_class_children write for admin/ops"
  ON school_class_children FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

CREATE POLICY "school_class_children read for coaches"
  ON school_class_children FOR SELECT
  USING (auth_user_role() = 'coach');

CREATE POLICY client_read_school_class_children ON school_class_children
  FOR SELECT USING (
    class_id IN (
      SELECT sc.id FROM school_classes sc
      WHERE sc.centre_id IN (SELECT auth_client_centre_ids())
    )
  );
