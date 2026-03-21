# 앱 전역 설정 테이블 (`app_global_settings`)

AI 백엔드 전환(Vertex / Gemini API) 등 **슈퍼관리자** 설정을 DB에 저장하려면 이 테이블이 필요합니다.

## 한 번만 실행

1. [Supabase](https://supabase.com) → 프로젝트 → **SQL Editor**
2. **New query**
3. 저장소의 `supabase/app_global_settings.sql` 파일 **전체**를 복사해 붙여넣기
4. **Run** (또는 Ctrl+Enter)

성공 후 `Table Editor`에서 `app_global_settings`가 보이면 됩니다.

## 오류가 날 때

- **"relation app_global_settings does not exist"** → 위 SQL을 아직 실행하지 않은 경우입니다.
- 테이블을 만들었는데도 실패하면, Vercel의 `SUPABASE_SERVICE_ROLE_KEY`가 해당 Supabase 프로젝트와 맞는지 확인하세요.
