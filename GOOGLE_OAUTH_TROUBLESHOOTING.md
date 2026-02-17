# 구글 로그인 문제 해결 가이드

## 현재 설정 확인 사항

### 1. Google Cloud Console 설정 확인
- ✅ 승인된 리디렉션 URI에 다음이 등록되어 있는지 확인:
  - `https://oirtuhwpcwmfyqoekkad.supabase.co/auth/v1/callback`
  - `http://localhost:3000/auth/callback` (개발 환경용)

### 2. Supabase 설정 확인 (중요!)

Supabase Dashboard에서 다음을 확인하세요:

1. **Authentication > URL Configuration** 메뉴로 이동
2. **Site URL** 확인:
   - 개발 환경: `http://localhost:3000`
   - 프로덕션: 실제 도메인
3. **Redirect URLs** 확인:
   - `http://localhost:3000/auth/callback` 추가되어 있는지 확인
   - `http://localhost:3000/**` (와일드카드) 추가 가능

### 3. 브라우저 콘솔 확인

구글 로그인 버튼 클릭 후 F12를 눌러 콘솔을 열고 다음을 확인:

1. **구글 계정 선택 후**:
   - URL이 `/auth/callback?code=...`로 변경되는지 확인
   - 콘솔에 "Callback page loaded, code: true" 메시지가 나타나는지 확인

2. **콘솔 로그 순서**:
   ```
   Callback page loaded, code: true, error: null
   Exchanging code for session...
   User email: [이메일]
   Session: true
   Domain validated
   User metadata: {...}
   Redirecting to dashboard
   ```

3. **에러가 발생하는 경우**:
   - 에러 메시지를 확인하고 알려주세요
   - "Exchange error"가 나타나면 Supabase 설정 문제일 수 있음
   - "No code parameter"가 나타나면 리다이렉트 URL 문제일 수 있음

### 4. 네트워크 탭 확인

F12 > Network 탭에서:
- `/auth/callback` 요청이 있는지 확인
- `supabase.co/auth/v1/callback` 요청이 있는지 확인
- 에러 상태 코드(4xx, 5xx)가 있는지 확인

## 일반적인 문제와 해결 방법

### 문제 1: 콜백 페이지로 리다이렉트되지 않음
- **원인**: Supabase의 Redirect URLs에 localhost가 등록되지 않음
- **해결**: Supabase Dashboard > Authentication > URL Configuration > Redirect URLs에 `http://localhost:3000/auth/callback` 추가

### 문제 2: "Exchange error" 발생
- **원인**: Supabase 설정 문제 또는 코드가 만료됨
- **해결**: 
  - Supabase Dashboard에서 Google Provider 설정 확인
  - Client ID와 Secret이 올바른지 확인
  - 다시 로그인 시도

### 문제 3: 세션이 저장되지 않음
- **원인**: 브라우저 쿠키/세션 스토리지 문제
- **해결**:
  - 브라우저 캐시 및 쿠키 삭제
  - 시크릿 모드에서 테스트
  - 다른 브라우저에서 테스트

### 문제 4: 로그인 화면으로 다시 돌아옴
- **원인**: 세션이 제대로 저장되지 않았거나 대시보드에서 세션 확인 실패
- **해결**:
  - 콘솔 로그 확인하여 어느 단계에서 실패하는지 확인
  - `lib/supabaseClient.ts`의 세션 스토리지 설정 확인

## 디버깅 체크리스트

- [ ] Google Cloud Console에 리디렉션 URI 등록됨
- [ ] Supabase Dashboard에 Redirect URLs 등록됨
- [ ] Supabase Google Provider 활성화됨
- [ ] Client ID와 Secret이 올바르게 입력됨
- [ ] 브라우저 콘솔에 에러 없음
- [ ] `/auth/callback` 페이지로 리다이렉트됨
- [ ] 콘솔에 "Callback page loaded" 메시지 나타남
- [ ] 세션이 정상적으로 교환됨
