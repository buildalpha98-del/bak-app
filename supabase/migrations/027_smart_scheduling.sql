-- 027_smart_scheduling.sql
-- Smart Scheduling AI: preferences, runs, session status extension

-- New enum: scheduling preference type
CREATE TYPE scheduling_preference_type AS ENUM ('preferred', 'avoid');

-- New enum: scheduling run status
CREATE TYPE scheduling_run_status AS ENUM ('generated', 'reviewed', 'published', 'discarded');

-- Add 'needs_replacement' to session_status enum
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'needs_replacement' AFTER 'cancelled';

-- 1. scheduling_preferences
CREATE TABLE scheduling_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  centre_id UUID NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  preference_type scheduling_preference_type NOT NULL,
  reason TEXT,
  learned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coach_id, centre_id)
);

-- 2. scheduling_runs
CREATE TABLE scheduling_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  input_summary JSONB NOT NULL DEFAULT '{}',
  output_summary JSONB NOT NULL DEFAULT '{}',
  assignments_json JSONB NOT NULL DEFAULT '[]',
  adjustments_json JSONB NOT NULL DEFAULT '[]',
  status scheduling_run_status NOT NULL DEFAULT 'generated',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sched_pref_coach ON scheduling_preferences(coach_id);
CREATE INDEX idx_sched_pref_centre ON scheduling_preferences(centre_id);
CREATE INDEX idx_sched_runs_term ON scheduling_runs(term_id);
CREATE INDEX idx_sched_runs_week ON scheduling_runs(week_start, week_end);
CREATE INDEX idx_sched_runs_status ON scheduling_runs(status);

-- RLS
ALTER TABLE scheduling_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_runs ENABLE ROW LEVEL SECURITY;

-- scheduling_preferences: admin/ops full access, coaches read own
CREATE POLICY "Admin/ops manage scheduling preferences"
  ON scheduling_preferences FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

CREATE POLICY "Coaches read own scheduling preferences"
  ON scheduling_preferences FOR SELECT
  USING (coach_id = auth.uid());

-- scheduling_runs: admin/ops full access
CREATE POLICY "Admin/ops manage scheduling runs"
  ON scheduling_runs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
