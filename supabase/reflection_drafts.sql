-- ============================================================
-- 성찰/보고서 초안 저장 (기기·브라우저 간 동기화)
-- ============================================================
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================================

CREATE TABLE IF NOT EXISTS reflection_drafts (
  user_email text PRIMARY KEY,
  goal_achievement_text text NOT NULL DEFAULT '',
  reflection_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reflection_drafts_updated_at ON reflection_drafts(updated_at DESC);

ALTER TABLE reflection_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own reflection draft" ON reflection_drafts
  FOR ALL USING (true) WITH CHECK (true);
