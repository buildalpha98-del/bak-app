-- ============================================================
-- Migration 040: Native Invoicing System (replace QuickBooks)
-- ============================================================

-- 1. New enum for invoice payment method
CREATE TYPE invoice_payment_method AS ENUM ('bank_transfer', 'square_online', 'other');

-- 2. Enhanced outbound_invoice_status (add partially_paid, overdue, void)
-- Drop default first, convert to text, drop old enum, recreate, convert back, restore default
ALTER TABLE outbound_invoices ALTER COLUMN status DROP DEFAULT;
ALTER TABLE outbound_invoices ALTER COLUMN status TYPE text;
DROP TYPE IF EXISTS outbound_invoice_status;
CREATE TYPE outbound_invoice_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'sent', 'partially_paid', 'paid', 'overdue', 'void'
);
ALTER TABLE outbound_invoices ALTER COLUMN status TYPE outbound_invoice_status USING status::outbound_invoice_status;
ALTER TABLE outbound_invoices ALTER COLUMN status SET DEFAULT 'draft';

-- 3. Drop QuickBooks columns
ALTER TABLE outbound_invoices DROP COLUMN IF EXISTS qb_invoice_id;
ALTER TABLE centres DROP COLUMN IF EXISTS qb_customer_id;

-- 4. Add enhanced columns to outbound_invoices
ALTER TABLE outbound_invoices
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_method invoice_payment_method,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS gst_amount_cents integer,
  ADD COLUMN IF NOT EXISTS subtotal_cents integer,
  ADD COLUMN IF NOT EXISTS total_cents integer,
  ADD COLUMN IF NOT EXISTS payment_history jsonb DEFAULT '[]'::jsonb;

-- Set defaults for due_date on existing records
UPDATE outbound_invoices
SET due_date = (created_at::date + interval '14 days')::date
WHERE due_date IS NULL;

-- Backfill subtotal_cents and total_cents from the amount column (dollars → cents)
UPDATE outbound_invoices
SET subtotal_cents = (amount * 100)::integer,
    total_cents = (amount * 100)::integer
WHERE subtotal_cents IS NULL;

-- 5. Business settings table (key-value store for invoicing config)
CREATE TABLE IF NOT EXISTS business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage business settings"
  ON business_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed default business settings
INSERT INTO business_settings (key, value) VALUES
  ('business_name', '"Build Alpha Kids"'),
  ('abn', '""'),
  ('business_address', '"South-West Sydney, NSW"'),
  ('business_phone', '""'),
  ('business_email', '"info@buildalphakids.com.au"'),
  ('bank_name', '""'),
  ('bank_bsb', '""'),
  ('bank_account_number', '""'),
  ('bank_account_name', '"Build Alpha Kids"'),
  ('payment_terms_text', '"Payment due within 14 days"'),
  ('payment_terms_days', '14'),
  ('gst_enabled', 'true'),
  ('gst_inclusive', 'false'),
  ('gst_rate', '10'),
  ('square_online_enabled', 'false'),
  ('square_payment_url', '""')
ON CONFLICT (key) DO NOTHING;

-- 6. Drop QuickBooks integration_tokens table (no longer needed)
DROP TABLE IF EXISTS integration_tokens;
