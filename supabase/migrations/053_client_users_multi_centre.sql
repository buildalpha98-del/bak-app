-- ============================================================
-- Migration 053: multi-centre support for client portal
-- ============================================================
--
-- Some centre directors run 2+ centres (3 OSHCs, multi-site
-- chains). The legacy single `client_users.centre_id` column
-- becomes the "default" centre; a new `client_user_centres` join
-- carries every centre the director can access. Backfill copies
-- the existing single mapping into the join.

CREATE TABLE IF NOT EXISTS client_user_centres (
  client_user_id uuid NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  centre_id uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_user_id, centre_id)
);

CREATE INDEX IF NOT EXISTS idx_client_user_centres_user ON client_user_centres(client_user_id);

-- Exactly one default per user
CREATE UNIQUE INDEX IF NOT EXISTS client_user_centres_default
  ON client_user_centres(client_user_id) WHERE is_default = true;

-- RLS — a user sees only their own join rows
ALTER TABLE client_user_centres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_user_centres self read" ON client_user_centres;
CREATE POLICY "client_user_centres self read"
  ON client_user_centres FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_users cu
      WHERE cu.id = client_user_centres.client_user_id
        AND cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin write client_user_centres" ON client_user_centres;
CREATE POLICY "admin write client_user_centres"
  ON client_user_centres FOR ALL
  USING (auth_user_role() IN ('admin','ops'))
  WITH CHECK (auth_user_role() IN ('admin','ops'));

-- Backfill from existing client_users.centre_id
INSERT INTO client_user_centres (client_user_id, centre_id, is_default)
SELECT id, centre_id, true
FROM client_users
WHERE centre_id IS NOT NULL
ON CONFLICT DO NOTHING;
