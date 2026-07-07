-- 062 — first-login welcome tracking
-- Null until the director dismisses the one-time welcome tour on the
-- portal dashboard. DB-backed (not localStorage) so it survives
-- devices and browser resets — a director should see this exactly once.
ALTER TABLE client_users ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;

-- Directors flip their own flag; staff policies already cover the rest.
CREATE POLICY client_users_update_own_welcome ON client_users
  FOR UPDATE USING (user_id = auth.uid());
