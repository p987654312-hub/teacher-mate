/**
 * AI 텍스트 생성: Google Gemini API(AI Studio 키) 전용.
 * - 일시 과부하(503 등): 같은 키로 재시도한 뒤 보조 모델로 폴백
 * - 쿼터/한도 소진 등: 다음 API 키로 전환 (GEMINI_API_KEY → GEMINI_API_KEY_2 또는 GEMINI_API_KEY2)
 * - 한 번 다음 키로 넘어가면 그 인덱스를 저장하고, 이후 요청은 앞 키를 다시 호출하지 않는다.
 */
import { createClient } from "@supabase/supabase-js";

const STICKY_KEY = "gemini_active_key_index";
/** 이 프로세스에서 확정된 시작 인덱스. 0이면 아직 앞 키를 쓸 수 있어 DB를 다시 본다. */
let memoryKeyIndex = 0;

function getSettingsAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function readStickyIndex(): Promise<number> {
  try {
    const admin = getSettingsAdmin();
    if (!admin) return 0;
    const { data, error } = await admin
      .from("app_global_settings")
      .select("value")
      .eq("key", STICKY_KEY)
      .maybeSingle();
    if (error || data?.value == null) return 0;
    const n = Number.parseInt(String(data.value), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function resolveStartIndex(keyCount: number): Promise<number> {
  const cap = Math.max(0, keyCount - 1);
  if (memoryKeyIndex > 0) return Math.min(memoryKeyIndex, cap);
  const fromDb = await readStickyIndex();
  if (fromDb > memoryKeyIndex) memoryKeyIndex = fromDb;
  return Math.min(memoryKeyIndex, cap);
}

/** 앞 키는 다시 호출하지 않도록 시작 인덱스를 앞으로만 옮긴다. */
async function advanceStickyIndex(nextIndex: number): Promise<void> {
  if (nextIndex <= memoryKeyIndex) return;
  memoryKeyIndex = nextIndex;
  try {
    const admin = getSettingsAdmin();
    if (!admin) return;
    const { error } = await admin.from("app_global_settings").upsert(
      { key: STICKY_KEY, value: String(nextIndex), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (error) console.error("[aiGemini] 활성 키 인덱스 저장 실패:", error.message);
  } catch (e) {
    console.error("[aiGemini] 활성 키 인덱스 저장 실패:", e);
  }
}

/** 사용할 키 목록: GEMINI_API_KEY, GEMINI_API_KEY_2, … 또는 GEMINI_API_KEYS(쉼표 구분) */
export function getGeminiApiKeys(): string[] {
  const fromList = (process.env.GEMINI_API_KEYS ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromList.length > 0) return [...new Set(fromList)];

  const keys: string[] = [];
  const primary = process.env.GEMINI_API_KEY?.trim();
  if (primary) keys.push(primary);
  for (let i = 2; i <= 5; i++) {
    const k =
      process.env[`GEMINI_API_KEY_${i}`]?.trim() ||
      process.env[`GEMINI_API_KEY${i}`]?.trim();
    if (k) keys.push(k);
  }
  return [...new Set(keys)];
}

export function getAiSetupError(): string | null {
  if (getGeminiApiKeys().length === 0) {
    return "GEMINI_API_KEY(또는 GEMINI_API_KEY_2 / GEMINI_API_KEYS) 환경 변수를 설정해주세요.";
  }
  return null;
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

function modelUnavailable(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("no longer available") ||
    msg.includes("is not found")
  );
}

/** 일시적 과부하/혼잡 오류(재시도하면 풀릴 수 있는 종류). 503·overloaded·high demand 등. */
function transientError(err: unknown): boolean {
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

/** 이 키로는 더 이상 쓸 수 없음 → 다음 키로 전환 (쿼터/한도/인증 등) */
function shouldFailoverKey(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  const status = Number((err as { status?: number })?.status ?? NaN);
  return (
    status === 429 ||
    status === 403 ||
    msg.includes("429") ||
    msg.includes("403") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("exceeded") ||
    msg.includes("billing") ||
    msg.includes("insufficient") ||
    msg.includes("permission denied") ||
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid") ||
    msg.includes("consumer_suspended")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateWithKey(
  apiKey: string,
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<{ text: string; modelUsed: string; fallbackFrom: string | null }> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

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

  const models = primary === GEMINI_FALLBACK_MODEL ? [primary] : [primary, GEMINI_FALLBACK_MODEL];
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
        // 이 키 한도/인증 문제면 모델 재시도 없이 키 폴백으로
        if (shouldFailoverKey(e)) throw e;
        if (modelUnavailable(e)) break;
        if (transientError(e) && attempt < MAX_ATTEMPTS) {
          await sleep(attempt * 1000);
          continue;
        }
        if (transientError(e)) break;
        throw e;
      }
    }
  }
  throw lastErr;
}

async function generateGeminiInternal(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<{ text: string; modelUsed: string; fallbackFrom: string | null }> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  const start = await resolveStartIndex(keys.length);
  let lastErr: unknown;
  for (let ki = start; ki < keys.length; ki++) {
    try {
      const result = await generateWithKey(keys[ki], prompt, opts);
      if (ki > 0) {
        console.warn(`[aiGemini] GEMINI_API_KEY 폴백 유지: key#${ki + 1}`);
      }
      return result;
    } catch (e) {
      lastErr = e;
      const hasNext = ki < keys.length - 1;
      if (hasNext && shouldFailoverKey(e)) {
        console.warn(
          `[aiGemini] key#${ki + 1} 한도 소진 → key#${ki + 2}로 고정:`,
          String((e as { message?: string })?.message ?? e).slice(0, 160)
        );
        await advanceStickyIndex(ki + 1);
        continue;
      }
      if (!hasNext || !shouldFailoverKey(e)) throw e;
    }
  }
  throw lastErr;
}

export async function generateGeminiText(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<string> {
  return (await generateGeminiInternal(prompt, opts)).text;
}

export async function generateGeminiTextWithMeta(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<{ text: string; modelUsed: string; fallbackFrom: string | null }> {
  return generateGeminiInternal(prompt, opts);
}
