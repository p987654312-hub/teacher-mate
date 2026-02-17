import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 가입 시 기본 100점 부여 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const { error } = await supabase.from("user_points").upsert(
      {
        user_email: user.email,
        base_points: 100,
        login_points: 0,
        last_login_date: null,
        login_points_that_day: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_email" }
    );

    if (error) {
      console.error("points/init:", error);
      return NextResponse.json({ error: "포인트 초기화에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, base_points: 100 });
  } catch (e) {
    console.error("points/init:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
