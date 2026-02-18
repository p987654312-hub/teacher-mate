-- ============================================================
-- 학교별 사전/사후검사 문항 설정 (관리자)
-- ============================================================
-- 설정 방법: Supabase 대시보드 → SQL Editor → New query → 아래 SQL 실행
-- ============================================================

CREATE TABLE IF NOT EXISTS school_diagnosis_settings (
  school_name text PRIMARY KEY,
  domains_json text NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
