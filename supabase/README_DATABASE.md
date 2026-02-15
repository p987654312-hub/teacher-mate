# 데이터베이스 설정 (Supabase)

## 목적지 마일리지 테이블 (`mileage_entries`)

마일리지 기록을 저장하려면 Supabase에 테이블을 만들어야 합니다.

### 1. Supabase 대시보드 접속

1. [Supabase](https://supabase.com) 로그인
2. 사용 중인 **프로젝트** 선택

### 2. SQL 실행

1. 왼쪽 메뉴에서 **SQL Editor** 클릭
2. **New query** 버튼 클릭
3. `supabase/mileage_entries.sql` 파일 내용을 **전체 복사**해서 편집창에 붙여넣기
4. **Run** (또는 Ctrl+Enter) 실행

### 3. 확인

- 왼쪽 **Table Editor**에서 `mileage_entries` 테이블이 보이면 성공입니다.
- 컬럼: `id`, `user_email`, `content`, `category`, `created_at`

### 4. 앱에서 사용

- `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 설정되어 있으면  
  마일리지 페이지에서 **작성** 버튼으로 저장할 수 있습니다.

### 문제가 생기면

- **"relation mileage_entries does not exist"** → 위 2번 SQL을 아직 실행하지 않은 경우입니다. `mileage_entries.sql`을 다시 실행하세요.
- **권한 오류** → 해당 프로젝트의 anon key가 맞는지 `.env.local`을 확인하세요.

---

## (사후) 교원 역량 진단 구분 컬럼 (`diagnosis_results.diagnosis_type`)

(사전)과 (사후) 진단 결과를 구분해 저장하려면 `diagnosis_results` 테이블에 컬럼을 추가합니다.

1. SQL Editor에서 **New query** 후 `supabase/diagnosis_results_type.sql` 내용을 붙여넣고 **Run** 실행.
2. 컬럼 `diagnosis_type` (text, 기본값 'pre')이 추가됩니다. `post`는 사후 진단 결과입니다.
