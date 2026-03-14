-- 028_rerostering.sql
-- Automated rerostering for coach cancellations

-- New enum: cancellation reason
CREATE TYPE cancellation_reason_type AS ENUM ('sick', 'emergency', 'personal', 'other');

-- New enum: offer status
CREATE TYPE rerostering_offer_status AS ENUM (
  'pending_offer', 'offer_sent', 'accepted', 'declined', 'expired', 'no_replacement'
);

-- rerostering_events
CREATE TABLE rerostering_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  original_coach_id UUID NOT NULL REFERENCES profiles(id),
  cancellation_reason cancellation_reason_type NOT NULL,
  cancellation_details TEXT,
  suggestions_json JSONB NOT NULL DEFAULT '[]',
  selected_replacement_id UUID REFERENCES profiles(id),
  offer_status rerostering_offer_status NOT NULL DEFAULT 'pending_offer',
  offer_sent_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  escalated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_rerostering_session ON rerostering_events(session_id);
CREATE INDEX idx_rerostering_status ON rerostering_events(offer_status);
CREATE INDEX idx_rerostering_original ON rerostering_events(original_coach_id);
CREATE INDEX idx_rerostering_replacement ON rerostering_events(selected_replacement_id);

-- RLS
ALTER TABLE rerostering_events ENABLE ROW LEVEL SECURITY;

-- Admin/ops full access
CREATE POLICY "Admin/ops manage rerostering"
  ON rerostering_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Coaches can read events where they are original or replacement
CREATE POLICY "Coaches read own rerostering events"
  ON rerostering_events FOR SELECT
  USING (
    original_coach_id = auth.uid() OR selected_replacement_id = auth.uid()
  );
