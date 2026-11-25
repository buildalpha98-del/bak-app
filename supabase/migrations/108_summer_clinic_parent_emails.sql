CREATE TABLE public.summer_clinic_parent_emails (
  order_id uuid NOT NULL REFERENCES public.summer_clinic_orders(id),
  message_key text NOT NULL,
  clinic_date date,
  recipient text NOT NULL,
  send_after timestamptz NOT NULL,
  send_before timestamptz NOT NULL,
  attempted_at timestamptz,
  sent_at timestamptz,
  PRIMARY KEY (order_id, message_key)
);

ALTER TABLE public.summer_clinic_parent_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.summer_clinic_parent_emails FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.summer_clinic_parent_emails TO service_role;

CREATE FUNCTION public.queue_summer_clinic_parent_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'paid' OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN RETURN NEW; END IF;

  INSERT INTO public.summer_clinic_parent_emails (order_id,message_key,recipient,send_after,send_before)
    VALUES (NEW.id,'confirmation',NEW.parent_email,now(),now() + interval '23 hours') ON CONFLICT DO NOTHING;

  INSERT INTO public.summer_clinic_parent_emails
    (order_id,message_key,clinic_date,recipient,send_after,send_before)
    SELECT NEW.id,d::text,d,NEW.parent_email,
      (d - 1 + TIME '09:00') AT TIME ZONE 'Australia/Sydney',
      d::timestamp AT TIME ZONE 'Australia/Sydney'
    FROM unnest(NEW.clinic_dates) AS d
    WHERE (d::timestamp AT TIME ZONE 'Australia/Sydney') > now()
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_summer_clinic_parent_email
AFTER INSERT OR UPDATE OF status ON public.summer_clinic_orders
FOR EACH ROW EXECUTE FUNCTION public.queue_summer_clinic_parent_email();
REVOKE ALL ON FUNCTION public.queue_summer_clinic_parent_email() FROM PUBLIC, anon, authenticated;

-- Existing bookings get reminders for upcoming dates, without duplicate confirmations.
INSERT INTO public.summer_clinic_parent_emails
  (order_id,message_key,clinic_date,recipient,send_after,send_before)
SELECT o.id,d::text,d,o.parent_email,
  (d - 1 + TIME '09:00') AT TIME ZONE 'Australia/Sydney',
  d::timestamp AT TIME ZONE 'Australia/Sydney'
FROM public.summer_clinic_orders o CROSS JOIN unnest(o.clinic_dates) AS d
WHERE o.status = 'paid' AND (d::timestamp AT TIME ZONE 'Australia/Sydney') > now()
ON CONFLICT DO NOTHING;

CREATE FUNCTION public.claim_summer_clinic_parent_emails()
RETURNS SETOF public.summer_clinic_parent_emails
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  WITH ready AS (
    SELECT m.order_id,m.message_key
    FROM public.summer_clinic_parent_emails m
    JOIN public.summer_clinic_orders o ON o.id = m.order_id
    WHERE m.sent_at IS NULL AND o.status = 'paid'
      AND m.send_after <= now() AND m.send_before > now()
      AND (m.attempted_at IS NULL OR m.attempted_at < now() - interval '4 minutes')
    ORDER BY m.attempted_at NULLS FIRST,m.send_after LIMIT 20 FOR UPDATE OF m SKIP LOCKED
  )
  UPDATE public.summer_clinic_parent_emails m SET attempted_at = now()
    FROM ready r WHERE m.order_id = r.order_id AND m.message_key = r.message_key
    RETURNING m.*;
$$;
REVOKE ALL ON FUNCTION public.claim_summer_clinic_parent_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_summer_clinic_parent_emails() TO service_role;
