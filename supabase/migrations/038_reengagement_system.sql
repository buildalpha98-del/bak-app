-- 038_reengagement_system.sql
-- Re-engagement campaigns, sends, and discount codes

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE reengagement_audience_type AS ENUM (
  'dormant_parents',
  'declining_centres',
  'cold_leads',
  'untrained_coaches'
);

CREATE TYPE reengagement_campaign_status AS ENUM (
  'active',
  'paused',
  'inactive'
);

CREATE TYPE reengagement_send_status AS ENUM (
  'triggered',
  'email_sent',
  'engaged',
  'unsubscribed'
);

CREATE TYPE reengagement_recipient_type AS ENUM (
  'parent',
  'centre',
  'lead',
  'coach'
);

CREATE TYPE discount_code_type AS ENUM (
  'flat_amount'
);

-- ============================================================
-- Tables
-- ============================================================

-- reengagement_campaigns
CREATE TABLE reengagement_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  audience_type     reengagement_audience_type NOT NULL,
  trigger_condition jsonb NOT NULL DEFAULT '{}',
  email_sequence_id uuid REFERENCES email_sequences(id) ON DELETE SET NULL,
  status            reengagement_campaign_status NOT NULL DEFAULT 'active',
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- reengagement_sends
CREATE TABLE reengagement_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid REFERENCES reengagement_campaigns(id) ON DELETE CASCADE,
  recipient_type  reengagement_recipient_type NOT NULL,
  recipient_id    uuid NOT NULL,
  trigger_reason  text NOT NULL,
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  email_send_id   uuid REFERENCES email_sends(id) ON DELETE SET NULL,
  status          reengagement_send_status NOT NULL DEFAULT 'triggered',
  engaged_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- discount_codes
CREATE TABLE discount_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  type        discount_code_type NOT NULL DEFAULT 'flat_amount',
  value_cents int NOT NULL,
  parent_id   uuid REFERENCES parent_profiles(id) ON DELETE SET NULL,
  used        boolean NOT NULL DEFAULT false,
  used_at     timestamptz,
  expires_at  timestamptz,
  campaign_id uuid REFERENCES reengagement_campaigns(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_reengagement_campaigns_audience ON reengagement_campaigns(audience_type);
CREATE INDEX idx_reengagement_campaigns_status ON reengagement_campaigns(status);
CREATE INDEX idx_reengagement_sends_campaign ON reengagement_sends(campaign_id);
CREATE INDEX idx_reengagement_sends_recipient ON reengagement_sends(recipient_type, recipient_id);
CREATE INDEX idx_reengagement_sends_status ON reengagement_sends(status);
CREATE INDEX idx_discount_codes_code ON discount_codes(code);
CREATE INDEX idx_discount_codes_parent ON discount_codes(parent_id);
CREATE INDEX idx_discount_codes_campaign ON discount_codes(campaign_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE reengagement_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE reengagement_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

-- Admin/ops full access to campaigns
CREATE POLICY "admin_ops_campaigns" ON reengagement_campaigns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Admin/ops full access to sends
CREATE POLICY "admin_ops_sends" ON reengagement_sends
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Admin/ops full access to discount codes
CREATE POLICY "admin_ops_discount_codes" ON discount_codes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Parents can read their own discount codes
CREATE POLICY "parents_read_own_discount_codes" ON discount_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_profiles
      WHERE parent_profiles.id = discount_codes.parent_id
        AND parent_profiles.user_id = auth.uid()
    )
  );
