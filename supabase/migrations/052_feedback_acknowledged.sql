-- 052_feedback_acknowledged.sql
-- Adds an `acknowledged_at` timestamp to feedback_ratings so admin/ops can
-- mark low-rating + high-rating feedback as "seen" without permanently
-- deleting it. NULL = unread; non-null = the moment a staff member
-- acknowledged it. Surfaced by the inline pulse strip on /admin/feedback.

ALTER TABLE feedback_ratings
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_feedback_ratings_unack_low
  ON feedback_ratings (rating, acknowledged_at)
  WHERE rating <= 2 AND submitted_at IS NOT NULL AND acknowledged_at IS NULL;
