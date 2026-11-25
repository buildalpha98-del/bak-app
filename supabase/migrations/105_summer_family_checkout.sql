ALTER TABLE public.summer_clinic_orders
  ADD COLUMN booking_children jsonb,
  ADD COLUMN parent_name text,
  ADD COLUMN parent_phone text,
  DROP CONSTRAINT summer_clinic_orders_amount_cents_check,
  ADD CONSTRAINT summer_clinic_order_total CHECK (amount_cents BETWEEN 5000 AND 72000);

CREATE FUNCTION public.reserve_summer_family_order(
  order_key uuid, participants jsonb, guardian_name text, email text, guardian_phone text, client_fingerprint text DEFAULT NULL
) RETURNS public.summer_clinic_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  reserved public.summer_clinic_orders;
  clinic_date date;
  seats integer;
  total integer;
  dates date[];
  child jsonb;
  normalized jsonb;
BEGIN
  IF participants IS NULL OR jsonb_typeof(participants) <> 'array' THEN
    RAISE EXCEPTION 'Enter at least one child.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(participants) NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'Enter between one and six children.' USING ERRCODE = '22023';
  END IF;

  FOR child IN SELECT value FROM jsonb_array_elements(participants) LOOP
    IF coalesce(length(btrim(child->>'name')), 0) NOT BETWEEN 1 AND 100
      OR jsonb_typeof(child->'dates') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Enter the child name and dates.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(child->'dates') NOT IN (1, 3)
      OR jsonb_array_length(child->'dates') <> (SELECT count(DISTINCT d) FROM jsonb_array_elements_text(child->'dates') AS d)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(child->'dates') AS d
        WHERE d IS NULL OR d NOT IN ('2026-12-22','2026-12-24','2027-01-05','2027-01-07','2027-01-12','2027-01-14')
          OR (d::date + TIME '10:00') AT TIME ZONE 'Australia/Sydney' <= now() + interval '90 minutes'
      ) THEN
      RAISE EXCEPTION 'Choose one or three available dates for each child.' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object('name', btrim(p.value->>'name'), 'dates',
    (SELECT jsonb_agg(d ORDER BY d) FROM jsonb_array_elements_text(p.value->'dates') AS d)) ORDER BY p.ordinality),
    sum(CASE jsonb_array_length(p.value->'dates') WHEN 1 THEN 5000 ELSE 12000 END)
  INTO normalized, total FROM jsonb_array_elements(participants) WITH ORDINALITY AS p;
  SELECT array_agg(DISTINCT d::date ORDER BY d::date) INTO dates
  FROM jsonb_array_elements(normalized) AS p, jsonb_array_elements_text(p->'dates') AS d;

  -- Serialize allocation and retries across all six dates.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261222, 100);
  SELECT * INTO reserved FROM public.summer_clinic_orders WHERE id = order_key;
  IF FOUND THEN
    IF coalesce(reserved.booking_children, jsonb_build_array(jsonb_build_object('name', reserved.child_name, 'dates', reserved.clinic_dates))) <> normalized
      OR reserved.parent_name IS DISTINCT FROM guardian_name OR reserved.parent_phone IS DISTINCT FROM guardian_phone
      OR reserved.parent_email <> email OR reserved.status <> 'held'
    THEN
      RAISE EXCEPTION 'This checkout cannot be reused.' USING ERRCODE = '22023';
    END IF;
    RETURN reserved;
  END IF;

  IF client_fingerprint IS NOT NULL AND (
    SELECT count(*) FROM public.summer_clinic_orders
    WHERE client_key = client_fingerprint AND created_at > now() - interval '30 minutes'
  ) >= 6
  THEN
    RAISE EXCEPTION 'Too many recent checkout attempts. Try again in 30 minutes.' USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT count(*) FROM public.summer_clinic_orders
      WHERE lower(parent_email) = lower(email) AND status = 'held') >= 3
  THEN
    RAISE EXCEPTION 'Finish an existing checkout for this email or try again later.' USING ERRCODE = 'P0001';
  END IF;

  FOREACH clinic_date IN ARRAY dates LOOP
    SELECT count(*) INTO seats FROM jsonb_array_elements(normalized) AS p
      WHERE (p->'dates') ? clinic_date::text;

    IF seats + (SELECT coalesce(sum(CASE WHEN o.booking_children IS NULL THEN 1 ELSE
        (SELECT count(*) FROM jsonb_array_elements(o.booking_children) AS p
          WHERE (p->'dates') ? clinic_date::text) END), 0)
        FROM public.summer_clinic_orders o
        WHERE o.status IN ('held', 'paid') AND clinic_date = ANY(o.clinic_dates)) > 100
    THEN
      RAISE EXCEPTION 'Not enough places on %. Change the selected dates and try again.', clinic_date
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO public.summer_clinic_orders
    (id, clinic_dates, child_name, parent_email, amount_cents, client_key, booking_children, parent_name, parent_phone)
  VALUES (order_key, dates, normalized->0->>'name', email, total, client_fingerprint, normalized, guardian_name, guardian_phone)
  RETURNING * INTO reserved;
  RETURN reserved;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_summer_family_order(uuid,jsonb,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_summer_family_order(uuid,jsonb,text,text,text,text) TO service_role;

-- Keep the old reservation RPC write-compatible during deployment.
CREATE OR REPLACE FUNCTION public.reserve_summer_clinic_order(
  order_key uuid, chosen_dates date[], name text, email text, client_fingerprint text DEFAULT NULL
) RETURNS public.summer_clinic_orders
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.reserve_summer_family_order(
    order_key, jsonb_build_array(jsonb_build_object('name', name, 'dates', chosen_dates)),
    NULL, email, NULL, client_fingerprint
  );
$$;
