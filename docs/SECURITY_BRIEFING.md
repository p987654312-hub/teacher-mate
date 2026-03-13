# Teacher-Mate 웹앱 보안 브리핑

## 1. Git / 환경변수 보안

### .gitignore
- **`.env*`** : 모든 env 파일 무시 (`.env`, `.env.local`, `.env.development` 등) → **적절함**
- **`!.env.example`** : 예시만 커밋 가능 → **적절함**
- **`*.pem`** : 개인키 등 무시 → **적절함**
- **`/node_modules`, `/.next/`, `/out/`, `/build/`** : 빌드/의존성 제외 → **적절함**

### 노출되면 안 되는 것 (서버 전용, .env에만 두고 Git에 넣지 말 것)
- `SUPABASE_SERVICE_ROLE_KEY` : DB/Admin API 전체 권한
- `GEMINI_API_KEY` (및 `GEMINI_API_KEY_1`~`_5`) : AI 호출·과금
- `ADMIN_CODE` / `NEXT_PUBLIC_ADMIN_CODE` : 관리자 코드 (가능하면 `ADMIN_CODE`만 사용 권장)

### 클라이언트에 노출돼도 되는 것 (NEXT_PUBLIC_)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` : Supabase 공개용
- `NEXT_PUBLIC_ADMIN_CODE` : 관리자 코드 입력용 (노출 시 추측 공격에 취약하므로 강한 값 사용 권장)

---

## 2. Supabase RLS (Row Level Security)

### 잘 적용된 테이블
| 테이블 | RLS | 정책 내용 |
|--------|-----|-----------|
| **daily_reflections** | ✅ 사용 | `auth.jwt() ->> 'email' = user_email` 로 본인만 SELECT/INSERT/UPDATE/DELETE |

### RLS이 있지만 정책이 사실상 “전체 허용”인 테이블 (위험)
| 테이블 | 현재 정책 | 위험 |
|--------|------------|------|
| **reflection_drafts** | `USING (true) WITH CHECK (true)` | 모든 사용자가 모든 행 접근·수정 가능 |
| **user_preferences** | `USING (true) WITH CHECK (true)` | 동일 |

→ **권장**: `auth.jwt() ->> 'email' = user_email` 조건으로 “본인 행만” 제한하는 정책으로 교체.

### RLS 미적용 테이블 (SQL 상 주석/미설정)
- **mileage_entries** : RLS 주석 처리 상태 → **미적용**. anon/service role로 조회 시 모든 학교·사용자 데이터 접근 가능.
- **user_points**, **school_point_settings**, **school_diagnosis_settings**, **diagnosis_results**, **development_plans** 등 : 마이그레이션 파일에 RLS 설정 없음 → Supabase 대시보드에서 현재 정책 확인 필요. 없으면 **테이블 단위로 RLS + 본인/학교 단위 정책** 적용 권장.

---

## 3. Edge Functions

- **supabase/functions** 디렉터리 없음.
- 이 프로젝트에서는 **Supabase Edge Functions 미사용**. 비즈니스 로직·인증은 Next.js API Routes + Supabase Client/Admin으로 처리.

---

## 4. API 노출 및 위험 요소

### 4.1 인증 없이 호출 가능한 API (심각)

| 경로 | 메서드 | 위험 |
|------|--------|------|
| **/api/admin/count-by-school** | POST | `schoolName`만 보내면 해당 학교 관리자 수 반환. **로그인/역할 검사 없음**. |
| **/api/admin/teachers** | POST | `schoolName`만 보내면 해당 학교 교사 목록(id, email, name 등) 반환. **동일하게 인증 없음**. |

→ **즉시 조치 권장**:  
- 두 라우트 모두 `Authorization: Bearer <token>` 검사 후, `user_metadata.role === 'admin'` 및 `user_metadata.schoolName === body.schoolName` 검증 추가.

### 4.2 인증 없이 사용 가능한 API (비용·악용)

| 경로 | 메서드 | 위험 |
|------|--------|------|
| **/api/ai-recommend** | POST | **토큰/세션 검증 없음**. 누구나 type/내용을 넣어 호출 가능 → Gemini 쿼터 소진·과금 증가·스팸/악성 프롬프트 가능. |

→ **권장**:  
- 최소한 `Authorization: Bearer <Supabase JWT>` 검사 후 `getUser(token)`로 로그인 사용자만 허용. (선택) 교사/관리자 역할만 허용.

### 4.3 관리자 코드 관련

