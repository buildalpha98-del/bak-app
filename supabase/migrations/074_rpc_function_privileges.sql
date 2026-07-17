-- 074: Lock down the RPC-exposed SECURITY DEFINER functions flagged by
-- the Supabase security advisor (lint 0028 anon-executable / 0029
-- authenticated-executable), triaged 2026-07-17.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and
-- PostgREST exposes every public-schema function at /rest/v1/rpc/<name>.
-- Net effect before this migration: all five flagged functions were
-- callable by `anon` (and `authenticated`) straight off the public API.
-- Because REVOKE FROM anon alone is a no-op when the grant rides on
-- PUBLIC, every revoke below strips PUBLIC first and re-grants the
-- roles that actually need EXECUTE.
--
-- TRIAGE, per function:
--
-- * set_session_coaches(uuid, jsonb, uuid) — SECURITY DEFINER WRITE
--   that deletes/upserts session_coaches, bypassing that table's
--   admin/ops-only RLS. It had NO internal caller check, so any
--   signed-in parent or client (both are `authenticated`) could rewrite
--   any session's coach roster via direct RPC — and anon could too.
--   Two-layer fix:
--     grants — PUBLIC/anon revoked; authenticated kept because the
--     app's only caller (lib/sessions/session-coaches.ts) runs on the
--     staff cookie client from scheduling/sessions/shift/dnd actions;
--     guard — an internal staff check (below), so authenticated
--     non-staff get a hard exception. Coach stays allowed: 068's coach
--     session-write policies mean coach flows can legitimately reach
--     setSessionCoaches. auth.uid() IS NULL passes for the service-role
--     admin client — safe because anon can no longer execute the
--     function at all, so NULL-uid no longer includes anon.
--
-- * resolve_session_pay_rate(uuid) — SECURITY DEFINER read of
--   pay_rates/profiles returning a coach's resolved pay rate, bypassing
--   pay_rates' admin/ops RLS. Parents see session ids in their portal,
--   so any parent could read coach pay via direct RPC. No .rpc() caller
--   in code; its one real caller is the SECURITY INVOKER trigger
--   sessions_resolve_pay_rate (BEFORE INSERT OR UPDATE OF coach_id,
--   pay_rate_override, centre_id ON sessions), whose function-EXECUTE
--   is privilege-checked against whoever writes `sessions` — admin/ops,
--   coach (068), service role. So authenticated keeps EXECUTE and the
--   same staff guard closes the parent/client leak.
--
-- * nextval_invoice_number() — only caller is the service-role admin
--   client (lib/launch/invoice-generator.ts). No policy, trigger or
--   view references. Anyone else calling it can only burn invoice
--   sequence numbers. Locked to service_role outright.
--
-- * auth_user_role(), auth_client_centre_ids() — DELIBERATELY UNCHANGED
--   and still anon-executable: they are the RLS helper functions used
--   inside ~100 policies defined TO public, so policy expressions
--   evaluate — and call them — as whatever role runs the query,
--   including anon REST requests. Revoking anon would turn "empty
--   result" into "permission denied for function" on any anon query of
--   those tables: a latent production break for any future anon-key
--   read, for zero gain — with auth.uid() NULL they return NULL/empty,
--   leaking nothing. The 0028 WARN for these two is accepted; this
--   comment is the record.
--
-- Advisor state after this migration: 0028 cleared for the three fixed
-- functions, accepted for the two auth_* helpers; 0029 cleared for
-- nextval_invoice_number, defused-by-guard for the two rewritten
-- functions; 0011 (mutable search_path) also cleared for the two
-- rewritten functions, which now pin search_path.

-- ------------------------------------------------------------------
-- 1. set_session_coaches — add staff guard + pin search_path.
--    Body otherwise identical to the shipped version.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_session_coaches(p_session_id uuid, p_coaches jsonb, p_assigned_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_primary_count int;
  v_new_user_ids uuid[];
BEGIN
  -- Staff guard (074): SECURITY DEFINER bypasses session_coaches RLS,
  -- so the caller must be vetted here. NULL uid = service-role client;
  -- anon cannot execute this function at all after 074's REVOKE.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'ops', 'coach')
  ) THEN
    RAISE EXCEPTION 'set_session_coaches: staff role required';
  END IF;

  SELECT count(*) INTO v_primary_count
  FROM jsonb_array_elements(p_coaches) e
  WHERE (e->>'is_primary')::boolean = true;

  IF jsonb_array_length(p_coaches) > 0 AND v_primary_count <> 1 THEN
    RAISE EXCEPTION 'session_coaches: exactly one primary required (got %)', v_primary_count;
  END IF;

  SELECT array_agg((e->>'user_id')::uuid)
    INTO v_new_user_ids
    FROM jsonb_array_elements(p_coaches) e;

  DELETE FROM session_coaches
  WHERE session_id = p_session_id
    AND (v_new_user_ids IS NULL OR user_id <> ALL(v_new_user_ids));

  INSERT INTO session_coaches (session_id, user_id, is_primary, assigned_by)
  SELECT
    p_session_id,
    (e->>'user_id')::uuid,
    (e->>'is_primary')::boolean,
    p_assigned_by
  FROM jsonb_array_elements(p_coaches) e
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET is_primary = EXCLUDED.is_primary,
        assigned_by = EXCLUDED.assigned_by;
END;
$function$;

-- ------------------------------------------------------------------
-- 2. resolve_session_pay_rate — add the same staff guard + pin
--    search_path. Body otherwise identical to the shipped version.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_session_pay_rate(p_session_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_override    decimal(10,2);
  v_coach_id    uuid;
  v_sport       varchar;
  v_session_type_rate decimal(10,2);
  v_default_rate decimal(10,2);
BEGIN
  -- Staff guard (074): returns pay data, bypassing pay_rates RLS. The
  -- sessions_resolve_pay_rate trigger calls this as the session writer
  -- (admin/ops/coach or service role); parents/clients are refused.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'ops', 'coach')
  ) THEN
    RAISE EXCEPTION 'resolve_session_pay_rate: staff role required';
  END IF;

  -- Get session details
  SELECT pay_rate_override, coach_id, sport
  INTO v_override, v_coach_id, v_sport
  FROM sessions
  WHERE id = p_session_id;

  -- 1. Session-level override
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  -- No coach assigned
  IF v_coach_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Session-type rate for this coach (most recent effective)
  SELECT rate INTO v_session_type_rate
  FROM pay_rates
  WHERE user_id = v_coach_id
    AND session_type = (
      -- Map sport/centre type to session_type
      SELECT CASE
        WHEN c.type = 'childcare_centre' THEN 'childcare'
        WHEN c.type = 'school' THEN 'school_local'
        ELSE 'childcare'
      END
      FROM sessions s
      JOIN centres c ON c.id = s.centre_id
      WHERE s.id = p_session_id
    )
    AND effective_from <= (SELECT date FROM sessions WHERE id = p_session_id)
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_session_type_rate IS NOT NULL THEN
    RETURN v_session_type_rate;
  END IF;

  -- 3. Coach default rate
  SELECT default_pay_rate INTO v_default_rate
  FROM profiles
  WHERE id = v_coach_id;

  RETURN v_default_rate;
END;
$function$;

-- ------------------------------------------------------------------
-- 3. Privileges. CREATE OR REPLACE preserves the old ACLs, so the
--    revokes below apply to the rewritten functions too.
-- ------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.set_session_coaches(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_session_coaches(uuid, jsonb, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_session_pay_rate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_session_pay_rate(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.nextval_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nextval_invoice_number() TO service_role;
