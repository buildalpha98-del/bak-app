ALTER TABLE public.summer_clinic_orders
  ADD COLUMN voucher_state text CHECK (voucher_state IN ('requested', 'reviewing', 'recorded')),
  ADD COLUMN voucher_claimed_by uuid,
  ADD COLUMN voucher_balance_closed_at timestamptz,
  ADD COLUMN voucher_credit_cents integer NOT NULL DEFAULT 0
    CHECK (voucher_credit_cents >= 0 AND voucher_credit_cents <= amount_cents);

CREATE TABLE public.summer_clinic_voucher_redemptions (
  reference text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.summer_clinic_orders(id),
  child_index integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.summer_clinic_voucher_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.summer_clinic_voucher_redemptions FROM anon, authenticated;

CREATE FUNCTION public.request_summer_voucher_order(
  order_key uuid, participants jsonb, guardian_name text, email text,
  guardian_phone text, client_fingerprint text DEFAULT NULL
) RETURNS public.summer_clinic_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE booking public.summer_clinic_orders;
BEGIN
  SELECT * INTO booking FROM public.reserve_summer_family_order(
    order_key, participants, guardian_name, email, guardian_phone, client_fingerprint
  );
  SELECT * INTO booking FROM public.summer_clinic_orders WHERE id = order_key FOR UPDATE;
  IF booking.status <> 'held' THEN
    RAISE EXCEPTION 'This booking hold has expired.' USING ERRCODE = 'P0001';
  END IF;
  IF booking.voucher_state IS NOT NULL THEN RETURN booking; END IF;
  IF booking.checkout_url IS NOT NULL OR booking.square_order_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM unnest(booking.clinic_dates) AS d
    WHERE (d + TIME '10:00') AT TIME ZONE 'Australia/Sydney' <= now() + interval '26 hours'
  ) THEN
    RAISE EXCEPTION 'Call us to arrange voucher payment for a clinic starting soon.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.summer_clinic_orders SET voucher_state = 'requested'
    WHERE id = order_key RETURNING * INTO booking;
  RETURN booking;
END;
$$;

CREATE FUNCTION public.record_summer_voucher_payment(order_key uuid, operator_id uuid, receipts jsonb)
RETURNS public.summer_clinic_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  booking public.summer_clinic_orders;
  receipt jsonb;
  idx integer;
  reference text;
  amount integer;
BEGIN
  SELECT * INTO booking FROM public.summer_clinic_orders WHERE id = order_key FOR UPDATE;
  IF NOT FOUND OR booking.status <> 'held' OR booking.voucher_state IS DISTINCT FROM 'reviewing'
    OR booking.square_order_id IS NOT NULL OR booking.checkout_url IS NOT NULL
    OR booking.voucher_claimed_by IS DISTINCT FROM operator_id
    OR jsonb_typeof(receipts) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'This request is not assigned to you for review.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(receipts) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Enter at least one official redemption reference.' USING ERRCODE = 'P0001';
  END IF;
  FOR receipt IN SELECT value FROM jsonb_array_elements(receipts) LOOP
    idx := (receipt->>'child')::integer;
    reference := upper(btrim(receipt->>'reference'));
    IF idx IS NULL OR idx < 0 OR idx >= jsonb_array_length(booking.booking_children)
      OR reference IS NULL OR reference !~ '^[A-Z0-9][A-Z0-9-]{3,79}$' THEN
      RAISE EXCEPTION 'Check the child and official redemption reference.' USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(receipts) r WHERE (r->>'child')::integer = idx)
      > (CASE jsonb_array_length(booking.booking_children->idx->'dates') WHEN 1 THEN 1 ELSE 2 END) THEN
      RAISE EXCEPTION 'The voucher amount exceeds this child''s booking.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.summer_clinic_voucher_redemptions VALUES (reference, order_key, idx, now());
  END LOOP;
  amount := jsonb_array_length(receipts) * 5000;
  UPDATE public.summer_clinic_orders SET voucher_state = 'recorded', voucher_credit_cents = amount,
    status = CASE WHEN amount = amount_cents THEN 'paid' ELSE 'held' END
    WHERE id = order_key RETURNING * INTO booking;
  RETURN booking;
END;
$$;

REVOKE ALL ON FUNCTION public.request_summer_voucher_order(uuid,jsonb,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_summer_voucher_payment(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_summer_voucher_order(uuid,jsonb,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_summer_voucher_payment(uuid,uuid,jsonb) TO service_role;
