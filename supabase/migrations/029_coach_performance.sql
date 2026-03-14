-- 029_coach_performance.sql
-- Coach Performance: snapshots and badges

-- coach_performance_snapshots
CREATE TABLE IF NOT EXISTS coach_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metrics_json jsonb NOT NULL DEFAULT '{}',
  overall_score decimal(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_perf_snapshots_coach ON coach_performance_snapshots(coach_id);
CREATE INDEX idx_perf_snapshots_period ON coach_performance_snapshots(period_start, period_end);

-- coach_badges
CREATE TABLE IF NOT EXISTS coach_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_coach_badges_unique ON coach_badges(coach_id, badge_key);

-- RLS
ALTER TABLE coach_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_badges ENABLE ROW LEVEL SECURITY;

-- Admin/ops: full access to snapshots
CREATE POLICY "admin_ops_snapshots_all" ON coach_performance_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Coaches: read own snapshots
CREATE POLICY "coach_own_snapshots" ON coach_performance_snapshots
  FOR SELECT USING (coach_id = auth.uid());

-- Admin/ops: full access to badges
CREATE POLICY "admin_ops_badges_all" ON coach_badges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Coaches: read own badges
CREATE POLICY "coach_own_badges" ON coach_badges
  FOR SELECT USING (coach_id = auth.uid());
