-- ============================================================
-- 090 — Report-card release control (schools)
-- ============================================================
-- Report cards are generated live from marks, so the moment a teacher
-- saves a rating the card exists. A school wants a sign-off step: the
-- principal sets a date teachers finish by, checks the numbers, then
-- releases the term's report cards. Until then only the primary contact
-- (and Build Alpha Kids staff) can open a card; teachers and colleagues
-- see "not released yet".
--
-- One row per centre × term, created when the principal first sets a
-- due date or releases. Writes go through the admin client after the
-- primary check in the server action (client_users.is_primary is an
-- application rule, not an RLS one); clients read their own centres.

CREATE TABLE IF NOT EXISTS report_card_releases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id     uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  term_id       uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  due_date      date,
  released_at   timestamptz,
  released_by   uuid REFERENCES client_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (centre_id, term_id)
);

CREATE TRIGGER report_card_releases_updated_at
  BEFORE UPDATE ON report_card_releases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE report_card_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_full_report_card_releases ON report_card_releases
  FOR ALL USING (auth_user_role() = 'admin');
CREATE POLICY ops_full_report_card_releases ON report_card_releases
  FOR ALL USING (auth_user_role() = 'ops');
CREATE POLICY client_read_report_card_releases ON report_card_releases
  FOR SELECT USING (centre_id IN (SELECT auth_client_centre_ids()));
