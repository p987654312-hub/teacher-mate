# 구글 로그인 설정 가이드

## 1. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. **API 및 서비스** > **사용자 인증 정보**로 이동
4. **사용자 인증 정보 만들기** > **OAuth 클라이언트 ID** 선택
5. **애플리케이션 유형**: "웹 애플리케이션" 선택
6. **승인된 리디렉션 URI**에 다음 URL들을 추가:
   ```
   https://[YOUR_SUPABASE_PROJECT_REF].supabase.co/auth/v1/callback
   http://localhost:3000/auth/callback  (개발 환경용)
   ```
   예시: 
   - `https://abcdefghijklmnop.supabase.co/auth/v1/callback`
   - `http://localhost:3000/auth/callback`
   
   **참고**: Supabase가 OAuth를 처리하므로, 실제로는 Supabase의 콜백 URL만 필요하지만, 개발 환경에서 테스트하려면 localhost도 추가하는 것이 좋습니다.
7. **OAuth 클라이언트 ID**와 **클라이언트 보안 비밀번호** 복사

## 2. Supabase 설정

1. [Supabase Dashboard](https://app.supabase.com/)에 접속
2. 프로젝트 선택
3. **Authentication** > **Providers** 메뉴로 이동
4. **Google** 제공업체 찾기
5. **Enable Google provider** 토글 활성화
6. 다음 정보 입력:
   - **Client ID (for OAuth)**: Google Cloud Console에서 복사한 클라이언트 ID
   - **Client Secret (for OAuth)**: Google Cloud Console에서 복사한 클라이언트 보안 비밀번호
7. **Save** 클릭

## 3. 도메인 제한 확인

현재 코드는 `@shingu.sen.es.kr` 도메인만 허용하도록 설정되어 있습니다.

- `app/page.tsx`의 `handleGoogleSignIn` 함수
- `app/auth/callback/route.ts`의 도메인 검증 로직

다른 도메인을 허용하려면 위 파일들의 `ALLOWED_DOMAIN` 상수를 수정하세요.

## 4. 테스트

1. 로그인 페이지에서 "구글로 로그인" 버튼 클릭
2. Google 계정 선택 화면 표시 확인
3. `@shingu.sen.es.kr` 도메인 계정으로 로그인
4. 대시보드로 리다이렉트되는지 확인

## 주의사항

- Google OAuth는 처음 로그인 시 자동으로 계정을 생성합니다
- 기존 이메일/비밀번호 계정과 구글 계정은 별도 계정으로 처리됩니다
- 같은 이메일로 통합하려면 추가 설정이 필요할 수 있습니다
