# 포인트/마일리지용 Supabase 테이블 생성

웹이 500 에러 없이 동작하려면 아래 테이블이 필요합니다.

## 방법

1. [Supabase](https://supabase.com) 로그인 → 사용 중인 프로젝트 선택
2. 왼쪽 메뉴 **SQL Editor** 클릭
3. **New query** 선택
4. `supabase/user_points.sql` 파일 내용을 **전부 복사**해서 붙여넣기
5. **Run** (또는 Ctrl+Enter) 실행

실행 후 `user_points`, `school_point_settings` 테이블이 생성됩니다.  
이미 테이블이 있으면 `CREATE TABLE IF NOT EXISTS` 때문에 에러 없이 넘어갑니다.

## 그래도 페이지가 안 열릴 때

- 브라우저에서 **직접** 주소 입력: **http://localhost:3000**
- 터미널에 `✓ Ready` 나온 뒤 1~2분 기다렸다가 새로고침
- 다른 프로그램에서 3000 포트 사용 중이면 `npm run dev` 할 때 포트 변경 가능: `next dev -p 3001` → 주소는 http://localhost:3001