| 항목 | 내용 |
|------|------|
| **/api/admin/verify-code** | POST body의 `code`와 서버의 `ADMIN_CODE` 또는 `NEXT_PUBLIC_ADMIN_CODE` 비교. 코드 자체는 응답에 안 나감. |
| **기본값 "pbk"** | `verify-code/route.ts`에 `ADMIN_CODE`/`NEXT_PUBLIC_ADMIN_CODE` 미설정 시 기본값 `"pbk"` 사용. 배포 시 반드시 env에서 다른 강한 코드로 덮어쓰기. |

→ **권장**: 기본값 제거하거나, `NODE_ENV === 'production'`에서는 기본값 사용 불가하도록 처리.

### 4.4 인증이 적용된 API (참고)

- 대부분의 **/api/admin/*** (count-by-school, teachers 제외):  
  - `Authorization` Bearer 토큰으로 `getUser(token)` 후 `role === 'admin'`, `schoolName` 일치 등 검사.
- **/api/points/me**, **/api/points/init**, **/api/points/login**, **/api/account/delete**, **/api/account/reset-data**, **/api/auth/complete-profile** 등:  
  - Bearer 토큰으로 본인/권한 검증 후 처리.

### 4.5 개발 전용 노출

| 경로 | 제한 | 내용 |
|------|------|------|
| **/api/check-env** | `NODE_ENV !== 'development'` 이면 404 | env **키 이름**만 나가고 값은 "설정됨/비어있음" 수준만 반환. 키 값 자체는 노출 안 됨. |

→ 프로덕션에서는 404로 비활성화되어 있어 적절함.

---

## 5. 요약 권장 조치

1. **RLS**
   - `reflection_drafts`, `user_preferences`: 정책을 `auth.jwt() ->> 'email' = user_email` 기준 “본인만”으로 변경.
   - `mileage_entries`: RLS 활성화 + 본인(및 필요 시 학교)만 접근하도록 정책 추가.
   - 그 외 주요 테이블(`user_points`, `school_point_settings`, `diagnosis_results`, `development_plans` 등): Supabase에서 RLS 여부 확인 후, 없으면 테이블별로 정책 설계·적용.

2. **API**
   - `/api/admin/count-by-school`, `/api/admin/teachers`: **반드시** Bearer 인증 + admin 역할·schoolName 검증 추가.
   - `/api/ai-recommend`: Bearer 인증 + 로그인 사용자(및 필요 시 역할) 검증 추가.

3. **관리자 코드**
   - 운영 환경에서는 `ADMIN_CODE`(또는 `NEXT_PUBLIC_ADMIN_CODE`)를 반드시 설정하고, 기본값 `"pbk"`가 프로덕션에서 쓰이지 않도록 코드/배포 설정 정리.

4. **일반**
   - 서비스 롤 키·Gemini 키는 오직 서버(.env, 배포 환경 변수)에만 두고, 클라이언트 번들/노출 경로에 들어가지 않도록 유지.

이 문서는 현재 코드·SQL 기준으로 작성되었습니다. RLS/API 변경 후에는 해당 부분을 다시 점검하는 것이 좋습니다.

---

## 6. 권장 조치 1·2·3 상세 설명

아래는 “즉시 적용 권장”했던 세 가지를, **현재 동작 → 위험 요인 → 수정 방법** 순으로 자세히 정리한 내용입니다.

---

### 6.1 조치 1: `/api/admin/count-by-school` · `/api/admin/teachers` 인증 추가

#### 현재 동작

- **count-by-school** (`app/api/admin/count-by-school/route.ts`)
  - POST body에 `{ "schoolName": "○○초등학교" }` 만 보내면 됨.
  - **Authorization 헤더를 읽지 않음.** 로그인 여부·역할을 전혀 확인하지 않음.
  - 서버는 `auth.admin.listUsers()`로 전 사용자를 가져온 뒤, `schoolName`이 일치하는 **관리자 수**만 세어 `{ adminCount }` 를 반환함.

- **teachers** (`app/api/admin/teachers/route.ts`)
  - 마찬가지로 `{ "schoolName": "○○초등학교" }` 만 보내면 됨.
  - **동일하게 인증 없음.**
  - 해당 학교의 **교사 목록**(id, email, name, schoolName, createdAt)을 그대로 JSON으로 반환함.

즉, **URL만 알면** 누구나 다른 학교 이름을 넣어서 “그 학교 관리자 수”와 “그 학교 교사 명단”을 조회할 수 있는 상태입니다.

#### 위험 요인

