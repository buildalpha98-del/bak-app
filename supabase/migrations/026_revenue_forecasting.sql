-- ============================================================
-- 026: Revenue Forecasting
-- ============================================================

-- Forecast period type enum
CREATE TYPE forecast_period_type AS ENUM ('monthly', 'quarterly');

-- Revenue forecasts table
CREATE TABLE revenue_forecasts (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_date          date NOT NULL DEFAULT CURRENT_DATE,
  period_type            forecast_period_type NOT NULL,
  period_start           date NOT NULL,
  period_end             date NOT NULL,
  committed_revenue      decimal(12,2) NOT NULL DEFAULT 0,
  pipeline_revenue       decimal(12,2) NOT NULL DEFAULT 0,
  total_projected_revenue decimal(12,2) NOT NULL DEFAULT 0,
  projected_coach_costs  decimal(12,2) NOT NULL DEFAULT 0,
  projected_profit       decimal(12,2) NOT NULL DEFAULT 0,
  breakdown_json         jsonb DEFAULT '{}',
  created_at             timestamptz DEFAULT now()
);

CREATE INDEX idx_forecasts_date ON revenue_forecasts(forecast_date DESC);
CREATE INDEX idx_forecasts_period ON revenue_forecasts(period_type, period_start);

-- Forecast configuration table
CREATE TABLE forecast_config (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key         text UNIQUE NOT NULL,
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz DEFAULT now()
);

-- Seed default config
INSERT INTO forecast_config (key, value) VALUES
  ('pipeline_conversion_rates', '{"cold_lead": 0.05, "contacted": 0.10, "interested": 0.20, "free_trial": 0.50, "proposal_sent": 0.70}'),
  ('seasonal_factors', '{"1": 0.5, "2": 0.8, "3": 1.0, "4": 1.0, "5": 1.0, "6": 1.0, "7": 0.7, "8": 0.8, "9": 1.0, "10": 1.0, "11": 1.0, "12": 0.6}'),
  ('default_session_frequency', '{"childcare_centre": 1, "school": 2}');

-- RLS
ALTER TABLE revenue_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_config ENABLE ROW LEVEL SECURITY;

-- Admin only for forecasts
CREATE POLICY forecasts_admin_all ON revenue_forecasts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Admin/ops read, admin write for config
CREATE POLICY forecast_config_read ON forecast_config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

CREATE POLICY forecast_config_write ON forecast_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
