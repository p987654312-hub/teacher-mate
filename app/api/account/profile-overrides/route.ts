import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** GET: 현재 사용자 profile_overrides 조회 (이름·학교·학급). 표시용으로 사용. */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const emailKey = String(user.email).trim().toLowerCase();

    const { data: row } = await supabase
      .from("user_preferences")
      .select("pref_value")
      .eq("user_email", emailKey)
      .eq("pref_key", "profile_overrides")
      .maybeSingle();

    if (!row?.pref_value) return NextResponse.json({ name: null, schoolName: null, gradeClass: null });

    try {
      const overrides = JSON.parse(String(row.pref_value)) as { name?: string; schoolName?: string; gradeClass?: string };
      return NextResponse.json({
        name: overrides.name ?? null,
        schoolName: overrides.schoolName ?? null,
        gradeClass: overrides.gradeClass ?? null,
      });
    } catch {
      return NextResponse.json({ name: null, schoolName: null, gradeClass: null });
    }
  } catch (e) {
    console.error("profile-overrides GET:", e);
    return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** POST: 현재 사용자 profile_overrides 저장 (이름·학교·학급). 로그인 후에도 유지되도록 DB에 저장. */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const emailKey = String(user.email).trim().toLowerCase();

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const schoolName = typeof body.schoolName === "string" ? body.schoolName.trim() : "";
    const gradeClass = typeof body.gradeClass === "string" ? body.gradeClass.trim() : "";

    const { error: upsertError } = await supabase.from("user_preferences").upsert(
      {
        user_email: emailKey,
        pref_key: "profile_overrides",
        pref_value: JSON.stringify({ name, schoolName, gradeClass }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_email,pref_key" }
    );

    if (upsertError) {
      console.error("profile-overrides POST upsert:", upsertError);
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("profile-overrides POST:", e);
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