- **개인정보·조직 정보 노출**: 교사 이메일·이름·소속이 인증 없이 유출될 수 있음.
- **학교 간 엿보기**: 다른 학교 이름을 대입해 반복 호출하면 여러 학교의 인원·명단을 수집 가능.
- **규정 위반**: 개인정보보호법·교육기관 보안 정책상 “접근 권한 없는 자의 조회”에 해당할 수 있음.

#### 수정 방법 (할 일)

1. **두 라우트 모두**  
   - `Authorization: Bearer <JWT>` 헤더를 읽고,  
   - Supabase `createClient(url, anonKey)` + `auth.getUser(token)` 으로 **호출자 식별**.
2. **호출자가 없으면** → `401 Unauthorized` (예: "로그인이 필요합니다.").
3. **호출자 `user_metadata.role` 이 `'admin'` 이 아니면** → `403 Forbidden` (예: "관리자만 조회할 수 있습니다.").
4. **body의 `schoolName`** 과 **호출자의 `user_metadata.schoolName`** 이 **일치하지 않으면** → `403 Forbidden` (예: "본인 소속 학교만 조회할 수 있습니다.").
5. 위 조건을 모두 통과한 경우에만 기존처럼 `listUsers` 후 count/필터링해서 반환.

참고: 같은 프로젝트의 **`/api/admin/mileage-by-email`** 이 이미 아래 패턴으로 구현되어 있으므로, 그 흐름을 그대로 가져오면 됨.

```ts
// 예: mileage-by-email 에서 쓰는 패턴
const authHeader = req.headers.get("authorization");
const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
if (!token) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

const { data: { user: caller }, error } = await supabase.auth.getUser(token);
if (error || !caller) return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });

const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
if (meta.role !== "admin" || !meta.schoolName)
  return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });

// body.schoolName 과 meta.schoolName 일치 여부도 검사
if ((body.schoolName ?? "").trim() !== (meta.schoolName ?? "").trim())
  return NextResponse.json({ error: "본인 소속 학교만 조회할 수 있습니다." }, { status: 403 });
```

- `count-by-school`·`teachers` 는 **anon key로 만든 클라이언트**로 `getUser(token)` 호출하면 됨. (service role은 관리자용 작업에만 쓰고, “현재 요청자가 누구인지” 검증은 anon + JWT로 하는 구조가 일반적입니다.)

---

### 6.2 조치 2: `/api/ai-recommend` 인증 추가

#### 현재 동작

- **ai-recommend** (`app/api/ai-recommend/route.ts`)
  - POST body에 `type`, `weakDomains`, `strongDomains` 등만 맞게 넣으면 **Gemini API를 호출**하고 결과를 반환함.
  - **Authorization 헤더를 사용하지 않음.** `getUser` / `getSession` 호출이 없음.
  - 따라서 **로그인하지 않은 사용자·봇·외부 스크립트**도 동일한 엔드포인트를 호출할 수 있음.

#### 위험 요인

- **API 비용·쿼터**: Gemini 유료/무료 한도를 인증 없는 호출로 소진할 수 있음.
- **악의적 사용**: 대량 요청·스팸·부적절한 프롬프트 주입 등에 악용될 수 있음.
- **서비스 안정성**: 정상 사용자보다 비인가 호출이 많아지면 응답 지연·한도 초과로 서비스 품질이 떨어질 수 있음.

#### 수정 방법 (할 일)

1. **모든 요청에 대해**  
   - `Authorization: Bearer <JWT>` 를 읽고,  
   - Supabase `auth.getUser(token)` 으로 **로그인 사용자 여부** 확인.
2. **토큰이 없거나, getUser 실패/유효하지 않으면**  
   - `401` 반환 (예: "로그인이 필요합니다.").  
   - 이 경우 **Gemini를 호출하지 않음**.
3. (선택) 교사/관리자만 쓰도록 제한하려면  
   - `user_metadata.role` 이 `teacher` 또는 `admin` 인 경우에만 통과시키고, 그 외는 `403` 처리.

참고: 다른 API들처럼 **anon client + Bearer token**으로 `getUser(token)` 한 번 호출하는 블록을 `POST` 처리 **맨 앞**에 두면 됨.  
(예: `points/me`, `account/delete` 등과 동일한 패턴.)

---

### 6.3 조치 3: RLS 정책 수정 (reflection_drafts, user_preferences) 및 mileage_entries RLS 활성화

#### 현재 동작

- **reflection_drafts**  
  - RLS는 켜져 있으나 정책이 `FOR ALL USING (true) WITH CHECK (true)` 이라  
    **모든 행에 대해 모든 연산(조회/삽입/수정/삭제)이 허용**됨.  
  - 즉, anon key로 접근해도 **다른 사용자의 성찰 초안**을 읽거나 덮어쓸 수 있음.

