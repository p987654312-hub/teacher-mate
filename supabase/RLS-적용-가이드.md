# RLS 보안 수정 스크립트 수동 적용 가이드

## 왜 앱에서 자동 실행되지 않나요?

- **Supabase 프로젝트**는 보통 대시보드에서 테이블/정책을 만들고, **Next.js 앱**은 그 DB에 연결만 합니다.
- `supabase/rls-security-fix.sql` 같은 **SQL 파일은** Next.js 빌드나 런타임에 실행되지 **않습니다**.  
  Supabase CLI로 `supabase db push` 같은 마이그레이션을 쓰지 않는 한, SQL은 **대시보드에서 직접 실행**해야 합니다.
- 따라서 **이미 만들어진 Supabase 프로젝트**에 RLS 정책을 적용하려면, **Supabase 대시보드 → SQL Editor**에서 아래 내용을 붙여 넣고 **한 번 실행**해 주셔야 합니다.

---

## 이 스크립트가 하는 일

| 대상 테이블 | 내용 |
|------------|------|
| `reflection_drafts` | 기존 정책 제거 후, **본인 이메일(`user_email`)과 로그인 사용자 이메일이 같을 때만** 조회/수정/삭제 허용 |
| `user_preferences` | 위와 동일하게 **본인만** 접근 가능하도록 정책 변경 |
| `mileage_entries` | **RLS 활성화** 후, **본인만** 접근 가능한 정책 생성 |

적용 전에는 정책이 `true`(전체 허용)였을 수 있어, 다른 사용자 데이터도 보일 수 있었습니다.  
적용 후에는 **로그인한 사용자의 이메일과 `user_email`이 같은 행만** 보이고 수정할 수 있습니다.

---

## 적용 방법 (Supabase 대시보드에서 실행)

### 1. Supabase 대시보드 접속

1. 브라우저에서 [https://supabase.com/dashboard](https://supabase.com/dashboard) 접속 후 로그인합니다.
2. 사용 중인 **프로젝트**를 클릭해 해당 프로젝트 대시보드로 들어갑니다.

### 2. SQL Editor 열기

1. 왼쪽 사이드바에서 **「SQL Editor」**를 클릭합니다.
2. **「+ New query」** 버튼을 눌러 새 쿼리 탭을 엽니다.

### 3. 스크립트 붙여넣기 및 실행

1. 프로젝트 루트의 **`supabase/rls-security-fix.sql`** 파일을 엽니다.
2. **파일 내용 전체**를 복사합니다 (Ctrl+A → Ctrl+C).
3. SQL Editor의 빈 입력 칸에 **붙여넣기** (Ctrl+V) 합니다.
4. 우측 상단 또는 하단의 **「Run」** 버튼을 클릭해 실행합니다.
   - 단축키: **Ctrl+Enter** (Windows) / **Cmd+Enter** (Mac)

### 4. 실행 결과 확인

- 성공하면 하단에 **「Success. No rows returned」** 또는 비슷한 성공 메시지가 나옵니다.  
  (이 스크립트는 `SELECT` 결과를 반환하지 않고 정책만 바꾸므로 “No rows returned”가 정상입니다.)
- 에러가 나오면 메시지를 확인한 뒤, 아래 「주의사항」을 참고해 주세요.

---

## 주의사항

- **한 번만** 실행하면 됩니다. 같은 스크립트를 여러 번 실행해도 `DROP POLICY IF EXISTS` / `CREATE POLICY`로 인해 같은 정책으로 유지됩니다.
- **백업**: 중요한 데이터가 있다면, 실행 전에 Supabase 대시보드에서 해당 테이블 데이터를 내보내거나 스냅샷을 고려해 두세요.
- **권한**: 해당 Supabase 프로젝트의 **오너/관리자** 권한이 있어야 SQL Editor에서 실행할 수 있습니다.
- **다른 환경(스테이징, 프로덕션)**: DB가 여러 개라면, **각 Supabase 프로젝트마다** 동일한 스크립트를 SQL Editor에서 한 번씩 실행해 주어야 합니다.

---

## 적용 여부 확인 (선택)

SQL Editor에서 아래를 실행해 보면, RLS가 켜져 있고 정책이 있는지 확인할 수 있습니다.

```sql
-- RLS 활성화 여부
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('reflection_drafts', 'user_preferences', 'mileage_entries');

-- 정책 목록
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('reflection_drafts', 'user_preferences', 'mileage_entries');
```

`rls_enabled`가 `true`이고, 위 스크립트에서 만든 정책 이름이 보이면 적용된 것입니다.

---

정리하면, **앱은 이 SQL을 자동 실행하지 않으므로**, 반드시 **Supabase 대시보드 → SQL Editor**에서 `rls-security-fix.sql` 내용을 붙여 넣고 **Run**으로 한 번 실행해 주시면 됩니다.
