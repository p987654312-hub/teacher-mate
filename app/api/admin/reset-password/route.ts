import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

const RESET_PASSWORD = "123456";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller }, error: callerError } = await supabaseAuth.auth.getUser(token);
    if (callerError || !caller) {
      return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
    }

    const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !meta.schoolName) {
      return NextResponse.json({ error: "관리자만 비밀번호를 초기화할 수 있습니다." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { data: targetUser, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetUser?.user) {
      return NextResponse.json({ error: "해당 회원을 찾을 수 없습니다." }, { status: 404 });
    }

    const targetMeta = (targetUser.user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (targetMeta.schoolName !== meta.schoolName) {
      return NextResponse.json({ error: "같은 학교 소속 회원만 초기화할 수 있습니다." }, { status: 403 });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: RESET_PASSWORD,
    });
    if (updateError) {
      console.error("reset-password update error:", updateError);
      return NextResponse.json({ error: "비밀번호 초기화에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "비밀번호가 123456으로 초기화되었습니다." });
  } catch (error) {
    console.error("reset-password error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
