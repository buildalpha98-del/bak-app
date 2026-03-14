-- ============================================================
-- 010_session_workflow.sql
-- Adds session workflow columns + seeds default form templates
-- ============================================================

-- 1. Add workflow columns to sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS actual_duration_minutes int,
  ADD COLUMN IF NOT EXISTS headcount int,
  ADD COLUMN IF NOT EXISTS coach_notes text,
  ADD COLUMN IF NOT EXISTS needs_ops_review boolean NOT NULL DEFAULT false;

-- 2. Seed default form templates (is_default = true, centre_id = null)
-- Uses a system UUID for created_by since these are system-generated
INSERT INTO form_templates (id, name, form_type, fields_json, is_default, centre_id, created_by)
VALUES
  (
    gen_random_uuid(),
    'Session Attendance',
    'attendance',
    '[
      {"id":"headcount","type":"number","label":"Headcount","required":true},
      {"id":"date","type":"date","label":"Date","required":true},
      {"id":"centre","type":"text","label":"Centre","required":true},
      {"id":"sport","type":"text","label":"Sport","required":true}
    ]'::jsonb,
    true,
    null,
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    gen_random_uuid(),
    'Session Feedback',
    'session_feedback',
    '[
      {"id":"activities_delivered","type":"textarea","label":"Activities Delivered","required":true,"placeholder":"Describe the activities run during this session"},
      {"id":"engagement_rating","type":"number","label":"Engagement Rating (1-5)","required":true},
      {"id":"observations","type":"textarea","label":"Observations","required":false,"placeholder":"Any notes on the session, children, or environment"}
    ]'::jsonb,
    true,
    null,
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    gen_random_uuid(),
    'Incident Report',
    'incident',
    '[
      {"id":"child_name","type":"text","label":"Child Name","required":true},
      {"id":"description","type":"textarea","label":"Description","required":true,"placeholder":"Describe what happened"},
      {"id":"action_taken","type":"textarea","label":"Action Taken","required":true,"placeholder":"What was done in response"},
      {"id":"witnesses","type":"text","label":"Witnesses","required":false,"placeholder":"Names of any witnesses"},
      {"id":"severity","type":"select","label":"Severity","required":true,"options":["minor","moderate","serious"]},
      {"id":"photos","type":"file","label":"Photos","required":false},
      {"id":"parent_notified","type":"checkbox","label":"Parent Notified","required":false},
      {"id":"centre_staff_notified","type":"checkbox","label":"Centre Staff Notified","required":false}
    ]'::jsonb,
    true,
    null,
    '00000000-0000-0000-0000-000000000000'
  )
ON CONFLICT DO NOTHING;

-- 3. RLS policies for form_submissions (coaches)
-- Coaches can insert their own submissions
CREATE POLICY IF NOT EXISTS "Coaches can insert own submissions"
  ON form_submissions
  FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

-- Coaches can read their own submissions
CREATE POLICY IF NOT EXISTS "Coaches can read own submissions"
  ON form_submissions
  FOR SELECT
  USING (submitted_by = auth.uid());

-- 4. Create incident-photos storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-photos', 'incident-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: coaches can upload to incident-photos
CREATE POLICY IF NOT EXISTS "Coaches can upload incident photos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'incident-photos'
    AND auth.role() = 'authenticated'
  );

-- Coaches can read their own incident photos
CREATE POLICY IF NOT EXISTS "Coaches can read incident photos"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'incident-photos'
    AND auth.role() = 'authenticated'
  );
