-- 032_ai_assistant.sql
-- AI Coach Assistant: conversations, cache, and rate limiting

-- ai_assistant_conversations
CREATE TABLE IF NOT EXISTS ai_assistant_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES sessions(id) ON DELETE SET NULL,
  messages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ai_assistant_cache
CREATE TABLE IF NOT EXISTS ai_assistant_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  text NOT NULL UNIQUE,
  response   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- ai_assistant_usage (daily rate limiting)
CREATE TABLE IF NOT EXISTS ai_assistant_usage (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  count     int NOT NULL DEFAULT 0,
  UNIQUE(coach_id, usage_date)
);

-- RLS
ALTER TABLE ai_assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_usage ENABLE ROW LEVEL SECURITY;

-- Coaches can only access their own conversations
CREATE POLICY "coach_own_conversations" ON ai_assistant_conversations
  FOR ALL USING (coach_id = auth.uid());

-- Admin can view all conversations (for analytics)
CREATE POLICY "admin_all_conversations" ON ai_assistant_conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Cache is readable by all authenticated users, writable by server
CREATE POLICY "authenticated_read_cache" ON ai_assistant_cache
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Usage: coaches see own, admin sees all
CREATE POLICY "coach_own_usage" ON ai_assistant_usage
  FOR ALL USING (coach_id = auth.uid());

CREATE POLICY "admin_all_usage" ON ai_assistant_usage
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Indexes
CREATE INDEX idx_ai_conversations_coach ON ai_assistant_conversations(coach_id);
CREATE INDEX idx_ai_conversations_session ON ai_assistant_conversations(session_id);
CREATE INDEX idx_ai_cache_key ON ai_assistant_cache(cache_key);
CREATE INDEX idx_ai_cache_expires ON ai_assistant_cache(expires_at);
CREATE INDEX idx_ai_usage_coach_date ON ai_assistant_usage(coach_id, usage_date);
