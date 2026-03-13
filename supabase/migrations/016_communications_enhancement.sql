-- ============================================================
-- Migration 016: Communications enhancements
-- Adds edit/delete to DMs and shift threads, threaded replies,
-- fixes RLS policies, enables Realtime
-- ============================================================

-- 1. Direct messages: add edit/delete support
ALTER TABLE direct_messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE direct_messages ADD COLUMN updated_at timestamptz;
ALTER TABLE direct_messages ADD COLUMN deleted_at timestamptz;

-- 2. Shift threads: add edit/delete + threaded replies
ALTER TABLE shift_threads ALTER COLUMN content DROP NOT NULL;
ALTER TABLE shift_threads ADD COLUMN updated_at timestamptz;
ALTER TABLE shift_threads ADD COLUMN deleted_at timestamptz;
ALTER TABLE shift_threads ADD COLUMN parent_message_id uuid REFERENCES shift_threads(id) ON DELETE CASCADE;

-- 3. Indexes
CREATE INDEX idx_shift_threads_parent ON shift_threads(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX idx_direct_messages_conversation ON direct_messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_direct_messages_recipient ON direct_messages(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX idx_announcement_reads_announcement ON announcement_reads(announcement_id);

-- 4. Fix RLS: coaches need to UPDATE their own sent DMs (for edit/delete)
CREATE POLICY "coach_update_own_sent_dms" ON direct_messages
  FOR UPDATE USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- 5. Fix RLS: coaches should see 'ops_and_coaches' announcements too
DROP POLICY IF EXISTS "coach_read_announcements" ON announcements;
CREATE POLICY "coach_read_announcements" ON announcements
  FOR SELECT USING (
    auth_user_role() = 'coach'
    AND audience IN ('all', 'ops_and_coaches', 'coaches_only')
  );

-- 6. Enable Realtime on messaging tables
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE shift_threads;
