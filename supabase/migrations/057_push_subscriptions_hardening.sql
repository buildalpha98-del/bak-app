-- ============================================================
-- Migration 057: push_subscriptions hardening
-- ============================================================
--
-- The table itself was first added in 011_notification_system.sql with
-- columns `keys_p256dh` / `keys_auth`. This migration adds:
--
--  1. `last_used_at` so triage can see staleness without reading logs.
--  2. A composite UNIQUE(user_id, endpoint) constraint -- endpoints
--     can in theory collide across users for some browser builds, and
--     upserts in lib/push/actions.ts target this pair.
--  3. An admin/ops SELECT policy so triage tools can read counts
--     without service-role.
--
-- We DO NOT rename `keys_p256dh` -> `p256dh` to avoid breaking the
-- legacy code paths in lib/notifications/push-send.ts; the new
-- lib/push/* surface uses the existing column names directly and
-- exposes typed accessors in lib/push/actions.ts.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();

-- Endpoint already has a UNIQUE constraint from 011; this is a tighter
-- composite that captures the (user, endpoint) pair for upsert targets.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_user_endpoint_unique'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_user_endpoint_unique
      UNIQUE (user_id, endpoint);
  END IF;
END $$;

-- Admin / ops triage read policy. Self read/insert/delete already exists.
DROP POLICY IF EXISTS "push_subscriptions admin read" ON push_subscriptions;
CREATE POLICY "push_subscriptions admin read"
  ON push_subscriptions FOR SELECT
  USING (auth_user_role() IN ('admin','ops'));
