import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_DIAGNOSIS_DOMAINS } from "@/lib/diagnosisQuestions";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 로그인한 사용자 소속 학교의 사전/사후검사 문항 조회 (교사·관리자 공통) */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "teacher" && meta.role !== "admin") {
      return NextResponse.json({ error: "교원만 이용할 수 있습니다." }, { status: 403 });
    }

    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) {
      return NextResponse.json({ domains: DEFAULT_DIAGNOSIS_DOMAINS, title: "" });
    }

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    if (!row?.settings_json) {
      return NextResponse.json({ domains: DEFAULT_DIAGNOSIS_DOMAINS, title: "" });
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.settings_json as string) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ domains: DEFAULT_DIAGNOSIS_DOMAINS });
    }
    if (!Array.isArray(parsed.diagnosisDomains) || parsed.diagnosisDomains.length !== 6) {
      return NextResponse.json({ domains: DEFAULT_DIAGNOSIS_DOMAINS, title: "" });
    }
    const domains = parsed.diagnosisDomains as { name: string; items: string[] }[];
    const title = typeof parsed.diagnosisTitle === "string" ? String(parsed.diagnosisTitle).trim() : "";
    return NextResponse.json({ domains, title });
  } catch (e) {
    console.error("diagnosis-settings GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
