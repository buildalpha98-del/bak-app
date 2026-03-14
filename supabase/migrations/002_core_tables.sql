-- ============================================================
-- Migration 002: Core tables — profiles, pay_rates, compliance,
--   availability, centres, centre_notes, terms, term_templates
-- ============================================================

-- 1. profiles (extends auth.users)
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  name        text NOT NULL,
  phone       text,
  address     text,
  date_of_birth date,
  emergency_contact_name  text,
  emergency_contact_phone text,
  photo_url   text,
  abn         text,
  role        user_role NOT NULL DEFAULT 'coach',
  default_pay_rate decimal(10,2),
  status      user_status NOT NULL DEFAULT 'onboarding',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Helper: get user role from JWT (needs profiles table)
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. pay_rates
CREATE TABLE pay_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_type   varchar(50) NOT NULL,
  rate           decimal(10,2) NOT NULL,
  rate_unit      rate_unit NOT NULL DEFAULT 'per_session',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3. compliance_docs
CREATE TABLE compliance_docs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doc_type    compliance_doc_type NOT NULL,
  doc_number  text,
  expiry_date date,
  file_url    text,
  file_name   text,
  status      compliance_status NOT NULL DEFAULT 'pending',
  verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER compliance_docs_updated_at
  BEFORE UPDATE ON compliance_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. availability_slots
CREATE TABLE availability_slots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week          int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time           time NOT NULL,
  end_time             time NOT NULL,
  location_preferences jsonb DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

-- 5. centres
CREATE TABLE centres (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  type                   centre_type NOT NULL,
  address                text,
  latitude               decimal(10,7),
  longitude              decimal(10,7),
  primary_contact_name   text,
  primary_contact_phone  text,
  primary_contact_email  text,
  primary_contact_role   text,
  group_size             int,
  age_groups             jsonb DEFAULT '[]'::jsonb,
  pricing_model          pricing_model NOT NULL DEFAULT 'centre_funded',
  agreed_rate            decimal(10,2),
  session_preferences    jsonb DEFAULT '{}'::jsonb,
  contract_status        contract_status NOT NULL DEFAULT 'trial',
  status_changed_at      timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER centres_updated_at
  BEFORE UPDATE ON centres
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. centre_notes
CREATE TABLE centre_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id  uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  category   centre_note_category NOT NULL DEFAULT 'general',
  content    text NOT NULL,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. terms
CREATE TABLE terms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  year       int NOT NULL,
  status     term_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_term_dates CHECK (start_date < end_date)
);

-- 8. term_templates
CREATE TABLE term_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id          uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  day_of_week      int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time             time NOT NULL,
  duration_minutes int NOT NULL DEFAULT 45,
  centre_id        uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  sport            varchar(100) NOT NULL,
  default_coach_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
