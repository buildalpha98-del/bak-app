-- ============================================================
-- 021: Client Portal Features — centre messaging
-- ============================================================

-- Centre messages: communication between client users and staff
CREATE TABLE centre_messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centre_id   uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  sender_type varchar NOT NULL CHECK (sender_type IN ('client', 'staff')),
  sender_client_id uuid REFERENCES client_users(id) ON DELETE SET NULL,
  sender_staff_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  content     text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT valid_sender CHECK (
    (sender_type = 'client' AND sender_client_id IS NOT NULL) OR
    (sender_type = 'staff' AND sender_staff_id IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_centre_messages_centre ON centre_messages(centre_id, created_at DESC);
CREATE INDEX idx_centre_messages_client ON centre_messages(sender_client_id) WHERE sender_client_id IS NOT NULL;
CREATE INDEX idx_centre_messages_staff ON centre_messages(sender_staff_id) WHERE sender_staff_id IS NOT NULL;

-- RLS
ALTER TABLE centre_messages ENABLE ROW LEVEL SECURITY;

-- Admin/ops can read and send messages for any centre
CREATE POLICY centre_messages_staff_read ON centre_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops'))
  );

CREATE POLICY centre_messages_staff_insert ON centre_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'staff'
    AND sender_staff_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops'))
  );

-- Client users can read and send messages for their own centre
CREATE POLICY centre_messages_client_read ON centre_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM client_users WHERE client_users.user_id = auth.uid() AND client_users.centre_id = centre_messages.centre_id)
  );

CREATE POLICY centre_messages_client_insert ON centre_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'client'
    AND EXISTS (SELECT 1 FROM client_users cu WHERE cu.user_id = auth.uid() AND cu.id = sender_client_id AND cu.centre_id = centre_messages.centre_id)
  );

-- Allow marking messages as read (update read_at)
CREATE POLICY centre_messages_update_read ON centre_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops'))
    OR EXISTS (SELECT 1 FROM client_users WHERE client_users.user_id = auth.uid() AND client_users.centre_id = centre_messages.centre_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops'))
    OR EXISTS (SELECT 1 FROM client_users WHERE client_users.user_id = auth.uid() AND client_users.centre_id = centre_messages.centre_id)
  );
