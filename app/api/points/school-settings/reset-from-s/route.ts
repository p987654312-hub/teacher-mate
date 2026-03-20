import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseStored } from "@/app/api/points/school-settings/route";

const PRESET_SCHOOL_NAME = "S초등학교";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** S초등학교 설정값을 기준으로, 현재 학교 설정을 초기화할 때 쓸 프리셋 조회 (관리자) */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (userData.user.user_metadata ?? {}) as { role?: string };
    if (meta.role !== "admin") return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", PRESET_SCHOOL_NAME)
      .maybeSingle();

    const { points, categories } = parseStored(row as any);
    return NextResponse.json({ settings: points, categories });
  } catch (e) {
    console.error("points/school-settings/reset-from-s GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

