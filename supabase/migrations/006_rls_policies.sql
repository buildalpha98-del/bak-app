-- ============================================================
-- Migration 006: Row Level Security policies
-- Roles: admin (full), ops (operational), coach (own data)
-- activity_log has NO RLS (admin-read via service role only)
-- ============================================================

-- Enable RLS on all tables except activity_log
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE centre_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- ========================
-- PROFILES
-- ========================
CREATE POLICY "admin_full_profiles" ON profiles
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_profiles" ON profiles
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "coach_update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ========================
-- PAY_RATES
-- ========================
CREATE POLICY "admin_full_pay_rates" ON pay_rates
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_pay_rates" ON pay_rates
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_own_pay_rates" ON pay_rates
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "coach_write_own_pay_rates" ON pay_rates
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "coach_update_own_pay_rates" ON pay_rates
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========================
-- COMPLIANCE_DOCS
-- ========================
CREATE POLICY "admin_full_compliance" ON compliance_docs
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_compliance" ON compliance_docs
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_own_compliance" ON compliance_docs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "coach_insert_own_compliance" ON compliance_docs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "coach_update_own_compliance" ON compliance_docs
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========================
-- AVAILABILITY_SLOTS
-- ========================
CREATE POLICY "admin_full_availability" ON availability_slots
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_availability" ON availability_slots
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_own_availability" ON availability_slots
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========================
-- CENTRES (coaches: read non-financial fields only handled at app layer)
-- ========================
CREATE POLICY "admin_full_centres" ON centres
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_centres" ON centres
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_centres" ON centres
  FOR SELECT USING (auth_user_role() = 'coach');

-- ========================
-- CENTRE_NOTES
-- ========================
CREATE POLICY "admin_full_centre_notes" ON centre_notes
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_centre_notes" ON centre_notes
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_centre_notes" ON centre_notes
  FOR SELECT USING (auth_user_role() = 'coach');

-- ========================
-- TERMS
-- ========================
CREATE POLICY "admin_full_terms" ON terms
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_terms" ON terms
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_terms" ON terms
  FOR SELECT USING (auth_user_role() = 'coach');

-- ========================
-- TERM_TEMPLATES
-- ========================
CREATE POLICY "admin_full_term_templates" ON term_templates
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_term_templates" ON term_templates
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_term_templates" ON term_templates
  FOR SELECT USING (auth_user_role() = 'coach');

-- ========================
-- SESSIONS
-- ========================
CREATE POLICY "admin_full_sessions" ON sessions
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_sessions" ON sessions
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_own_sessions" ON sessions
  FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "coach_update_own_sessions" ON sessions
  FOR UPDATE USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- ========================
-- SWAP_REQUESTS
-- ========================
CREATE POLICY "admin_full_swaps" ON swap_requests
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_swaps" ON swap_requests
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_own_swaps" ON swap_requests
  FOR SELECT USING (requesting_coach_id = auth.uid() OR proposed_coach_id = auth.uid());

CREATE POLICY "coach_insert_swaps" ON swap_requests
  FOR INSERT WITH CHECK (requesting_coach_id = auth.uid());

CREATE POLICY "coach_update_own_swaps" ON swap_requests
  FOR UPDATE USING (proposed_coach_id = auth.uid())
  WITH CHECK (proposed_coach_id = auth.uid());

-- ========================
-- PROGRAMS
-- ========================
CREATE POLICY "admin_full_programs" ON programs
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_programs" ON programs
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_assigned_programs" ON programs
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND (
      created_by = auth.uid()
      OR id IN (SELECT program_id FROM sessions WHERE coach_id = auth.uid() AND program_id IS NOT NULL)
    )
  );

-- ========================
-- EQUIPMENT_KITS
-- ========================
CREATE POLICY "admin_full_kits" ON equipment_kits
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_kits" ON equipment_kits
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_kits" ON equipment_kits
  FOR SELECT USING (auth_user_role() = 'coach');

CREATE POLICY "coach_update_assigned_kits" ON equipment_kits
  FOR UPDATE USING (location_type = 'coach' AND location_id = auth.uid())
  WITH CHECK (location_type = 'coach' AND location_id = auth.uid());

