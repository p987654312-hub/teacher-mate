import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_PROMPT_DEFAULTS, applyPromptTemplate } from "@/lib/aiPromptDefaults";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 등록된 Gemini API 키 목록 (GEMINI_API_KEY_1 ~ _5 또는 GEMINI_API_KEY) */
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  const single = process.env.GEMINI_API_KEY;
  if (keys.length === 0 && single?.trim()) keys.push(single.trim());
  return keys;
}

let keyIndex = 0;

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

  const geminiKeys = getGeminiKeys();
  if (geminiKeys.length === 0) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY 또는 GEMINI_API_KEY_1~5 중 하나 이상 설정해주세요." },
      { status: 500 }
    );
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

    // Gemini API 호출 - 키 로테이션(라운드로빈) + 한도 오류 시 다음 키로 재시도
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const startIdx = keyIndex % geminiKeys.length;
    keyIndex += 1;
    let lastError: any = null;

    for (let attempt = 0; attempt < geminiKeys.length; attempt++) {
      const key = geminiKeys[(startIdx + attempt) % geminiKeys.length];
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text().trim();

        if (!summary || summary === "") {
          return NextResponse.json(
            { error: "AI 요약 결과가 비어있습니다." },
            { status: 500 }
          );
        }

        return NextResponse.json({ summary });
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message ?? "").toLowerCase();
        const isQuotaOrRate =
          err?.status === 429 ||
          msg.includes("quota") ||
          msg.includes("rate") ||
          msg.includes("limit") ||
          msg.includes("resource_exhausted");
        if (isQuotaOrRate && attempt < geminiKeys.length - 1) {
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  } catch (error: any) {
    console.error("Error in /api/ai-summarize-reflections:", error);
    const errorMessage = error?.message || "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json(
      { error: `AI 요약 실패: ${errorMessage}` },
      { status: 500 }
    );
  }
}
