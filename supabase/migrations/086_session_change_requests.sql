-- Portal self-service: session change requests (path 5).
-- A centre contact asks to reschedule or cancel an upcoming session
-- from their portal; ops approves or declines from the roster sheet.
-- Cuts the highest-volume office email. Approval applies the change
-- through the existing session write paths — this table is the
-- request ledger, not a parallel scheduling system.

CREATE TABLE session_change_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  centre_id     uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  requested_by  uuid NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  request_type  text NOT NULL CHECK (request_type IN ('reschedule', 'cancel')),
  requested_date date,
  requested_time time,
  reason        text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'declined')),
  resolved_by   uuid REFERENCES profiles(id),
  resolution_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX idx_scr_session ON session_change_requests(session_id);
CREATE INDEX idx_scr_pending ON session_change_requests(centre_id)
  WHERE status = 'pending';

ALTER TABLE session_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY scr_staff_all ON session_change_requests
  FOR ALL TO authenticated
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- Clients read their centres' requests (join-aware via 061's helper).
CREATE POLICY scr_client_read ON session_change_requests
  FOR SELECT TO authenticated
  USING (centre_id IN (SELECT auth_client_centre_ids()));

-- Clients create requests only for their own centres, only against a
-- session that actually belongs to that centre, and only as one of
-- their own client_users rows.
CREATE POLICY scr_client_insert ON session_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    centre_id IN (SELECT auth_client_centre_ids())
    AND EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_change_requests.session_id
        AND s.centre_id = session_change_requests.centre_id
    )
    AND EXISTS (
      SELECT 1 FROM client_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.id = session_change_requests.requested_by
    )
  );
