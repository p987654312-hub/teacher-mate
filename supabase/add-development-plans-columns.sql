-- development_plans 테이블에 필요한 컬럼 추가
-- Supabase 대시보드 → SQL Editor에서 이 스크립트를 실행하세요.

-- 기존 컬럼 (없을 경우 추가)
ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS community_plans jsonb DEFAULT '[]'::jsonb;

ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS other_plans jsonb DEFAULT '[]'::jsonb;

-- 연간 목표 관련 컬럼 (나의 연간 목표 등)
ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS annual_goal text;

ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS expense_annual_goal text;

ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS community_annual_goal text;

ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS book_annual_goal text;

ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS education_annual_goal text;

ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS education_annual_goal_unit text;

ALTER TABLE development_plans
  ADD COLUMN IF NOT EXISTS other_annual_goal text;
