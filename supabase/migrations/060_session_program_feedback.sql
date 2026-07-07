-- ============================================================
-- 060 — session_program_feedback (coach feedback loop on programs)
-- ============================================================
--
-- After a completed session, the coach rates how the assigned
-- programme landed: too easy / just right / too hard, with an
-- optional comment. Ops sees the aggregate on the programme detail
-- page and iterates the next version from real signal instead of
-- guessing.
--
-- One row per (session, coach) — resubmitting updates in place via
-- UPSERT from the app.

CREATE TABLE session_program_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  program_id  uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      text NOT NULL CHECK (rating IN ('too_easy', 'just_right', 'too_hard')),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, coach_id)
);

CREATE INDEX idx_spf_program ON session_program_feedback(program_id);
CREATE INDEX idx_spf_coach ON session_program_feedback(coach_id);

ALTER TABLE session_program_feedback ENABLE ROW LEVEL SECURITY;

-- Coaches write + read their own feedback
CREATE POLICY spf_coach_insert ON session_program_feedback
  FOR INSERT WITH CHECK (coach_id = auth.uid());
CREATE POLICY spf_coach_update ON session_program_feedback
  FOR UPDATE USING (coach_id = auth.uid());
CREATE POLICY spf_coach_read ON session_program_feedback
  FOR SELECT USING (coach_id = auth.uid());

-- Admin + ops read everything (aggregates on programme detail)
CREATE POLICY spf_staff_read ON session_program_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'ops')
    )
  );
