-- ============================================================
-- Migration 042: Launch Foundation Layer
-- New tables for email logging, attendance (enhanced), session
-- notes/photos, child observations, invitations, invoices,
-- and reminder dedup. Also adds action_url + metadata columns
-- to the existing notifications table.
-- ============================================================

-- ========================
-- 1. Extend existing notifications table
-- ========================
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- ========================
-- 2. email_log — tracks all outbound emails
-- ========================
CREATE TABLE email_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_id    uuid REFERENCES profiles(id),
  email_type      text NOT NULL,
  subject         text NOT NULL,
  status          text NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent', 'failed', 'bounced')),
  metadata        jsonb DEFAULT '{}',
  sent_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

-- ========================
-- 3. attendance — coach marks attendance per session per child
-- ========================
CREATE TABLE attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  child_id     uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'present'
               CHECK (status IN ('present', 'absent', 'walk_in')),
  marked_by    uuid NOT NULL REFERENCES profiles(id),
  marked_at    timestamptz DEFAULT now(),
  parent_name  text,
  parent_phone text,
  UNIQUE(session_id, child_id)
);

-- ========================
-- 4. session_notes — coach post-session notes
-- ========================
CREATE TABLE session_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  coach_id      uuid NOT NULL REFERENCES profiles(id),
  general_notes text,
  rating        integer CHECK (rating >= 1 AND rating <= 5),
  completed_at  timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now(),
  UNIQUE(session_id, coach_id)
);

-- ========================
-- 5. session_photos — coach uploads per session
-- ========================
CREATE TABLE session_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  uploaded_by  uuid NOT NULL REFERENCES profiles(id),
  storage_path text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ========================
-- 6. child_observations — per-child notes linked to session
-- ========================
CREATE TABLE child_observations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  child_id    uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES profiles(id),
  observation text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- ========================
-- 7. invitations — bulk and individual user invites
-- ========================
CREATE TABLE invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('parent', 'centre_director', 'coach')),
  centre_id   uuid REFERENCES centres(id),
  school_id   uuid REFERENCES schools(id),
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'expired', 'failed')),
  invited_by  uuid NOT NULL REFERENCES profiles(id),
  accepted_at timestamptz,
  expires_at  timestamptz DEFAULT (now() + interval '30 days'),
  created_at  timestamptz DEFAULT now()
);

-- ========================
-- 8. invoices
-- ========================
CREATE TABLE invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   text NOT NULL UNIQUE,
  centre_id        uuid REFERENCES centres(id),
  school_id        uuid REFERENCES schools(id),
  issue_date       date NOT NULL DEFAULT CURRENT_DATE,
  due_date         date NOT NULL DEFAULT (CURRENT_DATE + 14),
  subtotal         numeric NOT NULL DEFAULT 0,
  gst              numeric NOT NULL DEFAULT 0,
  total            numeric NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  payment_date     date,
  pdf_storage_path text,
  notes            text,
  created_by       uuid NOT NULL REFERENCES profiles(id),
  created_at       timestamptz DEFAULT now()
);

-- ========================
-- 9. invoice_line_items
-- ========================
CREATE TABLE invoice_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES sessions(id),
  description text NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL,
  line_total  numeric NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- ========================
-- 10. reminder_log — prevent double-sends from cron
-- ========================
CREATE TABLE reminder_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id),
  reminder_type text NOT NULL CHECK (reminder_type IN ('parent_24hr', 'coach_24hr')),
  recipient_id  uuid NOT NULL REFERENCES profiles(id),
  sent_at       timestamptz DEFAULT now(),
  UNIQUE(session_id, reminder_type, recipient_id)
);

-- ========================
-- 11. Auto-incrementing invoice number sequence
-- ========================
CREATE SEQUENCE invoice_number_seq START 1;

-- ========================
-- 12. RPC function for invoice number sequence
-- ========================
CREATE OR REPLACE FUNCTION nextval_invoice_number()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$ SELECT nextval('invoice_number_seq'); $$;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read = false;
CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_email_log_recipient ON email_log(recipient_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_centre ON invoices(centre_id);
CREATE INDEX idx_invoices_school ON invoices(school_id);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_reminder_log_session ON reminder_log(session_id);
CREATE INDEX idx_session_notes_session ON session_notes(session_id);
CREATE INDEX idx_session_photos_session ON session_photos(session_id);
CREATE INDEX idx_child_observations_session ON child_observations(session_id);
CREATE INDEX idx_child_observations_child ON child_observations(child_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- ========================
-- email_log: admin only
-- ========================
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin reads email log" ON email_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role inserts email log" ON email_log
  FOR INSERT WITH CHECK (true);

-- ========================
-- attendance: coaches manage their sessions, parents read own children, centre directors read their centre
-- ========================
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage attendance for their sessions" ON attendance
  FOR ALL USING (
    marked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Parents read own children attendance" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM children
      WHERE children.id = attendance.child_id
      AND children.parent_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Centre directors read their sessions attendance" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN centres c ON s.centre_id = c.id
      WHERE s.id = attendance.session_id
      AND c.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- ========================
-- session_notes: coach who created can read/write, admin reads all, centre director reads their centre
-- ========================
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own session notes" ON session_notes
  FOR ALL USING (
    coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Centre directors read their session notes" ON session_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN centres c ON s.centre_id = c.id
      WHERE s.id = session_notes.session_id
      AND c.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- ========================
-- session_photos: coach who uploaded can read/write, admin reads all, centre director reads their centre
-- ========================
ALTER TABLE session_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own session photos" ON session_photos
  FOR ALL USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Centre directors read their session photos" ON session_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN centres c ON s.centre_id = c.id
      WHERE s.id = session_photos.session_id
      AND c.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- ========================
-- child_observations: coach who created can read/write, admin reads all, centre director + parent reads
-- ========================
ALTER TABLE child_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own child observations" ON child_observations
  FOR ALL USING (
    coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Centre directors read their child observations" ON child_observations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN centres c ON s.centre_id = c.id
      WHERE s.id = child_observations.session_id
      AND c.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Parents read own child observations" ON child_observations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM children
      WHERE children.id = child_observations.child_id
      AND children.parent_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- ========================
-- invitations: admin only
-- ========================
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages invitations" ON invitations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ========================
-- invoices: admin manages all, centre directors read their own
-- ========================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages invoices" ON invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Centre directors read own invoices" ON invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM centres c
      WHERE c.id = invoices.centre_id
      AND c.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- ========================
-- invoice_line_items: admin manages all, centre directors read their own
-- ========================
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages line items" ON invoice_line_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Centre directors read own line items" ON invoice_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN centres c ON i.centre_id = c.id
      WHERE i.id = invoice_line_items.invoice_id
      AND c.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- ========================
-- reminder_log: service role only (cron job)
-- ========================
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — only the service role (which bypasses RLS) writes to this table.

-- ========================
-- Storage buckets (run via Supabase Dashboard or supabase CLI)
-- Included here as comments for documentation; actual bucket
-- creation is handled by the storage setup script.
-- ========================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('session-photos', 'session-photos', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false);
