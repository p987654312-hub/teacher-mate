import { createClient } from "@supabase/supabase-js";
import { generateVertexGeminiText, generateVertexGeminiTextWithMeta, getVertexGeminiSetupError } from "@/lib/vertexGemini";

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

const DEFAULT_STUDIO_GEMINI_MODEL = "gemini-2.5-flash-lite";
const STUDIO_GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

function studioModelUnavailable(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("no longer available") ||
    msg.includes("is not found")
  );
}

/** 일시적 과부하/혼잡 오류(재시도하면 풀릴 수 있는 종류). 503·overloaded·high demand 등. */
function studioTransientError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("high demand") ||
    msg.includes("try again later") ||
    msg.includes("unavailable")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateStudioGeminiInternal(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<{ text: string; modelUsed: string; fallbackFrom: string | null }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_STUDIO_GEMINI_MODEL;

  const call = async (modelId: string) => {
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
  };

  // 1차 모델 → (모델 없음/과부하 시) 보조 모델 순으로 시도. 각 모델은 일시 오류에 한해 백오프 재시도.
  const models = primary === STUDIO_GEMINI_FALLBACK_MODEL ? [primary] : [primary, STUDIO_GEMINI_FALLBACK_MODEL];
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let mi = 0; mi < models.length; mi++) {
    const modelId = models[mi];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const text = await call(modelId);
        return { text, modelUsed: modelId, fallbackFrom: mi > 0 ? models[0] : null };
      } catch (e) {
        lastErr = e;
        // 모델 자체가 없으면 재시도 의미 없음 → 다음 모델로
        if (studioModelUnavailable(e)) break;
        // 일시 과부하면 백오프 후 같은 모델 재시도
        if (studioTransientError(e) && attempt < MAX_ATTEMPTS) {
          await sleep(attempt * 1000);
          continue;
        }
        // 일시 오류로 재시도 소진 → 다음(보조) 모델로 폴백
        if (studioTransientError(e)) break;
        // 그 외(쿼터 초과 등)는 즉시 throw
        throw e;
      }
    }
  }
  throw lastErr;
}

async function generateStudioGeminiText(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<string> {
  return (await generateStudioGeminiInternal(prompt, opts)).text;
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

export async function generateGeminiTextWithMeta(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<{ text: string; backend: AiBackend; modelUsed: string; fallbackFrom: string | null }> {
  const backend = await getAiProvider();
  if (backend === "vertex") {
    const r = await generateVertexGeminiTextWithMeta(prompt, opts);
    return { text: r.text, backend, modelUsed: r.modelUsed, fallbackFrom: r.fallbackFrom };
  }
  const r = await generateStudioGeminiInternal(prompt, opts);
  return { text: r.text, backend, modelUsed: r.modelUsed, fallbackFrom: r.fallbackFrom };
}
