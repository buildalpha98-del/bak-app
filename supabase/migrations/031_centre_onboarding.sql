-- 031_centre_onboarding.sql
-- Centre onboarding wizard: checklists, steps, and automated emails

-- Enums
CREATE TYPE onboarding_status AS ENUM ('in_progress', 'completed', 'stalled');
CREATE TYPE onboarding_step_type AS ENUM ('manual', 'auto_email', 'auto_triggered');
CREATE TYPE onboarding_step_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped');

-- centre_onboarding_checklists
CREATE TABLE IF NOT EXISTS centre_onboarding_checklists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id    uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  status       onboarding_status NOT NULL DEFAULT 'in_progress',
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(centre_id)
);

-- centre_onboarding_steps
CREATE TABLE IF NOT EXISTS centre_onboarding_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  uuid NOT NULL REFERENCES centre_onboarding_checklists(id) ON DELETE CASCADE,
  step_number   int NOT NULL CHECK (step_number BETWEEN 1 AND 10),
  step_name     text NOT NULL,
  step_type     onboarding_step_type NOT NULL,
  status        onboarding_step_status NOT NULL DEFAULT 'pending',
  completed_at  timestamptz,
  completed_by  uuid REFERENCES profiles(id),
  notes         text,
  scheduled_for timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(checklist_id, step_number)
);

-- centre_onboarding_emails
CREATE TABLE IF NOT EXISTS centre_onboarding_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES centre_onboarding_checklists(id) ON DELETE CASCADE,
  step_number  int NOT NULL,
  email_type   text NOT NULL,
  sent_to      text NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  opened_at    timestamptz
);

-- RLS
ALTER TABLE centre_onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE centre_onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE centre_onboarding_emails ENABLE ROW LEVEL SECURITY;

-- Admin/ops full access
CREATE POLICY "admin_ops_checklists" ON centre_onboarding_checklists
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

CREATE POLICY "admin_ops_steps" ON centre_onboarding_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

CREATE POLICY "admin_ops_emails" ON centre_onboarding_emails
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Indexes
CREATE INDEX idx_onboarding_checklists_centre ON centre_onboarding_checklists(centre_id);
CREATE INDEX idx_onboarding_checklists_status ON centre_onboarding_checklists(status);
CREATE INDEX idx_onboarding_steps_checklist ON centre_onboarding_steps(checklist_id);
CREATE INDEX idx_onboarding_steps_status ON centre_onboarding_steps(status);
CREATE INDEX idx_onboarding_emails_checklist ON centre_onboarding_emails(checklist_id);
