-- ============================================================
-- Migration 054: SMS audit log
-- ============================================================
--
-- SMS is the escape hatch for the in-app notification system: when
-- an urgent-tier recipient is offline > 5 minutes, the dispatcher
-- falls through to SMS so the alert still lands. Every send (real
-- or mocked) writes a row here so admins can audit what went out,
-- correlate Twilio webhooks against `provider_message_id`, and
-- spot bouncing numbers.
--
-- RLS: admin/ops can read everything; a user can read their own
-- rows so we can show "your last 10 SMS" in /coach/profile or
-- /parent/account later if we ever surface that.

CREATE TABLE IF NOT EXISTS sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  body text NOT NULL,
  provider text NOT NULL,            -- 'twilio' | 'mock'
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued',  -- 'queued' | 'sent' | 'failed'
  error text,
  triggered_by_notification_id uuid REFERENCES notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sms_log_user ON sms_log(user_id, created_at DESC);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_log admin read" ON sms_log;
CREATE POLICY "sms_log admin read" ON sms_log FOR SELECT
  USING (auth_user_role() IN ('admin','ops'));

DROP POLICY IF EXISTS "sms_log self read" ON sms_log;
CREATE POLICY "sms_log self read" ON sms_log FOR SELECT
  USING (user_id = auth.uid());
