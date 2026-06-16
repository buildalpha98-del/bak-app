-- ============================================================
-- Migration 051: Y1 growth targets in business_settings
-- ============================================================
--
-- Adds 3 editable Year-1 growth targets to the existing
-- business_settings key/value store (migration 040). Replaces the
-- hardcoded YEAR_1_* constants in lib/launch/dashboard-actions.ts so
-- admins can edit them inline from the home dashboard metric cards.
--
-- Defaults match the previous hardcoded values:
--   y1_target_centres = 40
--   y1_target_schools = 10
--   y1_target_revenue = 400000  (dollars; not cents)
--
-- Read/write through lib/launch/y1-targets-actions.ts.

INSERT INTO business_settings (key, value) VALUES
  ('y1_target_centres', '40'::jsonb),
  ('y1_target_schools', '10'::jsonb),
  ('y1_target_revenue', '400000'::jsonb)
ON CONFLICT (key) DO NOTHING;
