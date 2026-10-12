-- ============================================================
-- 102 — re-assert the privilege lockdowns of 048 / 073 / 074 / 099
-- ============================================================
--
-- The Oct 2026 move to the Sydney project restored the schema with
-- pg_dump, and the new project's default privileges re-granted EXECUTE
-- / ALL to anon (and PUBLIC) on objects that earlier migrations had
-- deliberately locked down. Found by diffing pg_proc.proacl between the
-- two projects after cutover:
--
--   set_session_coaches       anon could execute (074 revoked)
--   resolve_session_pay_rate  anon could execute (074 revoked)
--   nextval_invoice_number    anon + authenticated could execute
--                             (074: service_role only)
--   activity_log              anon had ALL (073 revoked)
--
-- Idempotent: safe on a database that already has the lockdowns.
-- Lesson: after any dump/restore, diff ACLs, not just rows.

REVOKE ALL ON FUNCTION public.set_session_coaches(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_session_coaches(uuid, jsonb, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_session_pay_rate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_session_pay_rate(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.nextval_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nextval_invoice_number() TO service_role;

REVOKE ALL ON FUNCTION public.auth_coach_session_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_coach_centre_ids() FROM PUBLIC;

REVOKE ALL ON TABLE public.activity_log FROM anon;
