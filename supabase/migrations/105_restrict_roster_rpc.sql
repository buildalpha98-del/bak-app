-- Audit §2.8: only operational staff may directly replace a crew.
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
    WHERE id = auth.uid() AND role IN ('admin', 'ops') AND status = 'active'
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


REVOKE ALL ON FUNCTION public.set_session_coaches(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_session_coaches(uuid, jsonb, uuid) TO authenticated, service_role;
