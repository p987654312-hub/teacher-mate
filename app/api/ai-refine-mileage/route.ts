import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateGeminiText, getAiSetupError } from "@/lib/aiGemini";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 기록 내용을 한 번 필터링·정리해서 짧은 문장으로 반환 */
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

  const aiErr = await getAiSetupError();
  if (aiErr) {
    return NextResponse.json({ error: aiErr }, { status: 500 });
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

    const raw = (await generateGeminiText(prompt)).trim();
    const refinedList = raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const refined = refinedList.length > 0 ? refinedList : [text];

    return NextResponse.json({ refined });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("Error in /api/ai-refine-mileage:", error);
    return NextResponse.json(
      { error: `정리 실패: ${message}` },
      { status: 500 }
    );
  }
}
