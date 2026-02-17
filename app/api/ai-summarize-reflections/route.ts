import { NextResponse } from "next/server";

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

    const prompt = `[역할] 너는 교사가 작성한 연간 일일성찰일지를 요약 정리하는 전문가이다.

[지시] 아래 일일성찰 기록들을 읽고, 교사의 성장 과정, 주요 경험, 깨달음, 개선점 등을 종합하여 500~1000자 정도의 성찰 요약문을 작성해줘.

[형식 요구사항]
- 자연스러운 문단 형태로 작성 (개조식 X)
- 1인칭 시점("저는", "나는", "내가") 사용
- 교사 본인의 성찰과 성장에 초점
- 구체적인 경험과 배움을 포함
- 전체적으로 긍정적이면서도 성찰적인 톤 유지

[일일성찰 기록]
${reflections}

[출력] 위 일일성찰 기록을 바탕으로 500~1000자 정도의 성찰 요약문을 작성해줘. 인사말이나 제목 없이 바로 본문부터 시작할 것.`;

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
