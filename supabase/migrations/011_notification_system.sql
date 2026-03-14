-- ============================================================
-- 011: Notification system — push subscriptions, DND, data column, Realtime
-- ============================================================

-- 1. Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  keys_p256dh text NOT NULL,
  keys_auth   text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Add DND toggle to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dnd_enabled boolean NOT NULL DEFAULT false;

-- 3. Add data jsonb column to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data jsonb DEFAULT '{}'::jsonb;

-- 4. Enable Realtime on notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
