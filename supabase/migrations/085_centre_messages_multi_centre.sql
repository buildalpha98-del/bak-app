-- Multi-campus contacts (path 4): centre_messages was the last portal
-- table keyed to client_users.centre_id (the DEFAULT centre) instead of
-- auth_client_centre_ids() (ALL authorised centres, migration 061).
-- For a contact's second centre that meant: read → 0 rows, send →
-- 42501, mark-read → no-op, and Realtime delivered nothing (delivery
-- re-evaluates the SELECT policy per subscriber). Re-key the three
-- client policies exactly like 076/077 did for feedback_ratings.

DROP POLICY IF EXISTS centre_messages_client_read ON centre_messages;
CREATE POLICY centre_messages_client_read ON centre_messages
  FOR SELECT TO authenticated
  USING (centre_id IN (SELECT auth_client_centre_ids()));

DROP POLICY IF EXISTS centre_messages_client_insert ON centre_messages;
CREATE POLICY centre_messages_client_insert ON centre_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'client'
    AND centre_id IN (SELECT auth_client_centre_ids())
    AND EXISTS (
      SELECT 1 FROM client_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.id = centre_messages.sender_client_id
    )
  );

-- The old UPDATE policy mixed staff and client conditions; recreate it
-- with the client half re-keyed and the staff half unchanged.
DROP POLICY IF EXISTS centre_messages_update_read ON centre_messages;
CREATE POLICY centre_messages_update_read ON centre_messages
  FOR UPDATE TO authenticated
  USING (
    auth_user_role() IN ('admin', 'ops')
    OR centre_id IN (SELECT auth_client_centre_ids())
  )
  WITH CHECK (
    auth_user_role() IN ('admin', 'ops')
    OR centre_id IN (SELECT auth_client_centre_ids())
  );
