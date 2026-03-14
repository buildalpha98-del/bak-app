-- ============================================================
-- 022: Centre Health Score System
-- ============================================================

-- Health status enum
CREATE TYPE health_status AS ENUM ('green', 'amber', 'red');

-- Health scores history table
CREATE TABLE health_scores (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centre_id       uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  score           decimal(5,2) NOT NULL,
  status          health_status NOT NULL,
  breakdown_json  jsonb NOT NULL DEFAULT '{}',
  calculated_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_health_scores_centre ON health_scores(centre_id, calculated_at DESC);

-- Health score configuration table
CREATE TABLE health_score_config (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_name      text UNIQUE NOT NULL,
  weight           decimal(3,2) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  green_threshold  decimal(5,2) NOT NULL,
  amber_threshold  decimal(5,2) NOT NULL,
  description      text,
  updated_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at       timestamptz DEFAULT now()
);

-- Add health columns to centres
ALTER TABLE centres
  ADD COLUMN IF NOT EXISTS health_score decimal(5,2),
  ADD COLUMN IF NOT EXISTS health_status health_status,
  ADD COLUMN IF NOT EXISTS health_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS churn_risk boolean DEFAULT false;

-- Seed default configuration
INSERT INTO health_score_config (signal_name, weight, green_threshold, amber_threshold, description) VALUES
  ('feedback_ratings',   0.30, 75, 50, 'Average session feedback ratings over last 3 months'),
  ('invoice_payment',    0.25, 75, 50, 'Speed of invoice payments — days to pay'),
  ('cancellation_rate',  0.20, 75, 50, 'Session cancellation rate over last 3 months'),
  ('communication',      0.15, 75, 50, 'Responsiveness to feedback requests and messages'),
  ('attendance_trends',  0.10, 75, 50, 'Attendance trends compared to previous period');

-- RLS
ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_score_config ENABLE ROW LEVEL SECURITY;

-- Admin/ops can read health scores
CREATE POLICY health_scores_read ON health_scores
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

CREATE POLICY health_scores_insert ON health_scores
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

-- Admin can manage config, ops can read
CREATE POLICY health_config_read ON health_score_config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

CREATE POLICY health_config_update ON health_score_config
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
