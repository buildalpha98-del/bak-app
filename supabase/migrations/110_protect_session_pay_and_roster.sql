-- Audit §2.9: reporting minutes does not approve overtime for payroll.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS reported_duration_minutes integer;

-- Audit §2.9: RLS still scopes coach rows; only these non-pay fields can be
-- changed through a coach JWT. Lifecycle actions use narrow server-side writes
-- after verifying membership/status, with a row-version comparison.
CREATE OR REPLACE FUNCTION public.protect_session_pay_and_roster() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (public.auth_user_role() IS NULL OR public.auth_user_role() NOT IN ('admin', 'ops'))
     AND (to_jsonb(NEW) - ARRAY['notes', 'coach_notes', 'headcount', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['notes', 'coach_notes', 'headcount', 'updated_at']) THEN
    RAISE EXCEPTION 'Staff approval or an authorised lifecycle action is required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_session_pay_and_roster ON public.sessions;
CREATE TRIGGER protect_session_pay_and_roster BEFORE UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.protect_session_pay_and_roster();
