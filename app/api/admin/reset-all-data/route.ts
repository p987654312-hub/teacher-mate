import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 관리자: 해당 학교 모든 구성원(교원·관리자)의 앱 데이터 초기화 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user: caller }, error: callerError } = await supabaseAuth.auth.getUser(token);
    if (callerError || !caller) return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });

    const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !meta.schoolName?.trim()) {
      return NextResponse.json({ error: "학교 관리자만 실행할 수 있습니다." }, { status: 403 });
    }

    const schoolName = meta.schoolName.trim();
    const admin = getSupabaseAdmin();

    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      console.error("reset-all-data listUsers:", listError);
      return NextResponse.json({ error: "구성원 목록을 불러올 수 없습니다." }, { status: 500 });
    }

    const users = (listData?.users ?? []) as Array<{
      id: string;
      email?: string;
      user_metadata?: { role?: string; schoolName?: string };
    }>;
    const emails = users
      .filter((u) => {
        const m = u.user_metadata ?? {};
        return (m.role === "teacher" || m.role === "admin") && (m.schoolName ?? "") === schoolName;
      })
      .map((u) => u.email)
      .filter((e): e is string => !!e);

    if (emails.length === 0) {
      return NextResponse.json({ ok: true, memberCount: 0, message: "초기화할 구성원이 없습니다." });
    }

    await admin.from("diagnosis_results").delete().in("user_email", emails);
    await admin.from("development_plans").delete().in("user_email", emails);
    await admin.from("mileage_entries").delete().in("user_email", emails);
    await admin.from("reflection_drafts").delete().in("user_email", emails);
    await admin.from("user_points").delete().in("user_email", emails);
    await admin.from("user_preferences").delete().in("user_email", emails);

    return NextResponse.json({
      ok: true,
      memberCount: emails.length,
    });
  } catch (e) {
    console.error("reset-all-data POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
