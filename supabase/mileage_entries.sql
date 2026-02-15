-- ============================================================
-- 목적지 마일리지 기록 테이블 (mileage_entries)
-- ============================================================
-- 설정 방법:
-- 1. https://supabase.com 대시보드 로그인
-- 2. 프로젝트 선택 → 왼쪽 메뉴 [SQL Editor]
-- 3. [New query] 클릭 후 아래 SQL 전체 복사해 붙여넣기
-- 4. [Run] 실행
-- ============================================================

CREATE TABLE IF NOT EXISTS mileage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  content text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'training',
    'class_open',
    'community',
    'book_edutech',
    'health',
    'other'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mileage_entries_user_email ON mileage_entries(user_email);
CREATE INDEX IF NOT EXISTS idx_mileage_entries_created_at ON mileage_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mileage_entries_category ON mileage_entries(user_email, category);

-- (선택) RLS: 사용자 본인 데이터만 접근하려면 아래 주석 해제 후 실행
-- ALTER TABLE mileage_entries ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can manage own mileage" ON mileage_entries
--   FOR ALL USING (true);
