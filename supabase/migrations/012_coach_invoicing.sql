-- ============================================================
-- 012: Coach Invoicing Enhancements
-- ============================================================

-- Add GST registration flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT false;

-- Add human-readable invoice number to coach_invoices
ALTER TABLE coach_invoices ADD COLUMN IF NOT EXISTS invoice_number varchar(30) UNIQUE;

-- Allow coaches to INSERT their own invoices (SELECT + UPDATE already exist)
CREATE POLICY "coach_insert_own_invoices" ON coach_invoices
  FOR INSERT WITH CHECK (coach_id = auth.uid());