-- ========================
-- EQUIPMENT_ITEMS
-- ========================
CREATE POLICY "admin_full_items" ON equipment_items
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_items" ON equipment_items
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_items" ON equipment_items
  FOR SELECT USING (auth_user_role() = 'coach');

-- ========================
-- EQUIPMENT_LOGS
-- ========================
CREATE POLICY "admin_full_equip_logs" ON equipment_logs
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_equip_logs" ON equipment_logs
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_own_equip_logs" ON equipment_logs
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========================
-- FORM_TEMPLATES
-- ========================
CREATE POLICY "admin_full_form_templates" ON form_templates
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_form_templates" ON form_templates
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_form_templates" ON form_templates
  FOR SELECT USING (auth_user_role() = 'coach');

-- ========================
-- FORM_SUBMISSIONS
-- ========================
CREATE POLICY "admin_full_form_submissions" ON form_submissions
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_form_submissions" ON form_submissions
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_own_form_submissions" ON form_submissions
  FOR ALL USING (submitted_by = auth.uid())
  WITH CHECK (submitted_by = auth.uid());

-- ========================
-- COACH_INVOICES
-- ========================
CREATE POLICY "admin_full_coach_invoices" ON coach_invoices
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_coach_invoices" ON coach_invoices
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_own_invoices" ON coach_invoices
  FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "coach_update_own_invoices" ON coach_invoices
  FOR UPDATE USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- ========================
-- OUTBOUND_INVOICES
-- ========================
CREATE POLICY "admin_full_outbound_invoices" ON outbound_invoices
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_outbound_invoices" ON outbound_invoices
  FOR ALL USING (auth_user_role() = 'ops');

-- ========================
-- ANNOUNCEMENTS
-- ========================
CREATE POLICY "admin_full_announcements" ON announcements
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_announcements" ON announcements
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_announcements" ON announcements
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND audience IN ('all', 'coaches_only')
  );

-- ========================
-- ANNOUNCEMENT_READS
-- ========================
CREATE POLICY "admin_full_reads" ON announcement_reads
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_reads" ON announcement_reads
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_own_reads" ON announcement_reads
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========================
-- SHIFT_THREADS
-- ========================
CREATE POLICY "admin_full_threads" ON shift_threads
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_threads" ON shift_threads
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_threads_on_own_sessions" ON shift_threads
  FOR ALL USING (
    session_id IN (SELECT id FROM sessions WHERE coach_id = auth.uid())
  )
  WITH CHECK (user_id = auth.uid());

-- ========================
-- DIRECT_MESSAGES
-- ========================
CREATE POLICY "admin_full_dms" ON direct_messages
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_dms" ON direct_messages
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_own_dms" ON direct_messages
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "coach_send_dms" ON direct_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "coach_read_receipt_dms" ON direct_messages
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ========================
-- DOCUMENTS
-- ========================
CREATE POLICY "admin_full_documents" ON documents
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_read_documents" ON documents
  FOR SELECT USING (
    auth_user_role() = 'ops'
    AND visibility IN ('all', 'admin_ops')
  );

CREATE POLICY "ops_write_documents" ON documents
  FOR INSERT WITH CHECK (auth_user_role() = 'ops');

CREATE POLICY "coach_read_documents" ON documents
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND visibility = 'all'
  );

-- ========================
-- TASKS
-- ========================
CREATE POLICY "admin_full_tasks" ON tasks
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_tasks" ON tasks
  FOR ALL USING (auth_user_role() = 'ops');

CREATE POLICY "coach_read_assigned_tasks" ON tasks
  FOR SELECT USING (assignee_id = auth.uid());

CREATE POLICY "coach_update_assigned_tasks" ON tasks
  FOR UPDATE USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

-- ========================
-- FEEDBACK_RATINGS (public insert via token, read for admin/ops)
-- ========================
CREATE POLICY "admin_full_feedback" ON feedback_ratings
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_full_feedback" ON feedback_ratings
  FOR ALL USING (auth_user_role() = 'ops');

-- Allow anonymous insert for public feedback link (handled via service role in API)

-- ========================
-- NOTIFICATION_PREFERENCES
-- ========================
CREATE POLICY "admin_full_notif_prefs" ON notification_preferences
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "ops_read_notif_prefs" ON notification_preferences
  FOR SELECT USING (auth_user_role() = 'ops');

CREATE POLICY "coach_own_notif_prefs" ON notification_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
