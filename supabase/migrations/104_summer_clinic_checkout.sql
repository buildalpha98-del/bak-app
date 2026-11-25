-- The hosted checkout holds seats until Square confirms payment or an operator
-- reconciles and cancels the unpaid order. Never expire a still-payable link.
CREATE TABLE public.summer_clinic_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_dates date[] NOT NULL,
  child_name text NOT NULL,
  parent_email text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents IN (5000, 12000)),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'paid', 'cancelled')),
  square_order_id text UNIQUE,
  square_link_id text UNIQUE,
  square_payment_id text UNIQUE,
  checkout_url text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX summer_clinic_held_check_idx
  ON public.summer_clinic_orders (last_checked_at NULLS FIRST, id)
  WHERE status = 'held' AND square_order_id IS NOT NULL;

ALTER TABLE public.summer_clinic_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.summer_clinic_orders FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.summer_clinic_orders TO service_role;

CREATE FUNCTION public.reserve_summer_clinic_order(
  order_key uuid, chosen_dates date[], name text, email text
) RETURNS public.summer_clinic_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  reserved public.summer_clinic_orders;
  clinic_date date;
BEGIN
  IF chosen_dates IS NULL OR cardinality(chosen_dates) NOT IN (1, 3)
    OR cardinality(chosen_dates) <> (SELECT count(DISTINCT d) FROM unnest(chosen_dates) AS d)
    OR NOT chosen_dates <@ ARRAY[
      DATE '2026-12-22', DATE '2026-12-24', DATE '2027-01-05',
      DATE '2027-01-07', DATE '2027-01-12', DATE '2027-01-14'
    ]
    OR EXISTS (
      SELECT 1 FROM unnest(chosen_dates) AS d
      WHERE (d + TIME '10:00') AT TIME ZONE 'Australia/Sydney' <= now() + interval '90 minutes'
    )
  THEN
    RAISE EXCEPTION 'Choose one or three available clinic dates.' USING ERRCODE = '22023';
  END IF;

  -- Serialize allocation and retries across all six dates.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261222, 100);
  SELECT * INTO reserved FROM public.summer_clinic_orders WHERE id = order_key;
  IF FOUND THEN
    IF reserved.clinic_dates <> chosen_dates OR reserved.child_name <> name
      OR reserved.parent_email <> email OR reserved.status <> 'held'
    THEN
      RAISE EXCEPTION 'This checkout cannot be reused.' USING ERRCODE = '22023';
    END IF;
    RETURN reserved;
  END IF;

  FOREACH clinic_date IN ARRAY chosen_dates LOOP
    IF (SELECT count(*) FROM public.summer_clinic_orders
        WHERE status IN ('held', 'paid') AND clinic_date = ANY(clinic_dates)) >= 100
    THEN
      RAISE EXCEPTION 'One of your chosen dates is full.' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO public.summer_clinic_orders (id, clinic_dates, child_name, parent_email, amount_cents)
  VALUES (order_key, chosen_dates, name, email, CASE cardinality(chosen_dates) WHEN 1 THEN 5000 ELSE 12000 END)
  RETURNING * INTO reserved;
  RETURN reserved;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_summer_clinic_order(uuid,date[],text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_summer_clinic_order(uuid,date[],text,text) TO service_role;
