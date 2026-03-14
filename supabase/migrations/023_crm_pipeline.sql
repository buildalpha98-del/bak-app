-- ============================================================
-- 023: Sales CRM Pipeline
-- ============================================================

-- Lead source enum
CREATE TYPE lead_source AS ENUM ('manual', 'csv_import', 'web_form', 'referral');

-- Lead stage enum
CREATE TYPE lead_stage AS ENUM (
  'cold_lead', 'contacted', 'interested', 'free_trial',
  'proposal_sent', 'won', 'lost', 'churned'
);

-- Lead activity type enum
CREATE TYPE lead_activity_type AS ENUM (
  'note', 'email_sent', 'email_opened', 'email_clicked',
  'call', 'meeting', 'stage_change', 'task_created', 'system'
);

-- Leads table
CREATE TABLE leads (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centre_name      text NOT NULL,
  type             centre_type, -- reuse existing enum
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  address          text,
  source           lead_source NOT NULL DEFAULT 'manual',
  stage            lead_stage NOT NULL DEFAULT 'cold_lead',
  stage_changed_at timestamptz DEFAULT now(),
  owner_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  estimated_value  decimal(10,2),
  notes            text,
  lost_reason      text,
  churn_reason     text,
  centre_id        uuid REFERENCES centres(id) ON DELETE SET NULL,
  trial_start_date date,
  trial_end_date   date,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_owner ON leads(owner_id);
CREATE INDEX idx_leads_centre_name ON leads(centre_name);
CREATE INDEX idx_leads_contact_email ON leads(contact_email);

-- Lead activities table
CREATE TABLE lead_activities (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type        lead_activity_type NOT NULL,
  content     text,
  metadata    jsonb,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- Admin and ops full access to leads
CREATE POLICY leads_admin_ops_all ON leads
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

-- Admin and ops full access to lead activities
CREATE POLICY lead_activities_admin_ops_all ON lead_activities
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

-- Sequence for lead numbering (optional, for display)
CREATE SEQUENCE IF NOT EXISTS lead_number_seq START 1001;
