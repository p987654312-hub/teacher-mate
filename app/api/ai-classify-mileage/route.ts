import { NextResponse } from "next/server";

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k?.trim()) keys.push(k.trim());
  }
  const single = process.env.GEMINI_API_KEY;
  if (keys.length === 0 && single?.trim()) keys.push(single.trim());
  return keys;
}

let keyIndex = 0;

const CATEGORY_KEYS = ["training", "class_open", "community", "book_edutech", "health", "other"] as const;

/** 교사가 입력한 텍스트를 분석해 활동별로 분류하고, YY.MM.DD + 요약 형식으로 반환 */
export async function POST(req: Request) {
  const geminiKeys = getGeminiKeys();
  if (geminiKeys.length === 0) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY를 설정해주세요." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json(
        { error: "입력할 내용(text)을 입력해주세요." },
        { status: 400 }
      );
    }

    const prompt = `[역할] 너는 교사의 학교 생활·역량 강화 활동을 6가지 영역으로 분류하는 전문가이다.

[6가지 카테고리 – 반드시 아래 키만 사용]
- training: 연수(직무·자율) – 직무연수, 자율연수, 연수원 수강 등
- class_open: 수업 공개 – 공개수업, 수업나눔, 동료 장학 등
- community: 교원학습 공동체 – 학습동아리, 연구회, 모임 등
- book_edutech: 전문 서적/에듀테크 – 독서, 책 읽기, 에듀테크 활용, 동영상 시청 등
- health: 건강/체력 – 달리기, 등산, 헬스, 수영, 운동 등
- other: 기타 계획 – 위 5개에 해당하지 않는 기타 활동

[지시]
1. 사용자가 입력한 텍스트에서 **활동 단위**를 구분한다. (여러 문장, 쉼표, "그리고", "어제/오늘" 등으로 나뉜 여러 활동이 있을 수 있음)
2. 각 활동마다 **한 개의 카테고리**를 골라 위 6개 키 중 하나로 지정한다.
3. 각 활동의 **기록용 문장**을 만든다: "YY.MM.DD(요일) 활동요약" 형식. 연도는 2자리(25, 24). 원문에 날짜가 있으면 그날, 없으면 오늘 날짜 사용. 요약은 짧고 구체적으로 (장소·시간·내용 포함).

[출력 형식 – JSON만 출력]
\`\`\`json
[
  { "category": "health", "content": "25.02.15(토) 양재천 달리기 10km" },
  { "category": "book_edutech", "content": "25.02.14(금) 교육과정 도서 독서 2시간" }
]
\`\`\`
- category는 반드시 training, class_open, community, book_edutech, health, other 중 하나.
- content는 반드시 "YY.MM.DD(요일) " 로 시작하고 이어서 활동 요약 한 문장.
- 한 건이면 배열에 1개, 여러 건이면 각각 객체로 추가.

[사용자 입력]
"""
${text}
"""

[출력] JSON 배열만 출력할 것.`;

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const startIdx = keyIndex % geminiKeys.length;
    keyIndex += 1;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < geminiKeys.length; attempt++) {
      const key = geminiKeys[(startIdx + attempt) % geminiKeys.length];
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let raw = response.text().trim();
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) raw = jsonMatch[0];
        const parsed = JSON.parse(raw) as { category: string; content: string }[];
        const entries = (Array.isArray(parsed) ? parsed : [])
          .filter((e) => e && typeof e.category === "string" && typeof e.content === "string")
          .filter((e) => CATEGORY_KEYS.includes(e.category as (typeof CATEGORY_KEYS)[number]))
          .map((e) => ({ category: e.category, content: String(e.content).trim() }))
          .filter((e) => e.content.length > 0);

        return NextResponse.json({ entries });
      } catch (err: unknown) {
        lastError = err;
        const msg = (err instanceof Error ? err.message : "").toLowerCase();
        const isQuotaOrRate =
          (err as { status?: number })?.status === 429 ||
          msg.includes("quota") ||
          msg.includes("rate") ||
          msg.includes("limit") ||
          msg.includes("resource_exhausted");
        if (isQuotaOrRate && attempt < geminiKeys.length - 1) continue;
        throw err;
      }
    }
    const finalError = lastError instanceof Error ? lastError : new Error(String(lastError ?? "모든 API 키로 시도했으나 실패"));
    throw finalError;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("Error in /api/ai-classify-mileage:", error);
    return NextResponse.json(
      { error: `분류 실패: ${message}` },
      { status: 500 }
    );
  }
}
