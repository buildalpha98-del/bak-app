-- ============================================================
-- 092 — Student quizzes (knowledge checks)
-- ============================================================
-- The last piece of "AI builds the curriculum, the school completes the
-- assessments": a short quiz per lesson (or per focus area + band) that
-- the teacher runs with the class and marks per student. Results sit
-- beside skill ratings on the student page and the report card.
--
--   quizzes       — school-owned question sets (centre_id), optionally
--                   attached to a programme; questions_json holds
--                   [{ id, prompt, type, options?, answer, skill? }]
--   quiz_results  — one row per quiz × student: score / total and the
--                   per-question record, marked by a portal user
--
-- Clients read their own school's rows; writes go through the admin
-- client after the portal auth check, as every portal write does.

CREATE TABLE IF NOT EXISTS quizzes (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id                  uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  program_id                 uuid REFERENCES programs(id) ON DELETE SET NULL,
  subject                    text NOT NULL DEFAULT 'pdhpe'
                             CHECK (subject IN ('pdhpe', 'english', 'mathematics')),
  focus                      text NOT NULL,
  age_band                   text NOT NULL,
  title                      text NOT NULL,
  questions_json             jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_client_user_id  uuid REFERENCES client_users(id) ON DELETE SET NULL,
  created_by                 uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_centre ON quizzes(centre_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_program ON quizzes(program_id);

CREATE TABLE IF NOT EXISTS quiz_results (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id                   uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  child_id                  uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  term_id                   uuid REFERENCES terms(id) ON DELETE SET NULL,
  score                     int NOT NULL,
  total                     int NOT NULL,
  answers_json              jsonb NOT NULL DEFAULT '[]'::jsonb,
  marked_by_client_user_id  uuid REFERENCES client_users(id) ON DELETE SET NULL,
  marked_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_child ON quiz_results(child_id);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_full_quizzes ON quizzes FOR ALL USING (auth_user_role() = 'admin');
CREATE POLICY ops_full_quizzes ON quizzes FOR ALL USING (auth_user_role() = 'ops');
CREATE POLICY client_read_own_quizzes ON quizzes
  FOR SELECT USING (centre_id IN (SELECT auth_client_centre_ids()));

CREATE POLICY admin_full_quiz_results ON quiz_results FOR ALL USING (auth_user_role() = 'admin');
CREATE POLICY ops_full_quiz_results ON quiz_results FOR ALL USING (auth_user_role() = 'ops');
CREATE POLICY client_read_own_quiz_results ON quiz_results
  FOR SELECT USING (
    quiz_id IN (SELECT q.id FROM quizzes q WHERE q.centre_id IN (SELECT auth_client_centre_ids()))
  );
