-- Audit §2.7: welcome/name self-service cannot change portal membership.
CREATE OR REPLACE FUNCTION public.protect_client_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.auth_user_role() IS DISTINCT FROM 'admin'
     AND (NEW.user_id, NEW.centre_id, NEW.role, NEW.is_primary, NEW.class_ids)
         IS DISTINCT FROM (OLD.user_id, OLD.centre_id, OLD.role, OLD.is_primary, OLD.class_ids) THEN
    RAISE EXCEPTION 'Admin required to change portal membership' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_client_membership ON public.client_users;
CREATE TRIGGER protect_client_membership BEFORE UPDATE ON public.client_users
FOR EACH ROW EXECUTE FUNCTION public.protect_client_membership();
