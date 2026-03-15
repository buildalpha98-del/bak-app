-- ============================================================================
-- 037: Referral System
-- Referral codes, tracking, rewards, and configuration for parent and centre
-- referral programmes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------

CREATE TYPE referral_owner_type AS ENUM ('parent', 'centre');
CREATE TYPE referral_status AS ENUM ('pending', 'registered', 'converted', 'expired');
CREATE TYPE referral_reward_type AS ENUM ('instant_discount', 'milestone_free_session', 'invoice_credit', 'badge');
CREATE TYPE referral_reward_status AS ENUM ('pending', 'awarded', 'redeemed', 'expired');
CREATE TYPE referral_code_status AS ENUM ('active', 'inactive');

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------

-- Unique referral codes owned by parents or centres
CREATE TABLE referral_codes (
  id               uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text                 UNIQUE NOT NULL,
  owner_type       referral_owner_type  NOT NULL,
  owner_id         uuid                 NOT NULL,
  status           referral_code_status NOT NULL DEFAULT 'active',
  total_referrals  int                  NOT NULL DEFAULT 0,
  total_conversions int                 NOT NULL DEFAULT 0,
  created_at       timestamptz          NOT NULL DEFAULT now()
);

-- Individual referral records
CREATE TABLE referrals (
  id               uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid                 NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  referrer_type    referral_owner_type  NOT NULL,
  referrer_id      uuid                 NOT NULL,
  referred_type    referral_owner_type  NOT NULL,
  referred_id      uuid,
  referred_email   text                 NOT NULL,
  status           referral_status      NOT NULL DEFAULT 'pending',
  conversion_type  text,
  converted_at     timestamptz,
  created_at       timestamptz          NOT NULL DEFAULT now()
);

-- Rewards earned from referrals
CREATE TABLE referral_rewards (
  id                uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id       uuid                   NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  recipient_type    referral_owner_type    NOT NULL,
  recipient_id      uuid                   NOT NULL,
  reward_type       referral_reward_type   NOT NULL,
  reward_value_cents int,
  reward_description text                  NOT NULL,
  status            referral_reward_status NOT NULL DEFAULT 'pending',
  awarded_at        timestamptz,
  redeemed_at       timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz            NOT NULL DEFAULT now()
);

-- Global referral programme configuration
CREATE TABLE referral_config (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text        UNIQUE NOT NULL,
  config_value  jsonb       NOT NULL DEFAULT '{}',
  updated_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------

CREATE INDEX idx_referral_codes_owner    ON referral_codes(owner_type, owner_id);
CREATE INDEX idx_referral_codes_code     ON referral_codes(code);
CREATE INDEX idx_referrals_code          ON referrals(referral_code_id);
CREATE INDEX idx_referrals_referred_email ON referrals(referred_email);
CREATE INDEX idx_referrals_status        ON referrals(status);
CREATE INDEX idx_referral_rewards_referral  ON referral_rewards(referral_id);
CREATE INDEX idx_referral_rewards_recipient ON referral_rewards(recipient_type, recipient_id);
CREATE INDEX idx_referral_config_key     ON referral_config(config_key);

-- ----------------------------------------------------------------------------
-- 4. Row-Level Security
-- ----------------------------------------------------------------------------

ALTER TABLE referral_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_config  ENABLE ROW LEVEL SECURITY;

-- Admin / Ops — full access to all referral tables

CREATE POLICY "admin_ops_manage_referral_codes" ON referral_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'ops')
    )
  );

CREATE POLICY "admin_ops_manage_referrals" ON referrals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'ops')
    )
  );

CREATE POLICY "admin_ops_manage_referral_rewards" ON referral_rewards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'ops')
    )
  );

CREATE POLICY "admin_ops_manage_referral_config" ON referral_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'ops')
    )
  );

-- Parents — read own referral codes

CREATE POLICY "parents_read_own_referral_codes" ON referral_codes
  FOR SELECT USING (
    owner_type = 'parent'
    AND EXISTS (
      SELECT 1 FROM parent_profiles
      WHERE parent_profiles.id = referral_codes.owner_id
        AND parent_profiles.user_id = auth.uid()
    )
  );

-- Parents — read own referrals

CREATE POLICY "parents_read_own_referrals" ON referrals
  FOR SELECT USING (
    referrer_type = 'parent'
    AND EXISTS (
      SELECT 1 FROM parent_profiles
      WHERE parent_profiles.id = referrals.referrer_id
        AND parent_profiles.user_id = auth.uid()
    )
  );

-- Parents — read own rewards

CREATE POLICY "parents_read_own_referral_rewards" ON referral_rewards
  FOR SELECT USING (
    recipient_type = 'parent'
    AND EXISTS (
      SELECT 1 FROM parent_profiles
      WHERE parent_profiles.id = referral_rewards.recipient_id
        AND parent_profiles.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Seed data — default referral programme configuration
-- ----------------------------------------------------------------------------

INSERT INTO referral_config (config_key, config_value) VALUES
  ('parent_instant_reward',  '{"type": "discount", "amount_cents": 500, "description": "$5 off your next booking"}'::jsonb),
  ('parent_milestone',       '{"type": "free_session", "required_conversions": 3, "description": "Free session after 3 successful referrals"}'::jsonb),
  ('centre_financial',       '{"type": "invoice_credit", "amount_cents": 5000, "description": "$50 credit on next invoice per referral"}'::jsonb),
  ('centre_recognition',     '{"type": "badge", "description": "Featured Partner badge on marketing materials"}'::jsonb),
  ('program_enabled',        '{"enabled": true}'::jsonb),
  ('reward_expiry_days',     '{"days": 90}'::jsonb);
