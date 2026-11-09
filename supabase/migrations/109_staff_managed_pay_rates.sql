-- Audit §2.9: coach rate self-service cannot directly change payroll inputs.
-- Existing rates are retained, not retrospectively labelled as approved.
ALTER TABLE public.pay_rates ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
DROP POLICY IF EXISTS coach_write_own_pay_rates ON public.pay_rates;
DROP POLICY IF EXISTS coach_update_own_pay_rates ON public.pay_rates;

CREATE OR REPLACE FUNCTION public.stamp_pay_rate_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF public.auth_user_role() NOT IN ('admin', 'ops') OR public.auth_user_role() IS NULL THEN
      RAISE EXCEPTION 'Staff approval required for pay rates' USING ERRCODE = '42501';
    END IF;
    NEW.approved_by := auth.uid();
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS stamp_pay_rate_approval ON public.pay_rates;
CREATE TRIGGER stamp_pay_rate_approval BEFORE INSERT OR UPDATE ON public.pay_rates
FOR EACH ROW EXECUTE FUNCTION public.stamp_pay_rate_approval();
