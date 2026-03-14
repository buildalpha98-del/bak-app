-- ============================================================
-- Migration 007: Indexes on foreign keys and common queries
-- ============================================================

-- pay_rates
CREATE INDEX idx_pay_rates_user_id ON pay_rates(user_id);
CREATE INDEX idx_pay_rates_session_type ON pay_rates(session_type);

-- compliance_docs
CREATE INDEX idx_compliance_docs_user_id ON compliance_docs(user_id);
CREATE INDEX idx_compliance_docs_status ON compliance_docs(status);
CREATE INDEX idx_compliance_docs_expiry ON compliance_docs(expiry_date);

-- availability_slots
CREATE INDEX idx_availability_user_id ON availability_slots(user_id);
CREATE INDEX idx_availability_day ON availability_slots(day_of_week);

-- centres
CREATE INDEX idx_centres_type ON centres(type);
CREATE INDEX idx_centres_contract_status ON centres(contract_status);

-- centre_notes
CREATE INDEX idx_centre_notes_centre_id ON centre_notes(centre_id);

-- terms
CREATE INDEX idx_terms_status ON terms(status);
CREATE INDEX idx_terms_year ON terms(year);

-- term_templates
CREATE INDEX idx_term_templates_term_id ON term_templates(term_id);
CREATE INDEX idx_term_templates_centre_id ON term_templates(centre_id);
CREATE INDEX idx_term_templates_coach_id ON term_templates(default_coach_id);

-- sessions
CREATE INDEX idx_sessions_term_id ON sessions(term_id);
CREATE INDEX idx_sessions_centre_id ON sessions(centre_id);
CREATE INDEX idx_sessions_coach_id ON sessions(coach_id);
CREATE INDEX idx_sessions_date ON sessions(date);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_template_id ON sessions(template_id);
CREATE INDEX idx_sessions_program_id ON sessions(program_id);
CREATE INDEX idx_sessions_kit_id ON sessions(equipment_kit_id);

-- swap_requests
CREATE INDEX idx_swaps_session_id ON swap_requests(session_id);
CREATE INDEX idx_swaps_requesting_coach ON swap_requests(requesting_coach_id);
CREATE INDEX idx_swaps_proposed_coach ON swap_requests(proposed_coach_id);
CREATE INDEX idx_swaps_status ON swap_requests(status);

-- programs
CREATE INDEX idx_programs_sport ON programs(sport);
CREATE INDEX idx_programs_created_by ON programs(created_by);
CREATE INDEX idx_programs_parent_version ON programs(parent_version_id);

-- equipment_kits
CREATE INDEX idx_kits_location ON equipment_kits(location_type, location_id);

-- equipment_items
CREATE INDEX idx_equip_items_kit_id ON equipment_items(kit_id);

-- equipment_logs
CREATE INDEX idx_equip_logs_kit_id ON equipment_logs(kit_id);
CREATE INDEX idx_equip_logs_user_id ON equipment_logs(user_id);

-- form_templates
CREATE INDEX idx_form_templates_type ON form_templates(form_type);
CREATE INDEX idx_form_templates_centre_id ON form_templates(centre_id);

-- form_submissions
CREATE INDEX idx_form_subs_template_id ON form_submissions(form_template_id);
CREATE INDEX idx_form_subs_session_id ON form_submissions(session_id);
CREATE INDEX idx_form_subs_submitted_by ON form_submissions(submitted_by);

-- coach_invoices
CREATE INDEX idx_coach_invoices_coach_id ON coach_invoices(coach_id);
CREATE INDEX idx_coach_invoices_status ON coach_invoices(status);
CREATE INDEX idx_coach_invoices_period ON coach_invoices(period_start, period_end);

-- outbound_invoices
CREATE INDEX idx_outbound_invoices_centre_id ON outbound_invoices(centre_id);
CREATE INDEX idx_outbound_invoices_status ON outbound_invoices(status);

-- announcements
CREATE INDEX idx_announcements_audience ON announcements(audience);
CREATE INDEX idx_announcements_created_at ON announcements(created_at DESC);

-- announcement_reads
CREATE INDEX idx_reads_announcement_id ON announcement_reads(announcement_id);
CREATE INDEX idx_reads_user_id ON announcement_reads(user_id);

-- shift_threads
CREATE INDEX idx_threads_session_id ON shift_threads(session_id);

-- direct_messages
CREATE INDEX idx_dms_sender ON direct_messages(sender_id);
CREATE INDEX idx_dms_recipient ON direct_messages(recipient_id);
CREATE INDEX idx_dms_created_at ON direct_messages(created_at DESC);

-- documents
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_visibility ON documents(visibility);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);

-- tasks
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_linked_entity ON tasks(linked_entity_type, linked_entity_id);

-- feedback_ratings
CREATE INDEX idx_feedback_session_id ON feedback_ratings(session_id);
CREATE INDEX idx_feedback_centre_id ON feedback_ratings(centre_id);
CREATE INDEX idx_feedback_token ON feedback_ratings(feedback_token);

-- notification_preferences
CREATE INDEX idx_notif_prefs_user_id ON notification_preferences(user_id);

-- activity_log
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
