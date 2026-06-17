-- ============================================================
-- Migration 056: session_status_broadcasts (coach 3-tap status)
-- ============================================================
--
-- Coaches broadcast one of three statuses from the schedule:
--   - 'running_late' (with optional late_minutes 5/10/15/20/30)
--   - 'on_site'
--   - 'session_over'
--
-- Each broadcast fans out to ops, the centre's portal directors,
-- and (for running_late) the parents of kids booked into that
-- session — via `notifications` rows + the existing SMS fallback
-- on opted-in admins (`sendUrgentNotificationViaSms`).
--
-- This table is the source-of-truth audit. `notifications` rows
-- are the delivery surface and read independently.

CREATE TABLE IF NOT EXISTS session_status_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running_late','on_site','session_over')),
  late_minutes int,                  -- only set when status='running_late'
  message text,                      -- optional free-text the coach can add
  broadcast_to jsonb NOT NULL,       -- ['centre','admin','parents']
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_status_broadcasts_session
  ON session_status_broadcasts(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_status_broadcasts_coach
  ON session_status_broadcasts(coach_id, created_at DESC);

ALTER TABLE session_status_broadcasts ENABLE ROW LEVEL SECURITY;

-- Coach can read own broadcasts
DROP POLICY IF EXISTS "session_status_broadcasts coach read" ON session_status_broadcasts;
CREATE POLICY "session_status_broadcasts coach read" ON session_status_broadcasts
  FOR SELECT USING (coach_id = auth.uid());

-- Admin/ops read all
DROP POLICY IF EXISTS "session_status_broadcasts admin read" ON session_status_broadcasts;
CREATE POLICY "session_status_broadcasts admin read" ON session_status_broadcasts
  FOR SELECT USING (auth_user_role() IN ('admin','ops'));

-- Coach can insert own broadcasts
DROP POLICY IF EXISTS "session_status_broadcasts coach insert" ON session_status_broadcasts;
CREATE POLICY "session_status_broadcasts coach insert" ON session_status_broadcasts
  FOR INSERT WITH CHECK (coach_id = auth.uid());
