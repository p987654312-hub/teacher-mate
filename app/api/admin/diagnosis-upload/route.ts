import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import iconv from "iconv-lite";
import { parseDiagnosisCsv } from "@/lib/parseDiagnosisCsv";

/** CSV 파일을 UTF-8 문자열로 변환 (한글 EUC-KR/CP949 대응) */
function decodeCsvToUtf8(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("\uFFFD") && !/[\uFFFD]/.test(utf8.slice(0, 2000))) return utf8;
  try {
    return iconv.decode(Buffer.from(bytes), "euc-kr");
  } catch {
    return iconv.decode(Buffer.from(bytes), "cp949");
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 관리자: 역량진단 CSV 업로드 → 해당 학교 설문으로 저장 (4대영역). CSV만 가능. */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin") {
      return NextResponse.json({ error: "관리자만 업로드할 수 있습니다." }, { status: 403 });
    }

    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) return NextResponse.json({ error: "학교 정보가 없습니다." }, { status: 400 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "CSV 파일을 선택해 주세요." }, { status: 400 });

    const name = (file.name || "").toLowerCase();
    if (!name.endsWith(".csv")) {
      return NextResponse.json({ error: "CSV 파일만 업로드할 수 있습니다. (.csv)" }, { status: 400 });
    }

    const title = (formData.get("title") as string | null)?.trim() ?? "";
    const buffer = await file.arrayBuffer();
    const content = decodeCsvToUtf8(buffer);
    const result = parseDiagnosisCsv(content);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const survey = { ...result.survey, title: title || result.survey.title };

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

    const payload = {
      ...existing,
      diagnosisSurvey: survey,
      diagnosisTitle: survey.title ?? (typeof existing.diagnosisTitle === "string" ? existing.diagnosisTitle : ""),
      diagnosisUploadFileName: typeof file.name === "string" && file.name.trim() ? file.name.trim() : "",
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
      console.error("diagnosis-upload POST:", error);
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      domains: survey.domains.map((d) => d.name),
      questionCount: survey.questions.length,
      title: survey.title,
      uploadFileName: (file.name || "").trim() || undefined,
    });
  } catch (e) {
    console.error("diagnosis-upload POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
