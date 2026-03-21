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

export async function getAiProvider(): Promise<AiBackend> {
  if (providerCache && Date.now() < providerCache.expires) {
    return providerCache.value;
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("app_global_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    const raw = (data?.value as string | undefined)?.trim();
    const v: AiBackend = raw === "gemini" ? "gemini" : "vertex";
    providerCache = { value: v, expires: Date.now() + CACHE_MS };
    return v;
  } catch {
    const v: AiBackend = "vertex";
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
  const modelId = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
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
