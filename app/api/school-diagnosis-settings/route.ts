import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseStored } from "@/app/api/points/school-settings/route";
import { DEFAULT_DIAGNOSIS_DOMAINS } from "@/lib/diagnosisQuestions";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 로그인한 사용자의 소속 학교 사전/사후검사 문항(6역량×5문항) 조회 – 진단 페이지 표시용 */
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
      return NextResponse.json({ domains: DEFAULT_DIAGNOSIS_DOMAINS });
    }

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    const { diagnosis_domains } = parseStored(row);
    return NextResponse.json({ domains: diagnosis_domains });
  } catch (e) {
    console.error("school-diagnosis-settings GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
