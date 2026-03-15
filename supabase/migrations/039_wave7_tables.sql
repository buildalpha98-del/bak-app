-- Wave 7: Sales Proposals, Regions, Child Insights, Churn System
-- Migration 039

-- ============================================================
-- Enums
-- ============================================================

DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('draft', 'final', 'sent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE region_status AS ENUM ('active', 'planned', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE insight_type AS ENUM ('term_end', 'on_demand');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE churn_event_type AS ENUM ('churned', 'recovered', 'at_risk');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 1. sales_proposals
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_json JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  status proposal_status NOT NULL DEFAULT 'draft',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_proposals_lead ON sales_proposals(lead_id);
CREATE INDEX idx_sales_proposals_status ON sales_proposals(status);

-- ============================================================
-- 2. regions
-- ============================================================

CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  suburbs JSONB NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'NSW',
  status region_status NOT NULL DEFAULT 'active',
  regional_manager_id UUID REFERENCES profiles(id),
  target_centres INT,
  is_franchise BOOLEAN NOT NULL DEFAULT false,
  data_isolation_level TEXT DEFAULT 'none',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_regions_status ON regions(status);
CREATE INDEX idx_regions_code ON regions(code);

-- Add region_id to centres
ALTER TABLE centres ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id);
CREATE INDEX IF NOT EXISTS idx_centres_region ON centres(region_id);

-- Add region_id to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id);
CREATE INDEX IF NOT EXISTS idx_leads_region ON leads(region_id);

-- Add region_ids to profiles (for coaches)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS region_ids JSONB DEFAULT '[]';

-- Add region_id to bookable_sessions
ALTER TABLE bookable_sessions ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id);
CREATE INDEX IF NOT EXISTS idx_bookable_sessions_region ON bookable_sessions(region_id);

-- ============================================================
-- 3. child_insights
-- ============================================================

CREATE TABLE IF NOT EXISTS child_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  term_id UUID REFERENCES terms(id),
  centre_id UUID REFERENCES centres(id),
  insight_type insight_type NOT NULL DEFAULT 'term_end',
  content_json JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  strengths TEXT[] DEFAULT '{}',
  areas_for_growth TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  generated_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_insights_child ON child_insights(child_id);
CREATE INDEX idx_child_insights_term ON child_insights(term_id);
CREATE INDEX idx_child_insights_centre ON child_insights(centre_id);

-- ============================================================
-- 4. churn_events
-- ============================================================

CREATE TABLE IF NOT EXISTS churn_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id UUID NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  event_type churn_event_type NOT NULL,
  risk_score NUMERIC(5,2),
  risk_level risk_level,
  indicators JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_churn_events_centre ON churn_events(centre_id);
CREATE INDEX idx_churn_events_type ON churn_events(event_type);
CREATE INDEX idx_churn_events_detected ON churn_events(detected_at);

-- ============================================================
-- 5. churn_risk_indicators
-- ============================================================

CREATE TABLE IF NOT EXISTS churn_risk_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id UUID NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_level risk_level NOT NULL DEFAULT 'low',
  health_score NUMERIC(5,2),
  health_trend TEXT,
  engagement_score NUMERIC(5,2),
  communication_score NUMERIC(5,2),
  payment_score NUMERIC(5,2),
  cancellation_rate NUMERIC(5,2),
  session_trend TEXT,
  days_since_last_feedback INT,
  days_since_last_communication INT,
  indicators_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(centre_id, snapshot_date)
);

CREATE INDEX idx_churn_risk_centre ON churn_risk_indicators(centre_id);
CREATE INDEX idx_churn_risk_date ON churn_risk_indicators(snapshot_date);
CREATE INDEX idx_churn_risk_level ON churn_risk_indicators(risk_level);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE sales_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_risk_indicators ENABLE ROW LEVEL SECURITY;

-- Sales proposals: admin/ops can manage
CREATE POLICY sales_proposals_admin ON sales_proposals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Regions: admin can manage, all staff can read
CREATE POLICY regions_read ON regions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY regions_manage ON regions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Child insights: admin/ops/coach can read, system generates
CREATE POLICY child_insights_staff ON child_insights
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops', 'coach'))
  );

-- Parent can view their children's insights
CREATE POLICY child_insights_parent ON child_insights
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      JOIN parent_profiles pp ON pp.id = pc.parent_id
      WHERE pc.child_id = child_insights.child_id
      AND pp.user_id = auth.uid()
    )
  );

-- Churn events: admin/ops only
CREATE POLICY churn_events_admin ON churn_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Churn risk indicators: admin/ops only
CREATE POLICY churn_risk_admin ON churn_risk_indicators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Seed default region for South-West Sydney
INSERT INTO regions (name, code, suburbs, state, status, notes)
VALUES (
  'South-West Sydney', 'SWS',
  '["Bankstown", "Liverpool", "Yagoona", "Greenacre", "Punchbowl", "Lakemba", "Revesby", "Padstow", "Bass Hill", "Chester Hill", "Villawood", "Fairfield", "Cabramatta", "Canley Vale", "Warwick Farm", "Moorebank", "Hammondville", "Milperra", "Georges Hall", "Condell Park"]'::jsonb,
  'NSW', 'active',
  'Default region covering Bankstown/Liverpool LGAs'
)
ON CONFLICT (code) DO NOTHING;
