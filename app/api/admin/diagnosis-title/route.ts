import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 관리자: 설문 제목만 수정 (GET: 조회, POST: 저장) */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !meta.schoolName?.trim()) {
      return NextResponse.json({ error: "학교 관리자만 조회할 수 있습니다." }, { status: 403 });
    }

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", meta.schoolName.trim())
      .maybeSingle();

    let title = "";
    if (row?.settings_json) {
      try {
        const parsed = JSON.parse(row.settings_json as string) as Record<string, unknown>;
        const survey = parsed.diagnosisSurvey as { title?: string } | undefined;
        title = (survey?.title ?? parsed.diagnosisTitle ?? "") as string;
      } catch {
        // ignore
      }
    }
    return NextResponse.json({ title: typeof title === "string" ? title : "" });
  } catch (e) {
    console.error("diagnosis-title GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !meta.schoolName?.trim()) {
      return NextResponse.json({ error: "학교 관리자만 저장할 수 있습니다." }, { status: 403 });
    }

    const schoolName = meta.schoolName.trim();
    const body = await req.json();
    const title = typeof body.title === "string" ? String(body.title).trim() : "";

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    const existing = row?.settings_json
      ? (() => {
          try {
            return JSON.parse(row.settings_json as string) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : {};

    const survey = existing.diagnosisSurvey as Record<string, unknown> | undefined;
    const updatedSurvey = survey ? { ...survey, title } : { title };
    const payload = {
      ...existing,
      diagnosisSurvey: updatedSurvey,
      diagnosisTitle: title,
    };

    const { error } = await supabase.from("school_point_settings").upsert(
      {
        school_name: schoolName,
        settings_json: JSON.stringify(payload),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_name" }
    );

    if (error) {
      console.error("diagnosis-title POST:", error);
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, title });
  } catch (e) {
    console.error("diagnosis-title POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
