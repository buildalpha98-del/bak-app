-- ============================================================
-- 093 — Lessons on the Scope & Sequence
-- ============================================================
-- A school's own lesson (migration 091) is not a roster session, so it
-- had no place on the written Scope & Sequence. planned_for is the
-- Monday of the term week the teacher intends to teach it; the
-- curriculum page and PDF merge lessons into that week beside the
-- coaching sessions, so the document covers PDHPE, English and Maths.

ALTER TABLE programs ADD COLUMN IF NOT EXISTS planned_for date;
CREATE INDEX IF NOT EXISTS idx_programs_centre_planned ON programs(centre_id, planned_for);
