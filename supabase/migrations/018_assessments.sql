-- ============================================================
-- Migration 018: Skill assessment system
-- Adds: assessment_templates, skill_ratings tables
-- ============================================================

-- ========================
-- assessment_templates
-- ========================
CREATE TABLE assessment_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport       text NOT NULL,
  age_group   age_group NOT NULL,
  skills_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  term_id     uuid REFERENCES terms(id) ON DELETE SET NULL,
  centre_id   uuid REFERENCES centres(id) ON DELETE SET NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ========================
-- skill_ratings
-- ========================
CREATE TABLE skill_ratings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_template_id  uuid NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  child_id                uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  coach_id                uuid NOT NULL REFERENCES profiles(id),
  term_id                 uuid NOT NULL REFERENCES terms(id),
  ratings_json            jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                   text,
  assessed_at             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_template_id, child_id, term_id)
);

-- ========================
-- Indexes
-- ========================
CREATE INDEX idx_assessment_templates_sport_age ON assessment_templates(sport, age_group);
CREATE INDEX idx_assessment_templates_term ON assessment_templates(term_id);
CREATE INDEX idx_assessment_templates_centre ON assessment_templates(centre_id);
CREATE INDEX idx_skill_ratings_template ON skill_ratings(assessment_template_id);
CREATE INDEX idx_skill_ratings_child ON skill_ratings(child_id);
CREATE INDEX idx_skill_ratings_coach ON skill_ratings(coach_id);
CREATE INDEX idx_skill_ratings_term ON skill_ratings(term_id);
CREATE INDEX idx_skill_ratings_child_template ON skill_ratings(child_id, assessment_template_id);

-- ========================
-- RLS
-- ========================
ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_ratings ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_full_assessment_templates" ON assessment_templates
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "admin_full_skill_ratings" ON skill_ratings
  FOR ALL USING (auth_user_role() = 'admin');

-- Ops: full access
CREATE POLICY "ops_full_assessment_templates" ON assessment_templates
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "ops_full_skill_ratings" ON skill_ratings
  FOR ALL USING (auth_user_role() = 'ops');

-- Coach: read assessment templates assigned to centres where they have sessions
CREATE POLICY "coach_read_assessment_templates" ON assessment_templates
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND (
      centre_id IS NULL
      OR centre_id IN (
        SELECT s.centre_id FROM sessions s WHERE s.coach_id = auth.uid()
      )
    )
  );

-- Coach: create/read/update ratings for their own assessments
CREATE POLICY "coach_read_skill_ratings" ON skill_ratings
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND coach_id = auth.uid()
  );

CREATE POLICY "coach_insert_skill_ratings" ON skill_ratings
  FOR INSERT WITH CHECK (
    auth_user_role() = 'coach'
    AND coach_id = auth.uid()
  );

CREATE POLICY "coach_update_skill_ratings" ON skill_ratings
  FOR UPDATE USING (
    auth_user_role() = 'coach'
    AND coach_id = auth.uid()
  );
