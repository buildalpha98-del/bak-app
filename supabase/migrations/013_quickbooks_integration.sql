-- 013_quickbooks_integration.sql
-- QuickBooks Online integration: tokens, centre QB mapping, outbound invoice enhancements

-- ========================
-- integration_tokens table
-- ========================
CREATE TABLE integration_tokens (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                varchar(50) NOT NULL,
  access_token_encrypted  text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  realm_id                varchar(100),
  token_expiry            timestamptz NOT NULL,
  company_name            text,
  connected_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  connected_at            timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER integration_tokens_updated_at
  BEFORE UPDATE ON integration_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: admin-only
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_integration_tokens" ON integration_tokens
  FOR ALL USING (auth_user_role() = 'admin');

-- Unique constraint: one connection per provider
CREATE UNIQUE INDEX idx_integration_tokens_provider ON integration_tokens(provider);

-- ========================
-- centres: add qb_customer_id
-- ========================
ALTER TABLE centres ADD COLUMN qb_customer_id varchar(100);

-- ========================
-- outbound_invoices: add invoice_number and created_by
-- ========================
ALTER TABLE outbound_invoices ADD COLUMN invoice_number varchar(50);
ALTER TABLE outbound_invoices ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE outbound_invoices ADD CONSTRAINT outbound_invoices_invoice_number_unique UNIQUE (invoice_number);

-- ========================
-- Atomic invoice number generation function
-- ========================
CREATE OR REPLACE FUNCTION next_outbound_invoice_number(year_month text)
RETURNS text AS $$
DECLARE
  next_seq int;
  inv_number text;
BEGIN
  -- Advisory lock prevents concurrent calls from generating duplicate numbers
  PERFORM pg_advisory_xact_lock(hashtext('outbound_inv_' || year_month));

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS int)
  ), 0) + 1
  INTO next_seq
  FROM outbound_invoices
  WHERE invoice_number LIKE 'BAK-OUT-' || year_month || '-%';

  inv_number := 'BAK-OUT-' || year_month || '-' || LPAD(next_seq::text, 3, '0');
  RETURN inv_number;
END;
$$ LANGUAGE plpgsql;
