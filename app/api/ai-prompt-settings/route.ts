import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_PROMPT_DEFAULTS, AI_PROMPT_KEYS, type AiPromptKey } from "@/lib/aiPromptDefaults";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 관리자: 우리 학교 AI 프롬프트 설정 조회 (기본값과 병합) */
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
      return NextResponse.json({
        prompts: AI_PROMPT_KEYS.reduce((acc, key) => {
          const def = AI_PROMPT_DEFAULTS[key];
          acc[key] = { value: def.template, description: def.description, label: def.label };
          return acc;
        }, {} as Record<string, { value: string; description: string; label: string }>),
      });
    }

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    let overrides: Record<string, string> = {};
    if (row?.settings_json) {
      try {
        const parsed = JSON.parse(row.settings_json as string) as Record<string, unknown>;
        const raw = parsed.aiPromptTemplates;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          overrides = raw as Record<string, string>;
        }
      } catch {
        // ignore
      }
    }

    const prompts = AI_PROMPT_KEYS.reduce((acc, key) => {
      const def = AI_PROMPT_DEFAULTS[key];
      // next_year_goal은 백엔드에서 무조건 기본값을 사용하도록 고정되어 있으므로,
      // 관리자 화면 표시도 기본값(def.template) 기준으로 통일해 혼선을 줄입니다.
      const effectiveValue =
        key === "next_year_goal"
          ? def.template
          : typeof overrides[key] === "string" && overrides[key].trim()
            ? overrides[key].trim()
            : def.template;
      acc[key] = {
        value: effectiveValue,
        description: def.description,
        label: def.label,
      };
      return acc;
    }, {} as Record<string, { value: string; description: string; label: string }>);

    return NextResponse.json({ prompts });
  } catch (e) {
    console.error("ai-prompt-settings GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** 관리자: 우리 학교 AI 프롬프트 설정 저장. body.prompts = { [key]: string } 또는 body.loadDefaults = true */
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

    let aiPromptTemplates: Record<string, string>;

    if (body.loadDefaults === true) {
      aiPromptTemplates = AI_PROMPT_KEYS.reduce((acc, key) => {
        acc[key] = AI_PROMPT_DEFAULTS[key].template;
        return acc;
      }, {} as Record<string, string>);
    } else {
      const raw = body.prompts;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ error: "prompts 객체를 제공해 주세요." }, { status: 400 });
      }
      aiPromptTemplates = {};
      for (const key of AI_PROMPT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(raw, key) && typeof raw[key] === "string") {
          aiPromptTemplates[key] = (raw[key] as string).trim();
        }
      }
    }

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
    const payload = { ...existing, aiPromptTemplates };

    const { error } = await supabase.from("school_point_settings").upsert(
      {
        school_name: schoolName,
        settings_json: JSON.stringify(payload),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_name" }
    );

    if (error) {
      console.error("ai-prompt-settings POST:", error);
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ai-prompt-settings POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
