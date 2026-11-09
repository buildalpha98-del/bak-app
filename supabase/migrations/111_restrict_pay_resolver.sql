-- Audit §2.9: do not expose other coaches' rates through a SECURITY DEFINER RPC.
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
  -- Audit §2.9: only operational staff or the service role may resolve
  -- arbitrary sessions. Pricing arithmetic is unchanged (Phase 2).
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'ops') AND status = 'active'
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


REVOKE ALL ON FUNCTION public.resolve_session_pay_rate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_session_pay_rate(uuid) TO authenticated, service_role;
