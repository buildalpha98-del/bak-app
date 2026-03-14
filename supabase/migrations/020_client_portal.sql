-- ============================================================
-- Migration 020: Client portal — client_users, shared_links
-- ============================================================

-- 1. Client users table (centre contacts with portal access)
CREATE TABLE client_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  centre_id   uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'primary',
  is_primary  boolean NOT NULL DEFAULT true,
  last_login  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, centre_id)
);

CREATE TRIGGER client_users_updated_at
  BEFORE UPDATE ON client_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_client_users_centre ON client_users(centre_id);
CREATE INDEX idx_client_users_user ON client_users(user_id);
CREATE INDEX idx_client_users_email ON client_users(email);

-- 2. Shared links table (read-only portal access)
CREATE TABLE shared_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id   uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  token       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_links_token ON shared_links(token);
CREATE INDEX idx_shared_links_centre ON shared_links(centre_id);

-- 3. RLS policies
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_links ENABLE ROW LEVEL SECURITY;

-- Admin and ops can manage all client users
CREATE POLICY "admin_ops_manage_client_users"
  ON client_users
  FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- Client users can read their own record
CREATE POLICY "client_users_read_own"
  ON client_users
  FOR SELECT
  USING (user_id = auth.uid());

-- Admin and ops can manage all shared links
CREATE POLICY "admin_ops_manage_shared_links"
  ON shared_links
  FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- Client users can manage shared links for their centre
CREATE POLICY "client_users_manage_shared_links"
  ON shared_links
  FOR ALL
  USING (
    created_by IN (
      SELECT id FROM client_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by IN (
      SELECT id FROM client_users WHERE user_id = auth.uid()
    )
  );
