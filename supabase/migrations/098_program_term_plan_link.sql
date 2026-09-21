-- ============================================================
-- 098 — Programmes written from a school's approved term plan
-- ============================================================
-- An approved PDHPE term plan (096) now drives the roster: ops generate
-- each rostered session's programme from the plan's week — its focus,
-- its unit and the unit's outcomes. These two columns record where a
-- programme came from, so a second session in the same week reuses it
-- instead of paying for another generation, the roster can tell the
-- plan's programme from any other, and the portal can show the school
-- that its plan is what the coach is delivering.
--
-- ON DELETE SET NULL: deleting a plan must not take delivered
-- programmes with it.

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS term_plan_id uuid REFERENCES term_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS term_plan_week integer CHECK (term_plan_week IS NULL OR term_plan_week >= 1);

CREATE INDEX IF NOT EXISTS idx_programs_term_plan ON programs(term_plan_id, term_plan_week)
  WHERE term_plan_id IS NOT NULL;

COMMENT ON COLUMN programs.term_plan_id IS
  'The approved term plan this programme was written from (migration 098); null for library programmes.';
COMMENT ON COLUMN programs.term_plan_week IS
  'The term week of that plan the programme delivers (1-based).';
