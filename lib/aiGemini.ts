import { createClient } from "@supabase/supabase-js";
import { generateVertexGeminiText, getVertexGeminiSetupError } from "@/lib/vertexGemini";

export type AiBackend = "vertex" | "gemini";

const SETTINGS_KEY = "ai_provider";
const CACHE_MS = 5000;

let providerCache: { value: AiBackend; expires: number } | null = null;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

export function invalidateAiProviderCache() {
  providerCache = null;
}

/**
 * DB `app_global_settings.ai_provider` 값과 서버 env를 함께 해석합니다.
 * - `gemini` / `vertex` 가 명시되면 그대로 사용
 * - 없거나 비어 있으면: Vertex JSON 없고 GEMINI_API_KEY만 있으면 `gemini`(레거시 키 전용 배포), 아니면 `vertex`
 */
export function resolveAiBackendFromDbValue(raw: string | undefined | null): AiBackend {
  const t = (raw ?? "").trim();
  const hasVertex = !!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim();
  const hasGemini = !!process.env.GEMINI_API_KEY?.trim();
  if (t === "gemini") return "gemini";
  if (t === "vertex") return "vertex";
  return !hasVertex && hasGemini ? "gemini" : "vertex";
}

export async function getAiProvider(): Promise<AiBackend> {
  if (providerCache && Date.now() < providerCache.expires) {
    return providerCache.value;
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("app_global_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    const raw = data?.value as string | undefined;
    const v = resolveAiBackendFromDbValue(raw);
    providerCache = { value: v, expires: Date.now() + CACHE_MS };
    return v;
  } catch {
    const v = resolveAiBackendFromDbValue(null);
    providerCache = { value: v, expires: Date.now() + CACHE_MS };
    return v;
  }
}

function getStudioGeminiSetupError(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return "GEMINI_API_KEY 환경 변수를 설정해주세요.";
  return null;
}

export async function getAiSetupError(): Promise<string | null> {
  const p = await getAiProvider();
  if (p === "vertex") return getVertexGeminiSetupError();
  return getStudioGeminiSetupError();
}

async function generateStudioGeminiText(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
  const modelId = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite-preview";
  const model = genAI.getGenerativeModel({ model: modelId });
  const result =
    opts?.maxOutputTokens != null
      ? await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: opts.maxOutputTokens },
        })
      : await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text().trim();
  if (!text) throw new Error("Gemini API 응답에 텍스트가 없습니다.");
  return text;
}

/** DB의 ai_provider 설정에 따라 Vertex 또는 Gemini API(키)로 호출 */
export async function generateGeminiText(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<string> {
  const p = await getAiProvider();
  if (p === "vertex") return generateVertexGeminiText(prompt, opts);
  return generateStudioGeminiText(prompt, opts);
}
