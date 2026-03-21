-- 앱 전역 설정 (서버에서 service role로만 읽기/쓰기 권장)
-- SQL Editor에서 실행 후, RLS를 쓰는 경우 정책을 별도로 맞추세요.

CREATE TABLE IF NOT EXISTS app_global_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- AI 백엔드: 'vertex' | 'gemini' (기본은 앱에서 vertex로 처리)
-- INSERT INTO app_global_settings (key, value) VALUES ('ai_provider', 'vertex')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
