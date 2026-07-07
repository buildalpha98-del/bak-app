-- ============================================================
-- 061 — client-portal RLS (launch blocker)
-- ============================================================
--
-- Until now the client role had read policies on exactly TWO portal
-- tables (centre_messages, shared_links). Every other portal query —
-- sessions, children, reports, invoices, programs, even the centre's
-- own name — ran through the cookie client and was silently blocked
-- by RLS, so a real director saw empty pages. Admin previews looked
-- fine because admin ALL policies bypass, which is why it was never
-- caught.
--
-- This adds SELECT policies scoped through auth_client_centre_ids():
-- the set of centres the caller can access either via a direct
-- client_users row or the multi-centre client_user_centres join
-- (migration 053). SECURITY DEFINER avoids policy recursion and keeps
-- each policy body cheap.
--
-- All policies are additive SELECTs — no existing role behaviour
-- changes. Status filters bake business rules into the DB tier:
-- clients never see draft sessions, draft reports, or draft invoices
-- no matter what application code forgets.

CREATE OR REPLACE FUNCTION auth_client_centre_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cu.centre_id
  FROM client_users cu
  WHERE cu.user_id = auth.uid()
  UNION
  SELECT cuc.centre_id
  FROM client_user_centres cuc
  JOIN client_users cu2 ON cu2.id = cuc.client_user_id
  WHERE cu2.user_id = auth.uid();
$$;

-- Centre identity (name, branding) for the shell + switcher
CREATE POLICY client_read_own_centres ON centres
  FOR SELECT USING (id IN (SELECT auth_client_centre_ids()));

-- Terms are shared reference data — readable by any portal user
CREATE POLICY client_read_terms ON terms
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM client_users WHERE user_id = auth.uid())
  );

-- Sessions at their centres, drafts excluded (internal planning state)
CREATE POLICY client_read_centre_sessions ON sessions
  FOR SELECT USING (
    centre_id IN (SELECT auth_client_centre_ids())
    AND status <> 'draft'
  );

CREATE POLICY client_read_centre_attendances ON session_attendances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_attendances.session_id
        AND s.centre_id IN (SELECT auth_client_centre_ids())
    )
  );

CREATE POLICY client_read_centre_children_links ON centre_children
  FOR SELECT USING (centre_id IN (SELECT auth_client_centre_ids()));

CREATE POLICY client_read_centre_children ON children
  FOR SELECT USING (
    id IN (
      SELECT cc.child_id FROM centre_children cc
      WHERE cc.centre_id IN (SELECT auth_client_centre_ids())
    )
  );

CREATE POLICY client_read_centre_feedback ON feedback_ratings
  FOR SELECT USING (centre_id IN (SELECT auth_client_centre_ids()));

-- Reports: sent only — drafts stay internal
CREATE POLICY client_read_sent_reports ON centre_reports
  FOR SELECT USING (
    centre_id IN (SELECT auth_client_centre_ids())
    AND status = 'sent'
  );

-- Invoices: issued statuses only — never drafts/voids
CREATE POLICY client_read_issued_invoices ON outbound_invoices
  FOR SELECT USING (
    centre_id IN (SELECT auth_client_centre_ids())
    AND status IN ('sent', 'partially_paid', 'paid', 'overdue')
  );

-- Programmes delivered at their centres
CREATE POLICY client_read_centre_programs ON programs
  FOR SELECT USING (
    id IN (
      SELECT s.program_id FROM sessions s
      WHERE s.centre_id IN (SELECT auth_client_centre_ids())
        AND s.program_id IS NOT NULL
    )
  );

-- Shared documents (resources page filters categories app-side)
CREATE POLICY client_read_shared_documents ON documents
  FOR SELECT USING (
    visibility = 'all'
    AND EXISTS (SELECT 1 FROM client_users WHERE user_id = auth.uid())
  );

-- Coach profiles for "Our Coaches" — only coaches who actually work
-- (or have worked) at one of the caller's centres, primary or shared.
CREATE POLICY client_read_centre_coaches ON profiles
  FOR SELECT USING (
    role = 'coach'
    AND (
      id IN (
        SELECT s.coach_id FROM sessions s
        WHERE s.centre_id IN (SELECT auth_client_centre_ids())
          AND s.coach_id IS NOT NULL
      )
      OR id IN (
        SELECT sc.user_id
        FROM session_coaches sc
        JOIN sessions s2 ON s2.id = sc.session_id
        WHERE s2.centre_id IN (SELECT auth_client_centre_ids())
      )
    )
  );

-- Per-term skill assessments for children at their centres. Two
-- candidate tables exist across migration waves; guard each so the
-- migration is portable.
DO $$
BEGIN
  IF to_regclass('public.skill_ratings') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY client_read_centre_skill_ratings ON skill_ratings
        FOR SELECT USING (
          child_id IN (
            SELECT cc.child_id FROM centre_children cc
            WHERE cc.centre_id IN (SELECT auth_client_centre_ids())
          )
        )
    $p$;
  END IF;
  IF to_regclass('public.child_skill_assessments') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY client_read_centre_child_assessments ON child_skill_assessments
        FOR SELECT USING (
          child_id IN (
            SELECT cc.child_id FROM centre_children cc
            WHERE cc.centre_id IN (SELECT auth_client_centre_ids())
          )
        )
    $p$;
  END IF;
END $$;
