-- ============================================================
-- Seed data for Build Alpha Kids
-- NOTE: Run AFTER migrations. Auth users must be created in
-- Supabase dashboard or via auth.admin API first, then profiles
-- are seeded here referencing those auth.users UUIDs.
--
-- For local dev, use fixed UUIDs. In production, create users
-- via the Supabase Auth API and update these UUIDs.
-- ============================================================

-- Fixed UUIDs for seed users (replace with real auth.users IDs)
-- Admin:   11111111-1111-1111-1111-111111111111
-- Ops:     22222222-2222-2222-2222-222222222222
-- Coach 1: 33333333-3333-3333-3333-333333333333
-- Coach 2: 44444444-4444-4444-4444-444444444444
-- Coach 3: 55555555-5555-5555-5555-555555555555

-- ========================
-- 1. Profiles (5 users)
-- ========================
INSERT INTO profiles (id, email, name, phone, role, default_pay_rate, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@buildalphakids.com.au', 'Jordan Mitchell', '0400111222', 'admin', NULL, 'active'),
  ('22222222-2222-2222-2222-222222222222', 'abdul@buildalphakids.com.au', 'Abdul Rahman', '0400222333', 'ops', NULL, 'active'),
  ('33333333-3333-3333-3333-333333333333', 'coach.liam@example.com', 'Liam Thompson', '0411333444', 'coach', 40.00, 'active'),
  ('44444444-4444-4444-4444-444444444444', 'coach.sarah@example.com', 'Sarah Chen', '0411444555', 'coach', 38.00, 'active'),
  ('55555555-5555-5555-5555-555555555555', 'coach.marcus@example.com', 'Marcus Williams', '0411555666', 'coach', 42.00, 'onboarding');

-- ========================
-- 2. Pay rates for coaches
-- ========================
INSERT INTO pay_rates (user_id, session_type, rate, rate_unit, effective_from) VALUES
  ('33333333-3333-3333-3333-333333333333', 'childcare', 40.00, 'per_session', '2026-01-01'),
  ('33333333-3333-3333-3333-333333333333', 'school_local', 35.00, 'per_hour', '2026-01-01'),
  ('44444444-4444-4444-4444-444444444444', 'childcare', 38.00, 'per_session', '2026-01-01'),
  ('44444444-4444-4444-4444-444444444444', 'school_travel', 40.00, 'per_hour', '2026-01-01'),
  ('55555555-5555-5555-5555-555555555555', 'childcare', 42.00, 'per_session', '2026-01-01');

-- ========================
-- 3. Centres (5 — mix of childcare and school)
-- ========================
INSERT INTO centres (id, name, type, address, latitude, longitude, primary_contact_name, primary_contact_phone, primary_contact_email, primary_contact_role, group_size, age_groups, pricing_model, agreed_rate, contract_status) VALUES
  ('aaaa1111-0000-0000-0000-000000000001', 'Little Stars Early Learning Centre', 'childcare_centre', '45 Chapel Road, Bankstown NSW 2200', -33.9175, 151.0350, 'Jessica Park', '0299001111', 'jessica@littlestars.com.au', 'Centre Director', 25, '["3-4", "4-5"]'::jsonb, 'centre_funded', 165.00, 'active'),
  ('aaaa1111-0000-0000-0000-000000000002', 'Bright Beginnings Childcare', 'childcare_centre', '12 Restwell Street, Bankstown NSW 2200', -33.9190, 151.0370, 'Priya Sharma', '0299002222', 'priya@brightbeginnings.com.au', 'Assistant Director', 20, '["2-3", "3-4", "4-5"]'::jsonb, 'centre_funded', 170.00, 'active'),
  ('aaaa1111-0000-0000-0000-000000000003', 'Sunshine Kids Academy', 'childcare_centre', '88 Hume Highway, Bass Hill NSW 2197', -33.9020, 151.0130, 'Michael Tran', '0299003333', 'michael@sunshinekids.com.au', 'Owner', 30, '["3-4", "4-5", "5-6"]'::jsonb, 'parent_funded', 10.00, 'active'),
  ('aaaa1111-0000-0000-0000-000000000004', 'Bankstown Public School', 'school', '1 Brancourt Avenue, Bankstown NSW 2200', -33.9165, 151.0340, 'David Wilson', '0299004444', 'david.wilson@det.nsw.edu.au', 'PE Coordinator', 28, '["5-7", "8-10", "11-12"]'::jsonb, 'per_head', 5.00, 'active'),
  ('aaaa1111-0000-0000-0000-000000000005', 'Liverpool West Primary', 'school', '55 Hoxton Park Road, Liverpool NSW 2170', -33.9290, 150.9230, 'Karen O''Brien', '0299005555', 'karen.obrien@det.nsw.edu.au', 'Sports Coordinator', 32, '["5-7", "8-10"]'::jsonb, 'per_head', 5.00, 'trial');

-- ========================
-- 4. Centre notes
-- ========================
INSERT INTO centre_notes (centre_id, category, content, created_by) VALUES
  ('aaaa1111-0000-0000-0000-000000000001', 'access_logistics', 'Enter via the back gate on Chapel Road. Buzz intercom and ask for Jessica.', '22222222-2222-2222-2222-222222222222'),
  ('aaaa1111-0000-0000-0000-000000000001', 'general', 'Very engaged centre — kids love soccer and multi-sport sessions.', '22222222-2222-2222-2222-222222222222'),
  ('aaaa1111-0000-0000-0000-000000000004', 'safety', 'Outdoor area can be slippery after rain. Use indoor hall as backup.', '22222222-2222-2222-2222-222222222222');

-- ========================
-- 5. Term (1 active)
-- ========================
INSERT INTO terms (id, name, start_date, end_date, year, status) VALUES
  ('bbbb1111-0000-0000-0000-000000000001', 'Term 1 2026', '2026-01-28', '2026-04-09', 2026, 'active');

-- ========================
-- 6. Term templates (weekly recurring sessions)
-- ========================
INSERT INTO term_templates (term_id, day_of_week, time, duration_minutes, centre_id, sport, default_coach_id) VALUES
  ('bbbb1111-0000-0000-0000-000000000001', 1, '09:30', 45, 'aaaa1111-0000-0000-0000-000000000001', 'Multi-Sport', '33333333-3333-3333-3333-333333333333'),
  ('bbbb1111-0000-0000-0000-000000000001', 1, '10:30', 45, 'aaaa1111-0000-0000-0000-000000000002', 'Soccer', '33333333-3333-3333-3333-333333333333'),
  ('bbbb1111-0000-0000-0000-000000000001', 2, '09:00', 45, 'aaaa1111-0000-0000-0000-000000000003', 'Basketball', '44444444-4444-4444-4444-444444444444'),
  ('bbbb1111-0000-0000-0000-000000000001', 3, '12:30', 60, 'aaaa1111-0000-0000-0000-000000000004', 'Athletics', '44444444-4444-4444-4444-444444444444'),
  ('bbbb1111-0000-0000-0000-000000000001', 4, '11:00', 60, 'aaaa1111-0000-0000-0000-000000000005', 'Soccer', '33333333-3333-3333-3333-333333333333');

-- ========================
-- 7. Equipment kits (2 kits with items)
-- ========================
INSERT INTO equipment_kits (id, name, location_type, location_id, condition) VALUES
  ('cccc1111-0000-0000-0000-000000000001', 'Multi-Sport Kit A', 'coach', '33333333-3333-3333-3333-333333333333', 'good'),
  ('cccc1111-0000-0000-0000-000000000002', 'Basketball Kit B', 'storage', NULL, 'good');

INSERT INTO equipment_items (kit_id, item_type, quantity, condition) VALUES
  ('cccc1111-0000-0000-0000-000000000001', 'Soccer balls (size 3)', 6, 'good'),
  ('cccc1111-0000-0000-0000-000000000001', 'Cones', 20, 'good'),
  ('cccc1111-0000-0000-0000-000000000001', 'Bibs (set of 10)', 2, 'fair'),
  ('cccc1111-0000-0000-0000-000000000001', 'Skipping ropes', 10, 'good'),
  ('cccc1111-0000-0000-0000-000000000002', 'Basketballs (size 5)', 8, 'good'),
  ('cccc1111-0000-0000-0000-000000000002', 'Cones', 15, 'good'),
  ('cccc1111-0000-0000-0000-000000000002', 'Whistle', 2, 'good');

-- ========================
-- 8. Default form templates (5)
-- ========================
INSERT INTO form_templates (name, form_type, fields_json, is_default, created_by) VALUES
  ('Attendance Roll', 'attendance', '[
    {"id": "headcount", "type": "number", "label": "Number of children", "required": true},
    {"id": "absentees", "type": "textarea", "label": "Absent children (if known)", "required": false},
    {"id": "notes", "type": "textarea", "label": "Notes", "required": false}
  ]'::jsonb, true, '22222222-2222-2222-2222-222222222222'),

  ('Incident Report', 'incident', '[
    {"id": "child_name", "type": "text", "label": "Child name", "required": true},
    {"id": "incident_time", "type": "time", "label": "Time of incident", "required": true},
    {"id": "description", "type": "textarea", "label": "Description of incident", "required": true},
    {"id": "action_taken", "type": "textarea", "label": "Action taken", "required": true},
    {"id": "parent_notified", "type": "checkbox", "label": "Parent/guardian notified", "required": false},
    {"id": "severity", "type": "select", "label": "Severity", "required": true, "options": ["Minor", "Moderate", "Serious"]},
    {"id": "photos", "type": "file", "label": "Photos (if applicable)", "required": false}
  ]'::jsonb, true, '22222222-2222-2222-2222-222222222222'),

  ('Session Feedback', 'session_feedback', '[
    {"id": "engagement_rating", "type": "number", "label": "Engagement rating (1-5)", "required": true},
    {"id": "highlights", "type": "textarea", "label": "Session highlights", "required": false},
    {"id": "challenges", "type": "textarea", "label": "Challenges", "required": false},
    {"id": "observations", "type": "textarea", "label": "Observations about specific children", "required": false}
  ]'::jsonb, true, '22222222-2222-2222-2222-222222222222'),

  ('Risk Assessment', 'risk_assessment', '[
    {"id": "venue_condition", "type": "select", "label": "Venue condition", "required": true, "options": ["Good", "Acceptable", "Poor — alternate plan needed"]},
    {"id": "weather", "type": "select", "label": "Weather conditions", "required": true, "options": ["Clear", "Hot (30+)", "Wet", "Windy", "Storm warning"]},
    {"id": "hazards_identified", "type": "textarea", "label": "Hazards identified", "required": false},
    {"id": "mitigations", "type": "textarea", "label": "Mitigations applied", "required": false},
    {"id": "first_aid_kit", "type": "checkbox", "label": "First aid kit present", "required": true}
  ]'::jsonb, true, '22222222-2222-2222-2222-222222222222'),

  ('Compliance Check', 'compliance', '[
    {"id": "wwcc_sighted", "type": "checkbox", "label": "WWCC sighted and valid", "required": true},
    {"id": "first_aid_current", "type": "checkbox", "label": "First aid certificate current", "required": true},
    {"id": "insurance_valid", "type": "checkbox", "label": "Insurance valid", "required": true},
    {"id": "notes", "type": "textarea", "label": "Additional notes", "required": false}
  ]'::jsonb, true, '22222222-2222-2222-2222-222222222222');
