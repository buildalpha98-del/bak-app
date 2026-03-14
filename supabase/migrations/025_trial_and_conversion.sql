-- ============================================================
-- 025: Trial Tracking, Conversion & Won-to-Centre Handoff
-- ============================================================

-- Add is_trial flag to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT false;

-- Add trial_sessions_count to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trial_sessions_count integer DEFAULT 0;

-- Add trial_report_url to leads (Supabase Storage path)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trial_report_url text;

-- Add profile_completion_checklist to centres (jsonb tracking completion)
ALTER TABLE centres ADD COLUMN IF NOT EXISTS profile_checklist_complete boolean DEFAULT false;

-- Add converted_from_lead_id to centres for tracking handoff origin
ALTER TABLE centres ADD COLUMN IF NOT EXISTS converted_from_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

-- Index for trial sessions lookup
CREATE INDEX IF NOT EXISTS idx_sessions_is_trial ON sessions(is_trial) WHERE is_trial = true;

-- Index for lead → centre link
CREATE INDEX IF NOT EXISTS idx_centres_converted_from_lead ON centres(converted_from_lead_id) WHERE converted_from_lead_id IS NOT NULL;
