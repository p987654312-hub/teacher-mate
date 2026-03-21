import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_PROMPT_DEFAULTS, applyPromptTemplate } from "@/lib/aiPromptDefaults";
import { generateVertexGeminiText, getVertexGeminiSetupError } from "@/lib/vertexGemini";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.email) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
  }

  const vertexErr = getVertexGeminiSetupError();
  if (vertexErr) {
    return NextResponse.json({ error: vertexErr }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { reflections } = body;

    if (!reflections || typeof reflections !== "string" || !reflections.trim()) {
      return NextResponse.json(
        { error: "일일성찰 기록 내용을 제공해주세요." },
        { status: 400 }
      );
    }

    // 학교별 AI 프롬프트 오버라이드 반영
    const meta = (user?.user_metadata ?? {}) as { schoolName?: string };
    const schoolName = (meta.schoolName ?? "").trim();
    let promptTemplates: Record<string, string> = {};
    if (schoolName) {
      const { data: settingsRow } = await supabase
        .from("school_point_settings")
        .select("settings_json")
        .eq("school_name", schoolName)
        .maybeSingle();
      if (settingsRow?.settings_json) {
        try {
          const parsed = JSON.parse(settingsRow.settings_json as string) as Record<string, unknown>;
          const raw = parsed.aiPromptTemplates;
          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            promptTemplates = raw as Record<string, string>;
          }
        } catch {
          // ignore
        }
      }
    }
    const getTemplate = (key: string) => {
      const override = promptTemplates[key];
      const base = (AI_PROMPT_DEFAULTS as Record<string, { template: string }>)[key]?.template;
      return (typeof override === "string" && override.trim() ? override.trim() : base) ?? "";
    };

    const template = getTemplate("reflection_summary");
    if (!template) {
      return NextResponse.json({ error: "reflection_summary 프롬프트 템플릿이 설정되어 있지 않습니다." }, { status: 500 });
    }
    const prompt = applyPromptTemplate(template, { reflections });

    const summary = (await generateVertexGeminiText(prompt)).trim();

    if (!summary || summary === "") {
      return NextResponse.json(
        { error: "AI 요약 결과가 비어있습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error("Error in /api/ai-summarize-reflections:", error);
    const errorMessage = error?.message || "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json(
      { error: `AI 요약 실패: ${errorMessage}` },
      { status: 500 }
    );
  }
}
