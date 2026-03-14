-- ============================================================
-- diagnosis_results: 3인칭 결과 분석 원문 전용 컬럼
-- ============================================================
-- 결과보고서·진단 결과 페이지에는 항상 3인칭 원문만 표시.
-- 반성 탭에서 1인칭으로 수정해도 이 컬럼은 갱신하지 않음.
-- 실행: Supabase 대시보드 → SQL Editor → New query → 붙여넣기 → Run
-- ============================================================

ALTER TABLE diagnosis_results
ADD COLUMN IF NOT EXISTS ai_analysis_report text;

COMMENT ON COLUMN diagnosis_results.ai_analysis_report IS '3인칭 결과 분석 원문. 표시용으로만 사용하며, 반성 탭 편집 시 갱신하지 않음.';

-- 기존 행: ai_analysis가 이미 있으면 원문으로 복사 (이미 1인칭으로 덮어쓴 경우 복구는 불가)
UPDATE diagnosis_results
SET ai_analysis_report = ai_analysis
WHERE ai_analysis_report IS NULL AND ai_analysis IS NOT NULL AND (ai_analysis <> '');
