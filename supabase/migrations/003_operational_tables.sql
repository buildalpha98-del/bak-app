-- ============================================================
-- Migration 003: Operational tables — programs, equipment,
--   sessions, swap_requests, forms
-- ============================================================

-- 11. programs (before sessions, since sessions reference programs)
CREATE TABLE programs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport             varchar(100) NOT NULL,
  age_group         varchar(50),
  duration_minutes  int NOT NULL,
  skill_focus       text,
  content_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  equipment_used    jsonb DEFAULT '[]'::jsonb,
  parent_version_id uuid REFERENCES programs(id) ON DELETE SET NULL,
  version_number    int NOT NULL DEFAULT 1,
  created_by        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 12. equipment_kits
CREATE TABLE equipment_kits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  location_type equipment_location_type NOT NULL DEFAULT 'storage',
  location_id   uuid,
  condition     equipment_condition NOT NULL DEFAULT 'good',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER equipment_kits_updated_at
  BEFORE UPDATE ON equipment_kits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 13. equipment_items
CREATE TABLE equipment_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id     uuid NOT NULL REFERENCES equipment_kits(id) ON DELETE CASCADE,
  item_type  varchar(100) NOT NULL,
  quantity   int NOT NULL DEFAULT 1,
  condition  item_condition NOT NULL DEFAULT 'good',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER equipment_items_updated_at
  BEFORE UPDATE ON equipment_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 14. equipment_logs
CREATE TABLE equipment_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id      uuid NOT NULL REFERENCES equipment_kits(id) ON DELETE CASCADE,
  action      equipment_action NOT NULL,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notes       text,
  issues_json jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 9. sessions
CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id             uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  template_id         uuid REFERENCES term_templates(id) ON DELETE SET NULL,
  date                date NOT NULL,
  time                time NOT NULL,
  duration_minutes    int NOT NULL DEFAULT 45,
  centre_id           uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  coach_id            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sport               varchar(100) NOT NULL,
  program_id          uuid REFERENCES programs(id) ON DELETE SET NULL,
  equipment_kit_id    uuid REFERENCES equipment_kits(id) ON DELETE SET NULL,
  status              session_status NOT NULL DEFAULT 'draft',
  pay_rate_override   decimal(10,2),
  pay_rate_resolved   decimal(10,2),
  cancellation_reason text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 10. swap_requests
CREATE TABLE swap_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  requesting_coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  proposed_coach_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status              swap_status NOT NULL DEFAULT 'pending_coach',
  ops_approved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  coach_responded_at  timestamptz,
  ops_responded_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 15. form_templates
CREATE TABLE form_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  form_type   varchar(50) NOT NULL,
  fields_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default  boolean NOT NULL DEFAULT false,
  centre_id   uuid REFERENCES centres(id) ON DELETE SET NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER form_templates_updated_at
  BEFORE UPDATE ON form_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 16. form_submissions
CREATE TABLE form_submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id uuid NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  session_id       uuid REFERENCES sessions(id) ON DELETE SET NULL,
  submitted_by     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments      jsonb DEFAULT '[]'::jsonb,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  synced_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
