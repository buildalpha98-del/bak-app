-- ============================================================
-- 082 — clients read assessment templates (fixes empty marks)
-- ============================================================
--
-- Portal users could read skill_ratings (061) but NOT the
-- assessment_templates they join through — and the portal queries use
-- `assessment_templates!inner(...)`, so PostgREST dropped every rating
-- row. The Assessments and Progression tabs, and the per-student
-- report card, were silently empty for every real director and school
-- while admin preview looked fine. The 061 pattern, one table later.
--
-- Templates are skill lists (sport, age band, skill names) — no child
-- data. Global templates (centre_id IS NULL) are shared reference data.

CREATE POLICY client_read_assessment_templates ON assessment_templates
  FOR SELECT USING (
    centre_id IS NULL
    OR centre_id IN (SELECT auth_client_centre_ids())
  );
