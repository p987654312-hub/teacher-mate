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

/** 기록 내용을 한 번 필터링·정리해서 짧은 문장으로 반환 */
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
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json(
        { error: "정리할 내용(text)을 입력해주세요." },
        { status: 400 }
      );
    }

    const prompt = `다음은 교사가 목적지 마일리지에 적은 기록 원문이다. **한 건이든 여러 건이든** 각각 아래 형식으로 정리해서, **한 줄에 한 건씩**만 출력하라. 여러 건이면 줄바꿈으로 구분한다.

[출력 형식] 한 건당 반드시 이 패턴 (활동 먼저, 뒤에 장소):
  YY.MM.DD(요일) 활동내용 (장소) 총 N시간(지역)
예: 26.03.06(화) 등산 (대모산) 총 2시간(서울)
예: 26.03.06(화) 건강체력 향상 (헬스장) 총 3시간(강남구)
예: 26.02.15(토) 디지털 활용 직무연수 (OO연수원) 총 2시간(서초구)

[규칙]
- **활동을 먼저 쓰고, 장소는 괄호 (장소) 로 뒤에 쓴다.** "대모산에서 등산" → "등산 (대모산)", "헬스장에서 운동" → "운동 (헬스장)".
- 원문에 기록이 여러 개(줄바꿈, 쉼표, "그리고", "/" 등으로 구분)면 **각각 따로** 한 줄씩 출력한다.
- 날짜: 원문에 있으면 그대로, 없으면 오늘 날짜를 YY.MM.DD(요일) 형식으로. (연도는 2자리만, 예: 25.06.03)
- 총 N시간 또는 N회: 원문의 시간/회수를 넣고, 없으면 "총 1회" 등으로.
- (지역): 구·동·지역명이 있으면 맨 끝 괄호로, 없으면 생략 가능.
- 불필요한 말·따옴표·번호·설명 금지. 출력은 오직 위 형식의 문장들만, 한 줄에 한 문장.

원문:
"""
${text}
"""

출력 (한 줄에 한 건씩, 여러 건이면 줄바꿈으로 구분):`;

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
        const raw = response.text().trim();
        const refinedList = raw
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const refined = refinedList.length > 0 ? refinedList : [text];

        return NextResponse.json({ refined });
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
    throw lastError;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("Error in /api/ai-refine-mileage:", error);
    return NextResponse.json(
      { error: `정리 실패: ${message}` },
      { status: 500 }
    );
  }
}
