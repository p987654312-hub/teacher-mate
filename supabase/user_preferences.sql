-- user_preferences: 기기/브라우저 간 설정 동기화
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  pref_key text NOT NULL,
  pref_value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_email, pref_key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_email ON user_preferences(user_email);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences" ON user_preferences
  FOR ALL USING (true) WITH CHECK (true);
