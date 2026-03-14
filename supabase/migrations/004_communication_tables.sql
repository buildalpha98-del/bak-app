-- ============================================================
-- Migration 004: Communication — announcements, messages,
--   documents, feedback, notifications
-- ============================================================

-- 19. announcements
CREATE TABLE announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  attachments jsonb,
  audience    announcement_audience NOT NULL DEFAULT 'all',
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 20. announcement_reads
CREATE TABLE announcement_reads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

-- 21. shift_threads
CREATE TABLE shift_threads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 22. direct_messages
CREATE TABLE direct_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 23. documents
CREATE TABLE documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  category           document_category NOT NULL DEFAULT 'other',
  file_url           text NOT NULL,
  file_name          text NOT NULL,
  tags               jsonb DEFAULT '[]'::jsonb,
  version            int NOT NULL DEFAULT 1,
  parent_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  uploaded_by        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  visibility         document_visibility NOT NULL DEFAULT 'all',
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- 25. feedback_ratings
CREATE TABLE feedback_ratings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  centre_id      uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  rating         int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  feedback_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  submitted_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 27. notification_preferences
CREATE TABLE notification_preferences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type varchar(50) NOT NULL,
  channel           notification_channel NOT NULL DEFAULT 'push',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type)
);

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
