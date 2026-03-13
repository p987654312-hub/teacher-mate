import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 서버 측에서 사용할 관리자 코드
// 1순위: NEXT_PUBLIC_ADMIN_CODE (이미 .env.local 에 설정해 두신 값)
// 2순위: ADMIN_CODE (원하면 더 비공개로 쓸 수 있는 키)
// 3순위: 로컬 개발용 기본값 "pbk"
const ADMIN_CODE_ENV =
  process.env.NEXT_PUBLIC_ADMIN_CODE ||
  process.env.ADMIN_CODE ||
  "pbk";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const code = (body?.code as string | undefined)?.trim() ?? "";
    const schoolName = (body?.schoolName as string | undefined)?.trim() ?? "";

    if (!code || code !== ADMIN_CODE_ENV) {
      return NextResponse.json(
        { ok: false, error: "관리자 인증코드가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    // 코드가 유효하고 schoolName이 있으면 해당 학교 관리자 수 반환 (회원가입/프로필 완성용)
    if (schoolName) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (error) {
        console.error("verify-code listUsers error:", error);
        return NextResponse.json({ ok: true });
      }
      const users = (data?.users ?? []) as Array<{ user_metadata?: { role?: string; schoolName?: string } }>;
      const adminCount = users.filter(
        (u) =>
          (u.user_metadata?.role ?? "") === "admin" &&
          (u.user_metadata?.schoolName ?? "").trim() === schoolName
      ).length;
      return NextResponse.json({ ok: true, adminCount });
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

