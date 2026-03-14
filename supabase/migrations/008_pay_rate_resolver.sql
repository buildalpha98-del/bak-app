-- ============================================================
-- Migration 008: Pay rate resolver function
-- Hierarchy: session override → session-type rate → coach default
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_session_pay_rate(
  p_session_id uuid
)
RETURNS decimal(10,2) AS $$
DECLARE
  v_override    decimal(10,2);
  v_coach_id    uuid;
  v_sport       varchar;
  v_session_type_rate decimal(10,2);
  v_default_rate decimal(10,2);
BEGIN
  -- Get session details
  SELECT pay_rate_override, coach_id, sport
  INTO v_override, v_coach_id, v_sport
  FROM sessions
  WHERE id = p_session_id;

  -- 1. Session-level override
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  -- No coach assigned
  IF v_coach_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Session-type rate for this coach (most recent effective)
  SELECT rate INTO v_session_type_rate
  FROM pay_rates
  WHERE user_id = v_coach_id
    AND session_type = (
      -- Map sport/centre type to session_type
      SELECT CASE
        WHEN c.type = 'childcare_centre' THEN 'childcare'
        WHEN c.type = 'school' THEN 'school_local'
        ELSE 'childcare'
      END
      FROM sessions s
      JOIN centres c ON c.id = s.centre_id
      WHERE s.id = p_session_id
    )
    AND effective_from <= (SELECT date FROM sessions WHERE id = p_session_id)
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_session_type_rate IS NOT NULL THEN
    RETURN v_session_type_rate;
  END IF;

  -- 3. Coach default rate
  SELECT default_pay_rate INTO v_default_rate
  FROM profiles
  WHERE id = v_coach_id;

  RETURN v_default_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Trigger to auto-resolve pay rate when session is updated
CREATE OR REPLACE FUNCTION auto_resolve_pay_rate()
RETURNS TRIGGER AS $$
BEGIN
  NEW.pay_rate_resolved := resolve_session_pay_rate(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_resolve_pay_rate
  BEFORE INSERT OR UPDATE OF coach_id, pay_rate_override, centre_id
  ON sessions
  FOR EACH ROW EXECUTE FUNCTION auto_resolve_pay_rate();
