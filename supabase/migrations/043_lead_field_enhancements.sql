-- ============================================================
-- 043: Lead Field Enhancements — additional tracking fields
-- ============================================================

-- Address breakdown
ALTER TABLE leads ADD COLUMN IF NOT EXISTS suburb text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS postcode text;

-- Contact details
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_role text;

-- Revenue projection
ALTER TABLE leads ADD COLUMN IF NOT EXISTS student_count integer;

-- Source detail (e.g. who referred them)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_detail text;

-- Sales cycle tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_close_date date;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_date date;

-- Conversion tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_at timestamptz;

-- Audit trail
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Indexes for cron and filtering
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(next_follow_up_date) WHERE next_follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_expected_close ON leads(expected_close_date) WHERE expected_close_date IS NOT NULL;
