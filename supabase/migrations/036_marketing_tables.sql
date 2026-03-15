-- ============================================================
-- Migration 036: approved_testimonials + public_stats_cache
-- ============================================================

-- Testimonial status enum
CREATE TYPE testimonial_status AS ENUM ('pending', 'approved', 'rejected');

-- Approved testimonials (curated from feedback_ratings)
CREATE TABLE approved_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_rating_id uuid REFERENCES feedback_ratings(id) ON DELETE SET NULL,
  centre_name text NOT NULL,
  comment text NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  display_name text NOT NULL,
  status testimonial_status NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_testimonials_status ON approved_testimonials(status);
CREATE INDEX idx_testimonials_feedback ON approved_testimonials(feedback_rating_id);

-- Public stats cache (pre-calculated for API)
CREATE TABLE public_stats_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_key text UNIQUE NOT NULL,
  stat_value jsonb NOT NULL DEFAULT '{}',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX idx_stats_cache_key ON public_stats_cache(stat_key);

-- RLS for approved_testimonials
ALTER TABLE approved_testimonials ENABLE ROW LEVEL SECURITY;

-- Admin/ops can manage testimonials
CREATE POLICY "admin_ops_manage_testimonials"
  ON approved_testimonials
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );

-- RLS for public_stats_cache
ALTER TABLE public_stats_cache ENABLE ROW LEVEL SECURITY;

-- Admin/ops can manage stats
CREATE POLICY "admin_ops_manage_stats"
  ON public_stats_cache
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ops')
    )
  );

-- Allow public read of stats (for API)
CREATE POLICY "public_read_stats"
  ON public_stats_cache
  FOR SELECT
  TO anon
  USING (true);
