-- ============================================================
-- 044: Payment Batches — admin-initiated batch payroll
-- Extends coach_invoices with batch processing
-- ============================================================

-- 1. Payment batches table (one per fortnightly period)
CREATE TABLE payment_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  status         text NOT NULL DEFAULT 'calculating'
                 CHECK (status IN ('calculating', 'calculated', 'approved', 'paid', 'closed')),
  created_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  calculated_at  timestamptz,
  approved_at    timestamptz,
  paid_at        timestamptz,
  total_amount   numeric(10,2) NOT NULL DEFAULT 0,
  coach_count    integer NOT NULL DEFAULT 0,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_start, period_end)
);

CREATE INDEX idx_payment_batches_status ON payment_batches(status);
CREATE INDEX idx_payment_batches_period ON payment_batches(period_start DESC, period_end DESC);

-- 2. Extend coach_invoices with batch processing fields
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS initiated_by_role text DEFAULT 'coach'
  CHECK (initiated_by_role IN ('coach', 'admin'));
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS payment_batch_id uuid REFERENCES payment_batches(id) ON DELETE SET NULL;
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('bank_transfer', 'other'));
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS adjustments numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS adjustment_reason text;
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS generated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coach_invoices_batch ON coach_invoices(payment_batch_id);

-- 3. RLS — payment_batches
ALTER TABLE payment_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_batches_admin_all ON payment_batches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY payment_batches_ops_read ON payment_batches
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ops'));

CREATE POLICY payment_batches_coach_read_own ON payment_batches
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM coach_invoices
    WHERE coach_invoices.payment_batch_id = payment_batches.id
      AND coach_invoices.coach_id = auth.uid()
  ));
