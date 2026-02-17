-- ============================================================
-- 열정 포인트: user_points, school_point_settings
-- ============================================================
-- 설정 방법: Supabase 대시보드 → SQL Editor → New query → 아래 SQL 실행
-- ============================================================

-- 사용자별 포인트 (가입 100점, 로그인 2점/회·일 10점 상한)
CREATE TABLE IF NOT EXISTS user_points (
  user_email text PRIMARY KEY,
  base_points int NOT NULL DEFAULT 100,
  login_points int NOT NULL DEFAULT 0,
  last_login_date date,
  login_points_that_day int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 학교별 마일리지 단위당 점수 설정 (관리자 포인트 설정)
CREATE TABLE IF NOT EXISTS school_point_settings (
  school_name text PRIMARY KEY,
  settings_json text NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_points_updated ON user_points(updated_at DESC);
