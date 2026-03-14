-- ============================================================
-- Migration 009: Notifications table
-- Stores in-app notification records for all user tiers.
-- Push/email delivery is handled separately; this table is
-- the single source of truth for notification state.
-- ============================================================

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        varchar(50) NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  tier        varchar(20) NOT NULL DEFAULT 'informational'
              CHECK (tier IN ('urgent', 'important', 'informational')),
  entity_type varchar(50),
  entity_id   uuid,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Server can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);
