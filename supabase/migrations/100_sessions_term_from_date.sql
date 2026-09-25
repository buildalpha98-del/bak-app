-- ============================================================
-- 100: sessions.term_id follows the session's date
-- ============================================================
--
-- A session's term_id came from whichever term was current when the row
-- was created, not from its date: Term 3's whole roster was labelled
-- Term 1 (79 rows re-attached by hand on 2026-09-25, 15 more still
-- wrong on this migration's day). Eighteen reads key sessions by
-- term_id — the term report, the portal's session list and impact
-- numbers, the delivery log's cousins, the coach's term stats, the
-- public stats cache — and each was quietly wrong for those rows.
--
-- The column now maintains itself: on insert, and whenever the date
-- changes, term_id is set to the term whose window contains the date.
-- A date inside no term (holiday drafts) keeps whatever term_id it was
-- given — the column is NOT NULL and those rows are deliberate.
-- Term windows do not overlap today; if they ever do, the earliest term
-- wins so the result is at least deterministic.

CREATE OR REPLACE FUNCTION public.session_term_from_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_term_id uuid;
BEGIN
  SELECT id INTO v_term_id
  FROM public.terms
  WHERE start_date <= NEW.date AND end_date >= NEW.date
  ORDER BY start_date
  LIMIT 1;
  IF v_term_id IS NOT NULL THEN
    NEW.term_id := v_term_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_term_from_date ON public.sessions;
CREATE TRIGGER sessions_term_from_date
  BEFORE INSERT OR UPDATE OF date, term_id ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.session_term_from_date();

-- Backfill: every session whose term does not contain its date, and
-- whose date some term does contain.
UPDATE public.sessions s
SET term_id = t.id
FROM public.terms t
WHERE t.start_date <= s.date AND t.end_date >= s.date
  AND s.term_id <> t.id;
