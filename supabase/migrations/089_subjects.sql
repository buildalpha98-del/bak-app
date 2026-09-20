-- ============================================================
-- 089 — Subjects: PDHPE first, English and Mathematics next
-- ============================================================
-- Assessment templates and programmes gain a subject. Everything built
-- for PDHPE — teacher-entered ratings, the class grid, report cards,
-- the term report, class rollups, the CSV — keys off the template, so a
-- subject on the template is enough for another department to run the
-- same flow. The `sport` column stays as the template's grouping
-- ("Sport" for PDHPE, "Focus area" for English, "Strand" for Maths);
-- the registry in lib/curriculum/subjects.ts maps labels and NSW
-- outcome-code prefixes per subject. Every existing row is PDHPE.

ALTER TABLE assessment_templates
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'pdhpe';

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'pdhpe';

ALTER TABLE assessment_templates
  DROP CONSTRAINT IF EXISTS assessment_templates_subject_check;
ALTER TABLE assessment_templates
  ADD CONSTRAINT assessment_templates_subject_check
  CHECK (subject IN ('pdhpe', 'english', 'mathematics'));

ALTER TABLE programs
  DROP CONSTRAINT IF EXISTS programs_subject_check;
ALTER TABLE programs
  ADD CONSTRAINT programs_subject_check
  CHECK (subject IN ('pdhpe', 'english', 'mathematics'));

CREATE INDEX IF NOT EXISTS idx_assessment_templates_subject
  ON assessment_templates(subject);
CREATE INDEX IF NOT EXISTS idx_programs_subject
  ON programs(subject);
