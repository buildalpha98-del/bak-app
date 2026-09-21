-- ============================================================
-- 099 — The second coach on a shared shift can see it
-- ============================================================
-- Multi-coach shifts (048) put every coach on a shift in session_coaches
-- and keep sessions.coach_id as a cache of the LEAD only. Every coach
-- read policy written before that — and the ones written since by
-- copying them — still asks `sessions.coach_id = auth.uid()`. 068 let a
-- second coach UPDATE a shared session, but they could not SELECT it, so
-- in practice they had nothing: no shift in their schedule, no session
-- plan, no attendance list, no thread. Three real shared shifts at one
-- centre (July–September 2026) never appeared in their second coach's
-- app.
--
-- Two SECURITY DEFINER helpers in the pattern of 075's
-- auth_is_session_coach(): they read sessions / session_coaches with RLS
-- bypassed, so a policy on sessions can ask about membership (and a
-- policy on another table can ask about sessions) without re-entering
-- either table's RLS — the recursion that broke every session edit in
-- 068. `coach_id = auth.uid()` stays in the union as a belt for any row
-- the 048 trigger has not mirrored.
--
-- Deliberately NOT widened: coach_invoices / pay (a shift stores one
-- resolved rate, the lead's — paying a second coach needs its own rule),
-- swap_requests and rerostering (about the lead assignment), and every
-- "own rows" policy (skill_ratings, session_notes, photos, badges…),
-- which is keyed on the author, not the shift.

CREATE OR REPLACE FUNCTION public.auth_coach_session_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sc.session_id FROM session_coaches sc WHERE sc.user_id = auth.uid()
  UNION
  SELECT s.id FROM sessions s WHERE s.coach_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_coach_centre_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT s.centre_id
  FROM sessions s
  WHERE s.coach_id = auth.uid()
     OR EXISTS (SELECT 1 FROM session_coaches sc WHERE sc.session_id = s.id AND sc.user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.auth_coach_session_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_coach_centre_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_coach_session_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_coach_centre_ids() TO authenticated;

-- The shift itself.
DROP POLICY IF EXISTS coach_read_own_sessions ON sessions;
CREATE POLICY coach_read_own_sessions ON sessions
  FOR SELECT USING (coach_id = auth.uid() OR auth_is_session_coach(id));

-- Who else is on it: any coach on a shift sees the whole crew (before,
-- a second coach saw only their own row, so "with Sam" never rendered).
DROP POLICY IF EXISTS "session_coaches read" ON session_coaches;
CREATE POLICY "session_coaches read" ON session_coaches
  FOR SELECT USING (
    auth_user_role() = ANY (ARRAY['admin'::user_role, 'ops'::user_role])
    OR user_id = auth.uid()
    OR auth_is_session_primary_coach(session_id)
    OR auth_is_session_coach(session_id)
  );

-- The session plan.
DROP POLICY IF EXISTS coach_read_assigned_programs ON programs;
CREATE POLICY coach_read_assigned_programs ON programs
  FOR SELECT USING (
    auth_user_role() = 'coach'::user_role
    AND (
      created_by = auth.uid()
      OR id IN (
        SELECT s.program_id FROM sessions s
        WHERE s.program_id IS NOT NULL AND s.id IN (SELECT auth_coach_session_ids())
      )
    )
  );

-- Attendance.
DROP POLICY IF EXISTS coach_read_session_attendances ON session_attendances;
CREATE POLICY coach_read_session_attendances ON session_attendances
  FOR SELECT USING (auth_user_role() = 'coach'::user_role AND session_id IN (SELECT auth_coach_session_ids()));
DROP POLICY IF EXISTS coach_insert_session_attendances ON session_attendances;
CREATE POLICY coach_insert_session_attendances ON session_attendances
  FOR INSERT WITH CHECK (auth_user_role() = 'coach'::user_role AND session_id IN (SELECT auth_coach_session_ids()));
DROP POLICY IF EXISTS coach_update_session_attendances ON session_attendances;
CREATE POLICY coach_update_session_attendances ON session_attendances
  FOR UPDATE USING (auth_user_role() = 'coach'::user_role AND session_id IN (SELECT auth_coach_session_ids()));

-- The shift thread (read everything on the shift, write as yourself).
DROP POLICY IF EXISTS coach_threads_on_own_sessions ON shift_threads;
CREATE POLICY coach_threads_on_own_sessions ON shift_threads
  FOR ALL USING (session_id IN (SELECT auth_coach_session_ids()))
  WITH CHECK (user_id = auth.uid() AND session_id IN (SELECT auth_coach_session_ids()));

-- The centre's children, assessments and reports — scoped by "centres I
-- coach at", which now counts shared shifts.
DROP POLICY IF EXISTS coach_read_centre_children ON centre_children;
CREATE POLICY coach_read_centre_children ON centre_children
  FOR SELECT USING (auth_user_role() = 'coach'::user_role AND centre_id IN (SELECT auth_coach_centre_ids()));
DROP POLICY IF EXISTS coach_insert_centre_children ON centre_children;
CREATE POLICY coach_insert_centre_children ON centre_children
  FOR INSERT WITH CHECK (auth_user_role() = 'coach'::user_role AND centre_id IN (SELECT auth_coach_centre_ids()));

DROP POLICY IF EXISTS coach_read_children ON children;
CREATE POLICY coach_read_children ON children
  FOR SELECT USING (
    auth_user_role() = 'coach'::user_role
    AND id IN (SELECT cc.child_id FROM centre_children cc WHERE cc.centre_id IN (SELECT auth_coach_centre_ids()))
  );

DROP POLICY IF EXISTS coach_read_assessment_templates ON assessment_templates;
CREATE POLICY coach_read_assessment_templates ON assessment_templates
  FOR SELECT USING (
    auth_user_role() = 'coach'::user_role
    AND (centre_id IS NULL OR centre_id IN (SELECT auth_coach_centre_ids()))
  );

DROP POLICY IF EXISTS coaches_view_reports ON centre_reports;
CREATE POLICY coaches_view_reports ON centre_reports
  FOR SELECT USING (auth_user_role() = 'coach'::user_role AND centre_id IN (SELECT auth_coach_centre_ids()));
