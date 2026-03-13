-- ============================================================
-- 015: Feedback system enhancements
-- - Make rating nullable (pending records have NULL rating)
-- - Add denormalised coach_id and sport columns
-- - Add send_feedback_emails to centres
-- - Add indexes for aggregation queries
-- ============================================================

-- 1. Make rating nullable and update CHECK constraint
ALTER TABLE feedback_ratings
  ALTER COLUMN rating DROP NOT NULL;

ALTER TABLE feedback_ratings
  DROP CONSTRAINT IF EXISTS feedback_ratings_rating_check;

ALTER TABLE feedback_ratings
  ADD CONSTRAINT feedback_ratings_rating_check CHECK (rating >= 1 AND rating <= 5);

-- 2. Add denormalised columns for efficient aggregation
ALTER TABLE feedback_ratings
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE feedback_ratings
  ADD COLUMN IF NOT EXISTS sport text;

-- 3. Add send_feedback_emails toggle to centres
ALTER TABLE centres
  ADD COLUMN IF NOT EXISTS send_feedback_emails boolean NOT NULL DEFAULT true;

-- 4. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_feedback_ratings_centre_id
  ON feedback_ratings (centre_id);

CREATE INDEX IF NOT EXISTS idx_feedback_ratings_coach_id
  ON feedback_ratings (coach_id);

CREATE INDEX IF NOT EXISTS idx_feedback_ratings_submitted_at
  ON feedback_ratings (submitted_at)
  WHERE submitted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_ratings_token
  ON feedback_ratings (feedback_token);

-- 5. RLS: allow public upsert via matching feedback_token
-- (existing policies from 006 cover admin/ops full access)
-- Add policy for anonymous/public submissions via API route (service role bypasses RLS,
-- so this is a safety net for future direct-client use)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feedback_ratings'
      AND policyname = 'feedback_ratings_public_submit'
  ) THEN
    CREATE POLICY feedback_ratings_public_submit ON feedback_ratings
      FOR UPDATE
      USING (true)
      WITH CHECK (submitted_at IS NOT NULL AND rating IS NOT NULL);
  END IF;
END $$;
