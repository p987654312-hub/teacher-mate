/**
 * AI 텍스트 생성: Google Gemini API(AI Studio 키) 전용.
 * 일시 과부하(503 등)에는 백오프 재시도 후 보조 모델로 폴백한다.
 */

export function getAiSetupError(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return "GEMINI_API_KEY 환경 변수를 설정해주세요.";
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateGeminiInternal(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<{ text: string; modelUsed: string; fallbackFrom: string | null }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
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

  // 1차 모델 → (모델 없음/과부하 시) 보조 모델 순으로 시도. 각 모델은 일시 오류에 한해 백오프 재시도.
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
        // 모델 자체가 없으면 재시도 의미 없음 → 다음 모델로
        if (modelUnavailable(e)) break;
        // 일시 과부하면 백오프 후 같은 모델 재시도
        if (transientError(e) && attempt < MAX_ATTEMPTS) {
          await sleep(attempt * 1000);
          continue;
        }
        // 일시 오류로 재시도 소진 → 다음(보조) 모델로 폴백
        if (transientError(e)) break;
        // 그 외(쿼터 초과 등)는 즉시 throw
        throw e;
      }
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
