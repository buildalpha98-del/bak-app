-- 070: Blog posts (marketing site — Chunk 5).
--
-- Backs the public blog (/blog, /blog/[slug]) and the admin editor.
-- Public reads go through lib/marketing/blog.ts on the service-role
-- client, which bypasses RLS — so the published/scheduled gate lives
-- in that query layer, not in a policy. Keep the two in step: a post
-- is public only when status = 'published' AND published_at <= now().
--
-- RLS is ON with a single admin policy so that any *end-user* session
-- (parent, coach, ops) reaching this table directly gets nothing.
-- Matches the house admin-manage shape used by 045_grants.sql and
-- 044_payment_batches.sql: FOR ALL TO authenticated, with an explicit
-- WITH CHECK so admins cannot write rows they could not then read.
--
-- `slug` is UNIQUE because it is the public URL key — getPostBySlug
-- uses maybeSingle() and would throw on a duplicate rather than pick
-- one arbitrarily. Slugs are stored lowercased by the admin editor.
--
-- `published_at` is deliberately nullable and separate from status:
-- it doubles as the schedule (set it forward to publish later) and as
-- the display date, so ordering is by publication, not row creation.

CREATE TABLE blog_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  excerpt         text,
  content         text NOT NULL DEFAULT '',
  cover_image_url text,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at    timestamptz,
  author_name     text NOT NULL DEFAULT 'Build Alpha Kids',
  tags            text[] NOT NULL DEFAULT '{}',
  seo_title       text,
  seo_description text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_posts_admin_manage ON blog_posts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Serves the public list query: status = 'published' AND published_at
-- <= now() ORDER BY published_at DESC — the DESC matches the scan
-- direction so the index supplies the ordering, not a sort.
CREATE INDEX idx_blog_posts_status_published ON blog_posts(status, published_at DESC);

-- update_updated_at() — 001_enums_and_helpers.sql
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
