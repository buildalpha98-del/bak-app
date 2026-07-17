-- 073: Close the anon read-exposure on activity_log.
--
-- CONFIRMED EXPOSURE (Supabase advisor ERROR `rls_disabled_in_public`,
-- lint 0013): activity_log shipped with RLS DISABLED (see 005/006 —
-- "26. activity_log (NO RLS — admin-read-only via service role)"). The
-- intent was "service role reads only", but the table still carries
-- Supabase's default GRANT to the `anon` role, and with RLS off that
-- grant is ungated. So an unauthenticated caller holding only the
-- public anon key gets HTTP 200 on
--   GET /rest/v1/activity_log?select=*
-- and reads the entire internal audit trail (who did what across the
-- whole platform — sessions, pay-rate overrides, staff resets, client
-- and parent management, invoicing, …). This closes it.
--
-- ACCESS MODEL (an internal, append-only staff audit trail):
--   * READ  — admin + ops only. This is the operational audit log; the
--     one cookie-client read in app code (lib/pay-rates/actions.ts
--     getSessionRateInfo → the pay-rate-override reason) lives behind an
--     admin/ops-only edit surface. No coach, client, parent, or anon
--     read path exists. Matches 044/045's admin+ops read shape.
--   * WRITE — any authenticated staff profile (admin | ops | coach).
--     Every cookie-client audit insert in lib/**/actions.ts is performed
--     by a signed-in profile (attendance, assessments, sessions, tasks,
--     training, equipment, forms, rerostering, grants, invoicing, …).
--     Coaches legitimately write (e.g. cancelSessionAsCoach, form
--     submit, kit check-in), so WRITE cannot be admin/ops-only or coach
--     audit logging breaks. The WITH CHECK only asserts the actor IS a
--     staff profile — it never inspects the row's columns, so no
--     existing insert (whatever user_id/metadata it writes, including
--     bulk rows and null user_id) can be rejected.
--   * System writes that already run on the SERVICE-ROLE admin client
--     (createSupabaseAdmin — parent bulk-invite, auto-create tasks,
--     auto-allocate grants, outbound-invoicing, y1-targets, status
--     broadcast, payment invoice-callback, business-settings) bypass RLS
--     entirely and are unaffected.
--   * No UPDATE/DELETE policy — activity_log is append-only in code
--     (only .insert and one .select exist). Leaving UPDATE/DELETE
--     unpoliced keeps the log immutable to cookie clients; the
--     service-role client can still maintain it if ever needed.
--
-- The plain `ENABLE ROW LEVEL SECURITY` alone would already stop the
-- leak (anon matches no SELECT policy → empty result), but PostgREST
-- would answer anon with 200 `[]` rather than a hard denial. We also
-- REVOKE the default anon grant so anon gets 401/403 permission-denied,
-- which is the unambiguous, advisor-clean end state.

-- 1. Turn RLS on (clears the ERROR-level advisor).
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- 2. Strip the default anon privilege so an unauthenticated GET is a
--    hard 401/403, not a 200 with an empty array. authenticated and
--    service_role keep their grants (gated by the policies below / RLS
--    bypass respectively).
REVOKE ALL ON TABLE activity_log FROM anon;

-- 3. READ — admin + ops only (internal audit trail).
CREATE POLICY activity_log_admin_ops_read ON activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'ops')
    )
  );

-- 4. WRITE — any authenticated staff profile (admin | ops | coach).
--    WITH CHECK asserts only that the actor is a staff profile; it does
--    not constrain the inserted row, so every existing audit insert
--    keeps working.
CREATE POLICY activity_log_staff_insert ON activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'ops', 'coach')
    )
  );
