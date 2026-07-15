-- 069: Newsletter subscribers (marketing site — Chunk 4).
--
-- Backs the homepage newsletter capture. Written only by the
-- subscribeToNewsletter server action (lib/marketing/newsletter.ts)
-- and read only by staff tooling — both through the service-role
-- client, which bypasses RLS.
--
-- RLS is therefore ON with NO policies, deliberately: that is what
-- "service role only" looks like in Postgres. A public insert policy
-- would hand anonymous callers a direct, unrate-limited write to a
-- table of email addresses; routing every write through the action
-- keeps the honeypot and the per-IP limit in the path.
--
-- The action stores email trimmed and lowercased, which is what makes
-- UNIQUE do real work here (Alice@x.com and alice@x.com are one
-- subscriber, not two) and lets a re-subscribe upsert flip status back
-- to 'subscribed' rather than fail or duplicate.

CREATE TABLE newsletter_subscribers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
  source_page text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- update_updated_at() — 001_enums_and_helpers.sql
CREATE TRIGGER newsletter_subscribers_updated_at
  BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
