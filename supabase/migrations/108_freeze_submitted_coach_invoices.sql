-- Audit §2.10: coaches may edit drafts and submit them, never alter submitted money.
CREATE OR REPLACE FUNCTION public.protect_coach_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR public.auth_user_role() IN ('admin', 'ops') THEN RETURN NEW; END IF;
  IF OLD.status <> 'draft' OR NEW.status NOT IN ('draft', 'flagged', 'ready')
     OR NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.payment_batch_id IS DISTINCT FROM OLD.payment_batch_id THEN
    RAISE EXCEPTION 'Only draft invoices may be edited or submitted' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_coach_invoice ON public.coach_invoices;
CREATE TRIGGER protect_coach_invoice BEFORE UPDATE ON public.coach_invoices
FOR EACH ROW EXECUTE FUNCTION public.protect_coach_invoice();
