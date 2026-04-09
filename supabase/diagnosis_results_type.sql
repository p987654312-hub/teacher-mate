-- ============================================================
-- diagnosis_results 테이블에 사전/사후 구분 컬럼 추가
-- ============================================================
-- (사전) 교원 역량 진단 / (사후) 교원 역량 진단 결과를 구분해 저장합니다.
-- 실행: Supabase 대시보드 → SQL Editor → New query → 아래 SQL 붙여넣기 → Run
-- ============================================================

ALTER TABLE diagnosis_results
ADD COLUMN IF NOT EXISTS diagnosis_type text DEFAULT 'pre';

-- (선택) 실시일(사용자 지정). 미설정 시 created_at 날짜를 사용.
ALTER TABLE diagnosis_results
ADD COLUMN IF NOT EXISTS exam_date date;

COMMENT ON COLUMN diagnosis_results.diagnosis_type IS 'pre: 사전 진단, post: 사후 진단';

-- 기존 행은 NULL 또는 'pre'로 두면 (사전) 결과로 조회됩니다.
UPDATE diagnosis_results SET diagnosis_type = 'pre' WHERE diagnosis_type IS NULL;

-- 기존 데이터는 생성일을 실시일로 보정
UPDATE diagnosis_results SET exam_date = (created_at::date) WHERE exam_date IS NULL;
