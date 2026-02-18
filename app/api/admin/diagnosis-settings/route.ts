import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_DIAGNOSIS_DOMAINS, type DiagnosisDomainConfig } from "@/lib/diagnosisQuestions";
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

function parseSettingsWithDiagnosis(row: { settings_json?: string | null } | null): {
  diagnosisDomains: DiagnosisDomainConfig[];
  diagnosisTitle: string;
} {
  const defaultDomains = DEFAULT_DIAGNOSIS_DOMAINS;
  if (!row?.settings_json) return { diagnosisDomains: defaultDomains, diagnosisTitle: "" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.settings_json as string);
  } catch {
    return { diagnosisDomains: defaultDomains, diagnosisTitle: "" };
  }
  const obj = parsed as Record<string, unknown>;
  const diagnosisTitle = typeof obj.diagnosisTitle === "string" ? String(obj.diagnosisTitle).trim() : "";
  if (!Array.isArray(obj.diagnosisDomains) || obj.diagnosisDomains.length !== 6) {
    return { diagnosisDomains: defaultDomains, diagnosisTitle };
  }
  const domains: DiagnosisDomainConfig[] = obj.diagnosisDomains.map((d: unknown, di: number) => {
    const def = defaultDomains[di];
    if (!d || typeof d !== "object") return def;
    const o = d as Record<string, unknown>;
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : def.name;
    const rawItems = Array.isArray(o.items) ? o.items : [];
    const items = Array.from({ length: 5 }, (_, i) =>
      typeof rawItems[i] === "string" && (rawItems[i] as string).trim()
        ? String(rawItems[i]).trim()
        : (def.items[i] ?? "")
    );
    return { name, items };
  });
  return { diagnosisDomains: domains, diagnosisTitle };
}

/** 관리자: 우리 학교 사전/사후검사 문항 조회 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin") return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });

    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) {
      return NextResponse.json({ domains: DEFAULT_DIAGNOSIS_DOMAINS, title: "" });
    }

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    const { diagnosisDomains, diagnosisTitle } = parseSettingsWithDiagnosis(row);
    return NextResponse.json({ domains: diagnosisDomains, title: diagnosisTitle });
  } catch (e) {
    console.error("admin/diagnosis-settings GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** 관리자: 우리 학교 사전/사후검사 문항 저장 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin") return NextResponse.json({ error: "관리자만 저장할 수 있습니다." }, { status: 403 });

    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) return NextResponse.json({ error: "학교 정보가 없습니다." }, { status: 400 });

    const body = await req.json();
    const diagnosisTitle = typeof body.title === "string" ? String(body.title).trim() : "";
    const rawDomains = (body.domains ?? []) as unknown[];
    if (!Array.isArray(rawDomains) || rawDomains.length !== 6) {
      return NextResponse.json({ error: "6개 역량 영역이 필요합니다." }, { status: 400 });
    }

    const defaultDomains = DEFAULT_DIAGNOSIS_DOMAINS;
    const diagnosisDomains: DiagnosisDomainConfig[] = rawDomains.map((d: unknown, di: number) => {
      const def = defaultDomains[di];
      if (!d || typeof d !== "object") return def;
      const o = d as Record<string, unknown>;
      const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : def.name;
      const rawItems = Array.isArray(o.items) ? o.items : [];
      const items = Array.from({ length: 5 }, (_, i) =>
        typeof rawItems[i] === "string" ? String(rawItems[i]).trim() : (def.items[i] ?? "")
      );
      return { name, items };
    });

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
    const payload = { ...existing, diagnosisDomains, diagnosisTitle };

    const { error } = await supabase.from("school_point_settings").upsert(
      {
        school_name: schoolName,
        settings_json: JSON.stringify(payload),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_name" }
    );

    if (error) {
      console.error("admin/diagnosis-settings POST:", error);
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, domains: diagnosisDomains, title: diagnosisTitle });
  } catch (e) {
    console.error("admin/diagnosis-settings POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
