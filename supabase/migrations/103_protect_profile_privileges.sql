-- Audit §2.6: self-service profile updates must never grant privileges or pay.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.auth_user_role() IS DISTINCT FROM 'admin'
     AND (NEW.role, NEW.also_coaches, NEW.default_pay_rate, NEW.status, NEW.financial_access)
         IS DISTINCT FROM (OLD.role, OLD.also_coaches, OLD.default_pay_rate, OLD.status, OLD.financial_access) THEN
    RAISE EXCEPTION 'Admin required to change profile privileges' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_profile_privileges ON public.profiles;
CREATE TRIGGER protect_profile_privileges BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();
