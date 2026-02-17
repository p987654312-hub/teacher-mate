import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { defaultCategories, parseStored } from "@/app/api/points/school-settings/route";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 로그인한 사용자의 소속 학교 6가지 영역(이름·단위) 조회 – 목표/마일리지/반성 등 전역 표시용 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { schoolName?: string };
    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) {
      return NextResponse.json({ categories: defaultCategories() });
    }

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    const { categories } = parseStored(row);
    return NextResponse.json({ categories });
  } catch (e) {
    console.error("school-category-settings GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