- **user_preferences**  
  - 동일하게 `USING (true) WITH CHECK (true)` 로 **전체 허용** 상태.

- **mileage_entries**  
  - RLS가 **비활성화**되어 있음. (마이그레이션 파일에 RLS 활성화·정책이 주석 처리됨.)  
  - 앱에서는 **service role**로 DB에 접근하므로, RLS가 꺼져 있으면 **모든 학교·모든 사용자**의 마일리지를 서버에서 자유롭게 읽고 쓸 수 있음.  
  - 만약 실수로 **anon key**로 이 테이블을 조회하는 코드가 생기면, **전체 데이터가 노출**될 수 있음.

#### 위험 요인

- **개인 데이터 침해**: 다른 교사의 성찰 초안·설정·마일리지 기록을 조회/변경할 수 있음.
- **규정·정책**: “본인 데이터만 접근” 원칙을 DB 단에서 지키지 못함.

#### 수정 방법 (할 일)

**A. reflection_drafts**

- 기존 정책을 제거한 뒤, **“본인 email만”** 접근하도록 정책을 다시 만듦.  
  Supabase SQL Editor에서 예시:

```sql
-- 기존 전체 허용 정책 제거
DROP POLICY IF EXISTS "Users can manage own reflection draft" ON reflection_drafts;

-- 본인 행만: JWT의 email과 user_email 컬럼이 일치할 때만 허용
CREATE POLICY "Users can manage own reflection draft"
ON reflection_drafts
FOR ALL
USING ((auth.jwt() ->> 'email') = user_email)
WITH CHECK ((auth.jwt() ->> 'email') = user_email);
```

- `reflection_drafts` 는 PK가 `user_email` 이므로, 한 사용자당 한 행만 있고, 위 조건이면 “본인 행만” 읽고 쓰는 것과 동일함.

**B. user_preferences**

- 마찬가지로 전체 허용 정책을 제거하고, **본인 행만** 허용:

```sql
DROP POLICY IF EXISTS "Users can manage own preferences" ON user_preferences;

CREATE POLICY "Users can manage own preferences"
ON user_preferences
FOR ALL
USING ((auth.jwt() ->> 'email') = user_email)
WITH CHECK ((auth.jwt() ->> 'email') = user_email);
```

- 이 테이블은 `user_email` 컬럼으로 “누구 것인지” 구분하므로, JWT의 `email` 과 일치하는 행만 보이게 됨.

**C. mileage_entries**

- 현재는 RLS가 꺼져 있으므로, **먼저 RLS를 켜고**, **본인 행만** 접근 가능한 정책을 추가함.  
  (참고: 이 앱에서는 관리자가 “다른 교사” 마일리지를 보는 기능이 있고, 그건 **service role**로 API를 통해 조회함. service role은 RLS를 우회하므로, RLS를 켜도 관리자 API는 그대로 동작함. anon key로 직접 테이블을 조회하는 경우만 “본인 것만” 보이게 됨.)

```sql
ALTER TABLE mileage_entries ENABLE ROW LEVEL SECURITY;

-- 본인 행만 CRUD (anon key로 접근할 때 적용됨)
CREATE POLICY "Users can manage own mileage"
ON mileage_entries
FOR ALL
USING ((auth.jwt() ->> 'email') = user_email)
WITH CHECK ((auth.jwt() ->> 'email') = user_email);
```

- 관리자 기능은 **Next.js API에서 service role client**로 `mileage_entries`를 조회하므로, 위 정책의 영향을 받지 않고 기존처럼 다른 교사 데이터도 조회 가능함.

#### 적용 순서 권장

1. **백업/테스트 환경**에서 위 SQL을 실행해 보며, 기존 앱(로그인 후 성찰·설정·마일리지 조회/저장)이 정상 동작하는지 확인.
2. **reflection_drafts** → **user_preferences** → **mileage_entries** 순으로 적용해 보면, 문제 발생 시 롤백이 쉬움.
3. Supabase 대시보드의 **Table Editor**나 **SQL**로 “다른 사용자 email로 행을 넣어본 뒤, anon key로 조회”해 보면, 정책이 잘 적용됐는지 직접 확인할 수 있음.

---

위 1·2·3을 적용하면 “인증 없는 API로 다른 학교/교사 정보 조회”, “비인가 AI 호출”, “DB 단에서 타인 데이터 접근” 세 가지 위험을 크게 줄일 수 있습니다.
