-- ============================================================
-- 045: Sporting Schools Grant Tracking
-- ============================================================

-- 1. Grants catalogue (different grant programmes)
CREATE TABLE grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL DEFAULT 'Sporting Schools',
  funding_body    text DEFAULT 'Australian Sports Commission',
  description     text,
  application_url text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed the default Sporting Schools grant
INSERT INTO grants (name, funding_body, description, application_url)
VALUES (
  'Sporting Schools',
  'Australian Sports Commission',
  'Australian government grant programme that funds school sports activities. Schools apply each term.',
  'https://www.sportaus.gov.au/schools'
);

-- 2. Grant applications (one per school per term)
CREATE TABLE grant_applications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id              uuid NOT NULL REFERENCES grants(id) ON DELETE RESTRICT,
  centre_id             uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  application_term      text NOT NULL,
  application_year      integer NOT NULL,
  status                text NOT NULL DEFAULT 'planning'
                        CHECK (status IN ('planning', 'submitted', 'approved', 'rejected', 'funded', 'expired')),
  amount_requested      numeric(10,2),
  amount_approved       numeric(10,2),
  amount_used           numeric(10,2) NOT NULL DEFAULT 0,
  submitted_date        date,
  approved_date         date,
  funding_start_date    date,
  funding_end_date      date,
  bak_is_provider       boolean NOT NULL DEFAULT true,
  application_reference text,
  notes                 text,
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_grant_apps_centre ON grant_applications(centre_id);
CREATE INDEX idx_grant_apps_status ON grant_applications(status);
CREATE INDEX idx_grant_apps_funding_end ON grant_applications(funding_end_date)
  WHERE status = 'funded' AND amount_used < COALESCE(amount_approved, 0);

-- 3. Link grants to outbound invoices (allocations)
CREATE TABLE grant_invoice_allocations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_application_id  uuid NOT NULL REFERENCES grant_applications(id) ON DELETE CASCADE,
  invoice_id            uuid NOT NULL REFERENCES outbound_invoices(id) ON DELETE CASCADE,
  amount_allocated      numeric(10,2) NOT NULL,
  allocated_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(grant_application_id, invoice_id)
);

CREATE INDEX idx_grant_allocations_invoice ON grant_invoice_allocations(invoice_id);
CREATE INDEX idx_grant_allocations_application ON grant_invoice_allocations(grant_application_id);

-- 4. RLS
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY grants_all_read ON grants
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY grants_admin_manage ON grants
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

ALTER TABLE grant_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY grant_apps_admin_ops_all ON grant_applications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

ALTER TABLE grant_invoice_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY grant_allocations_admin_ops_all ON grant_invoice_allocations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));
