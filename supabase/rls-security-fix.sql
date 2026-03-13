-- ============================================================
-- RLS 보안 수정: 본인 데이터만 접근하도록 정책 적용
-- ============================================================
-- 적용 방법: Supabase 대시보드 → SQL Editor → New query → 아래 SQL 붙여넣기 → Run
-- ============================================================

-- 1) reflection_drafts: 기존 전체 허용 정책 제거 후 본인만 허용
DROP POLICY IF EXISTS "Users can manage own reflection draft" ON reflection_drafts;

CREATE POLICY "Users can manage own reflection draft"
ON reflection_drafts
FOR ALL
USING ((auth.jwt() ->> 'email') = user_email)
WITH CHECK ((auth.jwt() ->> 'email') = user_email);

-- 2) user_preferences: 기존 전체 허용 정책 제거 후 본인만 허용
DROP POLICY IF EXISTS "Users can manage own preferences" ON user_preferences;

CREATE POLICY "Users can manage own preferences"
ON user_preferences
FOR ALL
USING ((auth.jwt() ->> 'email') = user_email)
WITH CHECK ((auth.jwt() ->> 'email') = user_email);

-- 3) mileage_entries: RLS 활성화 + 본인만 CRUD
ALTER TABLE mileage_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own mileage" ON mileage_entries;

CREATE POLICY "Users can manage own mileage"
ON mileage_entries
FOR ALL
USING ((auth.jwt() ->> 'email') = user_email)
WITH CHECK ((auth.jwt() ->> 'email') = user_email);
