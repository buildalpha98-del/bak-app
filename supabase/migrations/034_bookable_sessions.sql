-- ============================================================
-- 034: Bookable Sessions & Waitlist — parent booking backend
-- ============================================================

-- 1. Enum additions
CREATE TYPE bookable_session_type AS ENUM (
  'holiday_clinic', 'after_school', 'weekend', 'specialist', 'other'
);

CREATE TYPE bookable_session_status AS ENUM (
  'draft', 'open', 'closed', 'cancelled', 'completed'
);

CREATE TYPE waitlist_status AS ENUM (
  'waiting', 'offered', 'accepted', 'expired', 'cancelled'
);

-- 2. bookable_sessions table
CREATE TABLE bookable_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid REFERENCES sessions(id) ON DELETE SET NULL,
  title             text NOT NULL,
  description       text,
  session_type      bookable_session_type NOT NULL DEFAULT 'other',
  date              date NOT NULL,
  start_time        time NOT NULL,
  end_time          time NOT NULL,
  location_name     text,
  location_address  text NOT NULL,
  suburb            text NOT NULL,
  sport             text,
  age_group_min     int,
  age_group_max     int,
  max_capacity      int NOT NULL,
  current_bookings  int NOT NULL DEFAULT 0,
  price_cents       int NOT NULL,
  package_eligible  boolean NOT NULL DEFAULT true,
  coach_id          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status            bookable_session_status NOT NULL DEFAULT 'draft',
  booking_opens_at  timestamptz,
  booking_closes_at timestamptz,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookable_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bookable_sessions_status ON bookable_sessions(status);
CREATE INDEX idx_bookable_sessions_date ON bookable_sessions(date);
CREATE INDEX idx_bookable_sessions_suburb ON bookable_sessions(suburb);
CREATE INDEX idx_bookable_sessions_sport ON bookable_sessions(sport);
CREATE INDEX idx_bookable_sessions_session ON bookable_sessions(session_id);

CREATE TRIGGER bookable_sessions_updated_at
  BEFORE UPDATE ON bookable_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. waitlist table
CREATE TABLE waitlist (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookable_session_id  uuid NOT NULL REFERENCES bookable_sessions(id) ON DELETE CASCADE,
  parent_id            uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  child_id             uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  position             int NOT NULL,
  status               waitlist_status NOT NULL DEFAULT 'waiting',
  offered_at           timestamptz,
  offer_expires_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_waitlist_session ON waitlist(bookable_session_id);
CREATE INDEX idx_waitlist_parent ON waitlist(parent_id);
CREATE INDEX idx_waitlist_status ON waitlist(status);
CREATE INDEX idx_waitlist_offer_expires ON waitlist(offer_expires_at) WHERE status = 'offered';

-- ============================================================
-- 4. RLS Policies
-- ============================================================

-- bookable_sessions: parents can read open sessions
CREATE POLICY "Parents can view open bookable sessions"
  ON bookable_sessions FOR SELECT
  USING (
    status = 'open'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );

-- bookable_sessions: admin/ops full CRUD
CREATE POLICY "Admin and ops full access to bookable_sessions"
  ON bookable_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );

-- waitlist: parents can read/insert/delete own waitlist entries
CREATE POLICY "Parents can view own waitlist entries"
  ON waitlist FOR SELECT
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can join waitlist"
  ON waitlist FOR INSERT
  WITH CHECK (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can cancel own waitlist entries"
  ON waitlist FOR UPDATE
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

-- waitlist: admin/ops full access
CREATE POLICY "Admin and ops full access to waitlist"
  ON waitlist FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );
