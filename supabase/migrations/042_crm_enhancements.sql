-- ============================================================
-- 042: CRM Enhancements — Demo Sessions, Lead Documents, Probability
-- ============================================================

-- 1. Demo sessions table
CREATE TABLE demo_sessions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                  uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  scheduled_date           date NOT NULL,
  scheduled_time           time NOT NULL,
  duration_minutes         integer DEFAULT 60,
  coach_id                 uuid REFERENCES profiles(id) ON DELETE SET NULL,
  attendees_expected       integer,
  attendees_actual         integer,
  status                   text NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('scheduled', 'delivered', 'cancelled', 'no_show')),
  outcome                  text CHECK (outcome IN ('positive', 'neutral', 'negative')),
  coach_feedback           text,
  decision_maker_feedback  text,
  created_by               uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               timestamptz DEFAULT now()
);

CREATE INDEX idx_demo_sessions_lead ON demo_sessions(lead_id);
CREATE INDEX idx_demo_sessions_coach_date ON demo_sessions(coach_id, scheduled_date);
CREATE INDEX idx_demo_sessions_date ON demo_sessions(scheduled_date) WHERE status = 'scheduled';

-- 2. Lead documents table
CREATE TABLE lead_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  document_type  text NOT NULL DEFAULT 'other'
                 CHECK (document_type IN ('pitch_deck', 'proposal', 'agreement', 'correspondence', 'other')),
  name           text NOT NULL,
  storage_path   text NOT NULL,
  uploaded_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_lead_documents_lead ON lead_documents(lead_id);

-- 3. Add probability column to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS probability integer DEFAULT 0;

UPDATE leads SET probability = CASE stage
  WHEN 'cold_lead' THEN 5
  WHEN 'contacted' THEN 10
  WHEN 'interested' THEN 25
  WHEN 'free_trial' THEN 50
  WHEN 'proposal_sent' THEN 70
  WHEN 'won' THEN 100
  WHEN 'lost' THEN 0
  WHEN 'churned' THEN 0
  ELSE 0
END;

-- 4. RLS — demo_sessions
ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_sessions_admin_ops_all ON demo_sessions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

CREATE POLICY demo_sessions_coach_read_own ON demo_sessions
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid());

-- 5. RLS — lead_documents
ALTER TABLE lead_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_documents_admin_ops_all ON lead_documents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

-- 6. Storage bucket for lead documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-documents', 'lead-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin/ops upload lead documents'
  ) THEN
    CREATE POLICY "Admin/ops upload lead documents" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'lead-documents'
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops'))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin/ops read lead documents'
  ) THEN
    CREATE POLICY "Admin/ops read lead documents" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'lead-documents'
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops'))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Admin/ops delete lead documents'
  ) THEN
    CREATE POLICY "Admin/ops delete lead documents" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'lead-documents'
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops'))
      );
  END IF;
END $$;
