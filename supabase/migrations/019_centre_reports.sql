-- ============================================================
-- Migration 019: Centre reports — white-label term reports
-- ============================================================

-- 1. Report status enum
CREATE TYPE report_status AS ENUM ('draft', 'sent');

-- 2. Branding mode enum
CREATE TYPE branding_mode AS ENUM ('bak_branded', 'white_label');

-- 3. Add branding columns to centres
ALTER TABLE centres
  ADD COLUMN logo_url text,
  ADD COLUMN branding_mode branding_mode NOT NULL DEFAULT 'bak_branded';

-- 4. Centre reports table
CREATE TABLE centre_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id       uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  term_id         uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  title           text NOT NULL,
  content_json    jsonb NOT NULL DEFAULT '{}',
  cover_image_url text,
  status          report_status NOT NULL DEFAULT 'draft',
  generated_by    uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  pdf_url         text,
  sent_at         timestamptz,
  sent_to         text[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER centre_reports_updated_at
  BEFORE UPDATE ON centre_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Indexes
CREATE INDEX idx_centre_reports_centre ON centre_reports(centre_id);
CREATE INDEX idx_centre_reports_term ON centre_reports(term_id);
CREATE INDEX idx_centre_reports_status ON centre_reports(status);

-- 6. RLS policies
ALTER TABLE centre_reports ENABLE ROW LEVEL SECURITY;

-- Admin and ops can do everything
CREATE POLICY "admin_ops_full_access_reports"
  ON centre_reports
  FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- Coaches can view reports for centres they have sessions at
CREATE POLICY "coaches_view_reports"
  ON centre_reports
  FOR SELECT
  USING (
    auth_user_role() = 'coach'
    AND centre_id IN (
      SELECT DISTINCT s.centre_id FROM sessions s WHERE s.coach_id = auth.uid()
    )
  );
