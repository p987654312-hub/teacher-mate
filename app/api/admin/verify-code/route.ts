import { NextResponse } from "next/server";

// 서버 측에서 사용할 관리자 코드
// 1순위: NEXT_PUBLIC_ADMIN_CODE (이미 .env.local 에 설정해 두신 값)
// 2순위: ADMIN_CODE (원하면 더 비공개로 쓸 수 있는 키)
// 3순위: 로컬 개발용 기본값 "pbk"
const ADMIN_CODE_ENV =
  process.env.NEXT_PUBLIC_ADMIN_CODE ||
  process.env.ADMIN_CODE ||
  "pbk";

export async function POST(req: Request) {
  try {
    const { code } = await req.json();

    const inputCode = (code as string | undefined)?.trim() ?? "";

    if (!inputCode || inputCode !== ADMIN_CODE_ENV) {
      return NextResponse.json(
        { ok: false, error: "관리자 인증코드가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in /api/admin/verify-code:", error);
    return NextResponse.json(
      { ok: false, error: "관리자 인증코드 확인 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

