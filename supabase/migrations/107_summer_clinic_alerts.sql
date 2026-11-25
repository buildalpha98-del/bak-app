CREATE TABLE public.summer_clinic_alerts (
  order_id uuid NOT NULL REFERENCES public.summer_clinic_orders(id),
  event text NOT NULL CHECK (event IN ('booking_confirmed', 'voucher_requested')),
  clinic_dates date[] NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz,
  sent_at timestamptz,
  PRIMARY KEY (order_id, event)
);

ALTER TABLE public.summer_clinic_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.summer_clinic_alerts FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.summer_clinic_alerts TO service_role;

CREATE FUNCTION public.queue_summer_clinic_alert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    INSERT INTO public.summer_clinic_alerts (order_id,event,clinic_dates)
      VALUES (NEW.id,'booking_confirmed',NEW.clinic_dates) ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.voucher_state = 'requested' AND (TG_OP = 'INSERT' OR OLD.voucher_state IS DISTINCT FROM 'requested') THEN
    INSERT INTO public.summer_clinic_alerts (order_id,event,clinic_dates)
      VALUES (NEW.id,'voucher_requested',NEW.clinic_dates) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_summer_clinic_alert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER queue_summer_clinic_alert
AFTER INSERT OR UPDATE OF status, voucher_state ON public.summer_clinic_orders
FOR EACH ROW EXECUTE FUNCTION public.queue_summer_clinic_alert();

-- Claim rows before sending. Keep automatic retries inside Resend's 24-hour
-- idempotency window so ambiguous response failures cannot cause late duplicates.
CREATE FUNCTION public.claim_summer_clinic_alerts() RETURNS SETOF public.summer_clinic_alerts
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  WITH ready AS (
    SELECT order_id,event FROM public.summer_clinic_alerts
    WHERE sent_at IS NULL AND queued_at >= now() - interval '23 hours'
      AND (attempted_at IS NULL OR attempted_at < now() - interval '4 minutes')
    ORDER BY attempted_at NULLS FIRST, queued_at LIMIT 25 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.summer_clinic_alerts a SET attempted_at = now()
    FROM ready r WHERE a.order_id = r.order_id AND a.event = r.event
    RETURNING a.*;
$$;
REVOKE ALL ON FUNCTION public.claim_summer_clinic_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_summer_clinic_alerts() TO service_role;
