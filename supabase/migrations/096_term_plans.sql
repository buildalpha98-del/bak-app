-- ============================================================
-- 096 — Term plans: a school's AI-drafted Scope & Sequence per class + subject
-- ============================================================
-- The Scope & Sequence page assembles what has already been rostered or
-- written. A term plan is the document that comes *first*: the units a
-- class will cover this term, the weeks each takes, the outcomes each
-- addresses and where assessment sits — drafted by the AI from the
-- Department's sample scope and sequences (lib/curriculum/exemplars) and
-- the knowledge base (lib/curriculum/knowledge-base), reviewed and saved
-- by the school, then used to prefill each week's lesson.
--
-- One plan per class × subject × term. content_json holds TermPlanJson
-- (lib/curriculum/term-plan.ts). Clients read their own school's plans
-- through RLS; writes go through the admin client after the portal auth
-- check, as every portal write does.

CREATE TABLE IF NOT EXISTS term_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  school_class_id uuid NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (subject IN ('pdhpe', 'english', 'mathematics')),
  title text NOT NULL,
  content_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_by_client_user_id uuid REFERENCES client_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (centre_id, school_class_id, term_id, subject)
);

CREATE INDEX IF NOT EXISTS idx_term_plans_centre_term ON term_plans(centre_id, term_id);

ALTER TABLE term_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_full_term_plans ON term_plans FOR ALL USING (auth_user_role() = 'admin');
CREATE POLICY ops_full_term_plans ON term_plans FOR ALL USING (auth_user_role() = 'ops');
CREATE POLICY client_read_own_term_plans ON term_plans
  FOR SELECT USING (centre_id IN (SELECT auth_client_centre_ids()));

COMMENT ON TABLE term_plans IS
  'AI-drafted, school-approved Scope & Sequence for one class, subject and term (migration 096). content_json = TermPlanJson.';
