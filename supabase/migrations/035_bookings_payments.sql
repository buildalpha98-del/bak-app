-- ============================================================
-- 035: Bookings, Payments & Packages — parent booking + Square
-- ============================================================

-- 1. Enum additions
CREATE TYPE package_status AS ENUM ('active', 'inactive');
CREATE TYPE package_balance_status AS ENUM ('active', 'expired', 'used_up');
CREATE TYPE booking_status AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'refunded', 'no_show');
CREATE TYPE booking_payment_type AS ENUM ('single_payment', 'package_redemption');
CREATE TYPE payment_type AS ENUM ('session_booking', 'package_purchase');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- 2. packages table
CREATE TABLE packages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  description             text,
  session_count           int NOT NULL,
  price_cents             int NOT NULL,
  savings_cents           int NOT NULL DEFAULT 0,
  valid_days              int NOT NULL DEFAULT 90,
  applicable_session_types jsonb,  -- null = all types
  status                  package_status NOT NULL DEFAULT 'active',
  created_by              uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_packages_status ON packages(status);

-- 3. payments table (created before bookings since bookings references it)
CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id             uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  amount_cents          int NOT NULL,
  payment_type          payment_type NOT NULL,
  square_payment_id     text,
  square_order_id       text,
  status                payment_status NOT NULL DEFAULT 'pending',
  refund_amount_cents   int,
  refunded_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_payments_parent ON payments(parent_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_square ON payments(square_payment_id);

-- 4. bookings table
CREATE TABLE bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookable_session_id   uuid NOT NULL REFERENCES bookable_sessions(id) ON DELETE CASCADE,
  parent_id             uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  children_json         jsonb NOT NULL DEFAULT '[]',
  payment_type          booking_payment_type NOT NULL,
  payment_id            uuid REFERENCES payments(id) ON DELETE SET NULL,
  package_balance_id    uuid,  -- FK added after package_balances table
  total_cents           int NOT NULL,
  status                booking_status NOT NULL DEFAULT 'pending_payment',
  booked_at             timestamptz NOT NULL DEFAULT now(),
  cancelled_at          timestamptz,
  cancellation_reason   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bookings_session ON bookings(bookable_session_id);
CREATE INDEX idx_bookings_parent ON bookings(parent_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_payment ON bookings(payment_id);

-- Add booking_id and package_id references to payments
ALTER TABLE payments ADD COLUMN booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN package_id uuid REFERENCES packages(id) ON DELETE SET NULL;

CREATE INDEX idx_payments_booking ON payments(booking_id);

-- 5. package_balances table
CREATE TABLE package_balances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  package_id          uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  purchased_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  total_sessions      int NOT NULL,
  remaining_sessions  int NOT NULL,
  payment_id          uuid REFERENCES payments(id) ON DELETE SET NULL,
  status              package_balance_status NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE package_balances ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_package_balances_parent ON package_balances(parent_id);
CREATE INDEX idx_package_balances_status ON package_balances(status);
CREATE INDEX idx_package_balances_expires ON package_balances(expires_at) WHERE status = 'active';

-- Add FK from bookings to package_balances
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_package_balance
  FOREIGN KEY (package_balance_id) REFERENCES package_balances(id) ON DELETE SET NULL;

-- ============================================================
-- 6. RLS Policies
-- ============================================================

-- packages: everyone can read active, admin/ops full CRUD
CREATE POLICY "Anyone can view active packages"
  ON packages FOR SELECT
  USING (status = 'active' OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')
  ));

CREATE POLICY "Admin and ops full access to packages"
  ON packages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')
  ));

-- payments: parents see own, admin/ops see all
CREATE POLICY "Parents can view own payments"
  ON payments FOR SELECT
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can create payments"
  ON payments FOR INSERT
  WITH CHECK (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin and ops full access to payments"
  ON payments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')
  ));

-- bookings: parents see own, admin/ops see all
CREATE POLICY "Parents can view own bookings"
  ON bookings FOR SELECT
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can create bookings"
  ON bookings FOR INSERT
  WITH CHECK (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can update own bookings"
  ON bookings FOR UPDATE
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin and ops full access to bookings"
  ON bookings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')
  ));

-- package_balances: parents see own, admin/ops see all
CREATE POLICY "Parents can view own package balances"
  ON package_balances FOR SELECT
  USING (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Parents can insert package balances"
  ON package_balances FOR INSERT
  WITH CHECK (parent_id IN (SELECT id FROM parent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin and ops full access to package_balances"
  ON package_balances FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')
  ));
