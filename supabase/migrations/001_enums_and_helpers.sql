-- ============================================================
-- Migration 001: Custom enums, helper functions, and triggers
-- ============================================================

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'ops', 'coach');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'onboarding');
CREATE TYPE rate_unit AS ENUM ('per_session', 'per_hour');
CREATE TYPE compliance_doc_type AS ENUM ('wwcc', 'first_aid', 'police_check', 'insurance', 'coaching_cert', 'code_of_conduct', 'policy_ack', 'other');
CREATE TYPE compliance_status AS ENUM ('pending', 'verified', 'expired', 'rejected');
CREATE TYPE centre_type AS ENUM ('childcare_centre', 'school');
CREATE TYPE pricing_model AS ENUM ('centre_funded', 'parent_funded', 'per_head');
CREATE TYPE contract_status AS ENUM ('active', 'trial', 'paused', 'churned');
CREATE TYPE centre_note_category AS ENUM ('general', 'access_logistics', 'safety', 'client_relationship');
CREATE TYPE term_status AS ENUM ('draft', 'active', 'completed');
CREATE TYPE session_status AS ENUM ('draft', 'published', 'pending_confirmation', 'confirmed', 'in_progress', 'completed', 'cancelled');
CREATE TYPE swap_status AS ENUM ('pending_coach', 'pending_ops', 'approved', 'rejected', 'cancelled');
CREATE TYPE equipment_location_type AS ENUM ('coach', 'centre', 'storage');
CREATE TYPE equipment_condition AS ENUM ('good', 'needs_attention', 'needs_replacement');
CREATE TYPE item_condition AS ENUM ('good', 'fair', 'poor', 'missing');
CREATE TYPE equipment_action AS ENUM ('check_out', 'check_in', 'issue_flagged', 'created', 'updated');
CREATE TYPE coach_invoice_status AS ENUM ('draft', 'flagged', 'ready', 'sent', 'paid');
CREATE TYPE outbound_invoice_status AS ENUM ('draft', 'pending_approval', 'approved', 'sent', 'paid');
CREATE TYPE announcement_audience AS ENUM ('all', 'ops_and_coaches', 'coaches_only');
CREATE TYPE document_category AS ENUM ('program', 'policy', 'risk_assessment', 'onboarding', 'centre_doc', 'compliance', 'template', 'other');
CREATE TYPE document_visibility AS ENUM ('all', 'admin_ops', 'admin_only');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE notification_channel AS ENUM ('push', 'email', 'in_app', 'none');

-- Helper: auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- NOTE: auth_user_role() is created in 002_core_tables.sql after profiles table exists
