-- ============================================================
-- Migration 048: session_coaches join table
-- ============================================================
--
-- Multi-coach per shift. `sessions.coach_id` becomes a denormalised
-- cache of the current primary, maintained by a trigger that fires
-- on any insert/update/delete to this join table. The cache exists
-- so the 181 existing read sites that select coach_id keep working
-- without rewriting them in one PR.
--
-- Exactly one primary per session is enforced by a partial unique
-- index. If the last coach is removed from a published / pending
-- / confirmed shift, the trigger auto-flips the session status to
-- `needs_replacement` (edge case 4 in master spec §9).
--
-- All write paths in the codebase route through the
-- `set_session_coaches` RPC defined below — never write to this
-- table or to `sessions.coach_id` directly. The CI guard test
-- (`lib/__tests__/no-direct-coach-id-writes.test.ts`) enforces
-- this at build time.

BEGIN;

CREATE TABLE session_coaches (
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary   boolean NOT NULL DEFAULT false,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_session_coaches_user ON session_coaches(user_id);

-- Exactly one primary per session
CREATE UNIQUE INDEX session_coaches_primary
  ON session_coaches(session_id) WHERE is_primary = true;

-- Forward sync: when session_coaches changes, update sessions.coach_id
-- to reflect the current primary (or NULL if no rows remain).
CREATE OR REPLACE FUNCTION sync_sessions_primary_coach()
RETURNS TRIGGER AS $$
DECLARE
  sid uuid := COALESCE(NEW.session_id, OLD.session_id);
  new_primary uuid;
BEGIN
  SELECT user_id INTO new_primary FROM session_coaches
   WHERE session_id = sid AND is_primary = true LIMIT 1;

  UPDATE sessions SET coach_id = new_primary WHERE id = sid;

  -- Auto-transition to needs_replacement when the last coach is removed
  -- from a confirmed/published shift (edge case 4 in section 9).
  IF new_primary IS NULL THEN
    UPDATE sessions
       SET status = 'needs_replacement'
     WHERE id = sid
       AND status IN ('published','pending_confirmation','confirmed');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_coaches_sync_primary
  AFTER INSERT OR UPDATE OR DELETE ON session_coaches
  FOR EACH ROW EXECUTE FUNCTION sync_sessions_primary_coach();

-- RLS: same access model as sessions itself. Any role that can see
-- a session row can see its coach assignments; only admin/ops and
-- the helper write path write.
ALTER TABLE session_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_coaches read"
  ON session_coaches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_coaches.session_id
        -- inherit the same access path as the sessions row
        AND (
          auth_user_role() IN ('admin','ops')
          OR s.coach_id = auth.uid()
          OR session_coaches.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "session_coaches admin write"
  ON session_coaches FOR ALL
  USING (auth_user_role() IN ('admin','ops'))
  WITH CHECK (auth_user_role() IN ('admin','ops'));

-- ============================================================
-- set_session_coaches RPC
-- ============================================================
-- Atomic write path: deletes rows not in the new set, upserts the
-- rest, all in one transaction. Trigger fires for each delete/upsert
-- so sessions.coach_id stays consistent throughout (final state wins).
--
-- Input shape: jsonb array of { user_id: uuid, is_primary: bool }
-- An empty array clears all coaches and lets the trigger flip status
-- (see edge case 4 in spec §9).

CREATE OR REPLACE FUNCTION set_session_coaches(
  p_session_id uuid,
  p_coaches jsonb,
  p_assigned_by uuid
) RETURNS void AS $$
DECLARE
  v_primary_count int;
  v_new_user_ids uuid[];
BEGIN
  -- Validate exactly one primary if non-empty
  SELECT count(*) INTO v_primary_count
  FROM jsonb_array_elements(p_coaches) e
  WHERE (e->>'is_primary')::boolean = true;

  IF jsonb_array_length(p_coaches) > 0 AND v_primary_count <> 1 THEN
    RAISE EXCEPTION 'session_coaches: exactly one primary required (got %)', v_primary_count;
  END IF;

  -- Collect new user_ids for the delete-not-in pass
  SELECT array_agg((e->>'user_id')::uuid)
    INTO v_new_user_ids
    FROM jsonb_array_elements(p_coaches) e;

  -- Delete rows not in the new set
  DELETE FROM session_coaches
  WHERE session_id = p_session_id
    AND (v_new_user_ids IS NULL OR user_id <> ALL(v_new_user_ids));

  -- Upsert the new set
  INSERT INTO session_coaches (session_id, user_id, is_primary, assigned_by)
  SELECT
    p_session_id,
    (e->>'user_id')::uuid,
    (e->>'is_primary')::boolean,
    p_assigned_by
  FROM jsonb_array_elements(p_coaches) e
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET is_primary = EXCLUDED.is_primary,
        assigned_by = EXCLUDED.assigned_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated role only — RLS on session_coaches
-- still applies to the underlying table writes via SECURITY DEFINER
-- + the explicit role check in the helper's TypeScript wrapper.
REVOKE EXECUTE ON FUNCTION set_session_coaches FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_session_coaches TO authenticated;

-- Backfill (inside the same transaction so there's no race window
-- between trigger install and pre-existing rows being mirrored).
INSERT INTO session_coaches (session_id, user_id, is_primary, assigned_at, assigned_by)
SELECT id, coach_id, true, created_at, NULL
FROM sessions
WHERE coach_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
