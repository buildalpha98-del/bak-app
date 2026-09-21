-- ============================================================
-- 097 — Report-card comments (schools)
-- ============================================================
-- A school report card carries a general comment and next steps from
-- the class teacher, beside the marks. Until now the card had skill
-- notes per assessment and coach observations, but nowhere for the
-- teacher's overall word on the term.
--
-- One row per centre × child × term. Reads through RLS (own school);
-- writes go through the admin client after the portal auth check —
-- the class teacher for their own classes, or the primary contact /
-- a colleague for any student — as every portal write does.

CREATE TABLE IF NOT EXISTS report_card_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id       uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  term_id         uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  general_comment text NOT NULL DEFAULT '',
  next_steps      text NOT NULL DEFAULT '',
  author_client_user_id uuid REFERENCES client_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (centre_id, child_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_report_card_comments_child_term ON report_card_comments(child_id, term_id);

ALTER TABLE report_card_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_full_report_card_comments ON report_card_comments
  FOR ALL USING (auth_user_role() = 'admin');
CREATE POLICY ops_full_report_card_comments ON report_card_comments
  FOR ALL USING (auth_user_role() = 'ops');
CREATE POLICY client_read_report_card_comments ON report_card_comments
  FOR SELECT USING (centre_id IN (SELECT auth_client_centre_ids()));

COMMENT ON TABLE report_card_comments IS
  'Class teacher''s general comment and next steps on a student''s report card for a term (migration 097).';
