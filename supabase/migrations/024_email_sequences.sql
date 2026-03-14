-- ============================================================
-- 024: Email Sequences & Automation for CRM
-- ============================================================

-- Email sequences table
CREATE TABLE email_sequences (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  description    text,
  trigger_stage  lead_stage NOT NULL,
  is_active      boolean DEFAULT true,
  created_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- Email sequence steps
CREATE TABLE email_sequence_steps (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id   uuid NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_number   int NOT NULL,
  delay_days    int NOT NULL DEFAULT 0,
  subject       text NOT NULL,
  body          text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(sequence_id, step_number)
);

CREATE INDEX idx_sequence_steps_seq ON email_sequence_steps(sequence_id, step_number);

-- Email send status enum
CREATE TYPE email_send_status AS ENUM ('scheduled', 'sent', 'opened', 'clicked', 'failed', 'skipped');

-- Email sends tracking
CREATE TABLE email_sends (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id   uuid NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_id       uuid NOT NULL REFERENCES email_sequence_steps(id) ON DELETE CASCADE,
  status        email_send_status NOT NULL DEFAULT 'scheduled',
  scheduled_for timestamptz NOT NULL,
  sent_at       timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_email_sends_lead ON email_sends(lead_id, created_at DESC);
CREATE INDEX idx_email_sends_scheduled ON email_sends(status, scheduled_for) WHERE status = 'scheduled';

-- Add sequence tracking to leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS active_sequence_id uuid REFERENCES email_sequences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sequence_paused boolean DEFAULT false;

-- RLS
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

-- Admin/ops access
CREATE POLICY email_sequences_all ON email_sequences
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

CREATE POLICY email_sequence_steps_all ON email_sequence_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

CREATE POLICY email_sends_all ON email_sends
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'ops')));

-- ============================================================
-- Seed: Pre-built sequences
-- ============================================================

-- Cold Outreach
INSERT INTO email_sequences (id, name, description, trigger_stage) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cold Outreach', 'Introduction sequence for new cold leads', 'contacted');

INSERT INTO email_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
  ('00000000-0000-0000-0000-000000000001', 1, 0,
   'Introducing Build Alpha Kids — Multi-Sport Coaching for {centre_name}',
   'Hi {contact_name},

I''m reaching out from Build Alpha Kids. We provide professional multi-sport coaching programs for childcare centres and schools across South-West Sydney.

Our coaches deliver engaging, age-appropriate sessions covering 19+ sports — from Soccer and Basketball to Yoga, Dance, and Athletics.

We''d love to discuss how we can bring quality sports coaching to {centre_name}.

Would you be open to a quick chat this week?

Best regards,
{your_name}
Build Alpha Kids'),
  ('00000000-0000-0000-0000-000000000001', 2, 3,
   'The Build Alpha Kids Difference — 19+ Sports for Your Children',
   'Hi {contact_name},

I wanted to follow up on my earlier email and share a bit more about what makes Build Alpha Kids special.

Our programs cover: {sport_list}

Each session is tailored to the age group and delivered by qualified, Working With Children Checked coaches. We handle everything — programs, equipment, and reporting.

Interested in learning more?

Best regards,
{your_name}
Build Alpha Kids'),
  ('00000000-0000-0000-0000-000000000001', 3, 7,
   'What Our Partner Centres Say About Build Alpha Kids',
   'Hi {contact_name},

We currently partner with over 40 centres across Bankstown and Liverpool. Our centres consistently rate our sessions 4+ out of 5 stars.

Here''s what sets us apart:
- Professional, reliable coaches
- Diverse sport selection
- End-of-term reports with attendance and skill assessments
- Flexible scheduling to suit your centre

Would a free trial session be of interest?

Best regards,
{your_name}
Build Alpha Kids'),
  ('00000000-0000-0000-0000-000000000001', 4, 14,
   'Free Trial Session at {centre_name}?',
   'Hi {contact_name},

We''d love to offer {centre_name} a complimentary trial session so you can see our coaching in action.

No obligations — just a chance to experience the Build Alpha Kids program firsthand.

Shall I arrange a suitable date?

Best regards,
{your_name}
Build Alpha Kids'),
  ('00000000-0000-0000-0000-000000000001', 5, 21,
   'Still Interested? Let''s Connect — Build Alpha Kids',
   'Hi {contact_name},

Just checking in one last time. If multi-sport coaching is something {centre_name} would benefit from, I''d be happy to arrange a quick call or visit.

No pressure at all — feel free to reach out whenever the timing is right.

Best regards,
{your_name}
Build Alpha Kids');

-- Post-Trial
INSERT INTO email_sequences (id, name, description, trigger_stage) VALUES
  ('00000000-0000-0000-0000-000000000002', 'Post-Trial Follow Up', 'Follow up sequence after a free trial session', 'free_trial');

INSERT INTO email_sequence_steps (sequence_id, step_number, delay_days, subject, body) VALUES
  ('00000000-0000-0000-0000-000000000002', 1, 0,
   'How Was Your Trial Session at {centre_name}?',
   'Hi {contact_name},

Thank you for hosting a Build Alpha Kids trial session at {centre_name}! We hope the children enjoyed it.

We''d love to hear your feedback — what worked well? What could we do differently?

Your input helps us tailor our programs to best suit your centre.

Best regards,
{your_name}
Build Alpha Kids'),
  ('00000000-0000-0000-0000-000000000002', 2, 3,
   'Your Trial Session Highlights — {centre_name}',
   'Hi {contact_name},

Here are some highlights from your recent trial session:

Our coach delivered an engaging session and the children had a fantastic time. We can provide detailed reports including attendance and skill development for every term.

Would you like to discuss making this a regular program at {centre_name}?

Best regards,
{your_name}
Build Alpha Kids'),
  ('00000000-0000-0000-0000-000000000002', 3, 7,
   'Ready to Make It Permanent? — Build Alpha Kids at {centre_name}',
   'Hi {contact_name},

Following your successful trial, we''d love to set up a regular coaching schedule at {centre_name}.

We offer flexible arrangements:
- Weekly sessions (most popular)
- Fortnightly options
- Term-based commitments

I can prepare a tailored proposal for you. Shall we set up a time to discuss?

Best regards,
{your_name}
Build Alpha Kids');
