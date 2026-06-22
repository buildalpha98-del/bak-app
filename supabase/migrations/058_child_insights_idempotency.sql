-- ============================================================
-- 058 — child_insights idempotency (term-end batch dedup)
-- ============================================================
--
-- The child-insights cron (Sundays 22:00 UTC) was inserting rows
-- without any uniqueness check. Re-runs (manual back-fill, timeout
-- retries, off-by-one term boundaries) duplicated insights and the
-- parent UI showed multiple identical "term-end summary" cards per
-- child.
--
-- This adds a partial unique index covering the term-end path only.
-- On-demand insights (where term_id IS NULL or insight_type !=
-- 'term_end') keep their existing many-rows-per-child behaviour.
--
-- Paired with the route.ts switch from `.insert()` to `.upsert({...},
-- { onConflict: 'child_id,term_id,insight_type' })`.

CREATE UNIQUE INDEX IF NOT EXISTS child_insights_unique_term_end
  ON public.child_insights (child_id, term_id, insight_type)
  WHERE term_id IS NOT NULL;

COMMENT ON INDEX public.child_insights_unique_term_end IS
  'Idempotency guard for child-insights cron — prevents duplicate term-end summaries on re-run.';
