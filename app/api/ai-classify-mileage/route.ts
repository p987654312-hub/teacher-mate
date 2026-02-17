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

/** 날짜 범위와 요일 패턴을 파싱하여 해당하는 모든 날짜를 계산 */
function calculateDateRange(
  text: string,
  currentDate: Date
): { startDate: Date; endDate: Date; weekday?: number } | null {
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const currentDay = currentDate.getDate();
  
  // "1월부터 지금까지", "1월부터 2월까지", "1월부터 현재까지" 같은 패턴 찾기
  const monthRangeMatch = text.match(/(\d+)월\s*부터\s*(지금까지|현재까지|오늘까지|(\d+)월\s*까지)/);
  if (!monthRangeMatch) return null;
  
  const startMonth = parseInt(monthRangeMatch[1], 10);
  if (startMonth < 1 || startMonth > 12) return null;
  
  const endMonthText = monthRangeMatch[2];
  let endMonth: number;
  let endDay: number;
  
  if (endMonthText.includes("지금까지") || endMonthText.includes("현재까지") || endMonthText.includes("오늘까지")) {
    endMonth = currentMonth;
    endDay = currentDay;
  } else {
    const endMonthMatch = endMonthText.match(/(\d+)월/);
    if (!endMonthMatch) return null;
    endMonth = parseInt(endMonthMatch[1], 10);
    if (endMonth < 1 || endMonth > 12) return null;
    // 해당 월의 마지막 날짜 계산
    const lastDayOfMonth = new Date(currentYear, endMonth, 0).getDate();
    endDay = lastDayOfMonth;
  }
  
  // 요일 패턴 찾기 (매주 토요일, 매주 일요일 등)
  const weekdayMap: Record<string, number> = {
    "일요일": 0, "일": 0,
    "월요일": 1, "월": 1,
    "화요일": 2, "화": 2,
    "수요일": 3, "수": 3,
    "목요일": 4, "목": 4,
    "금요일": 5, "금": 5,
    "토요일": 6, "토": 6,
  };
  
  let weekday: number | undefined;
  // "매주 토요일", "매 토요일", "토요일마다" 등 다양한 패턴 매칭 (우선순위: 긴 패턴부터)
  for (const [key, value] of Object.entries(weekdayMap)) {
    if (text.includes(`매주 ${key}`) || text.includes(`매 ${key}`) || text.includes(`${key}마다`) || 
        (text.includes(key) && (text.includes("매주") || text.includes("매") || text.includes("마다")))) {
      weekday = value;
      break;
    }
  }
  
  // 시작 날짜 계산 (해당 월의 첫 번째 해당 요일)
  const startDate = new Date(currentYear, startMonth - 1, 1);
  if (weekday !== undefined) {
    const firstWeekday = startDate.getDay();
    const daysToAdd = (weekday - firstWeekday + 7) % 7;
    startDate.setDate(1 + daysToAdd);
  }
  
  // 종료 날짜
  const endDate = new Date(currentYear, endMonth - 1, endDay);
  
  // 시작일이 종료일보다 늦으면 null 반환
  if (startDate > endDate) return null;
  
  return { startDate, endDate, weekday };
}

/** 날짜 범위의 모든 해당 요일 날짜 리스트 생성 */
function generateDateList(
  startDate: Date,
  endDate: Date,
  weekday?: number
): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  
  if (weekday !== undefined) {
    // 특정 요일만
    while (current <= endDate) {
      if (current.getDay() === weekday) {
        const year = String(current.getFullYear()).slice(-2);
        const month = String(current.getMonth() + 1).padStart(2, "0");
        const day = String(current.getDate()).padStart(2, "0");
        const weekdayStr = ["일", "월", "화", "수", "목", "금", "토"][current.getDay()];
        dates.push(`${year}.${month}.${day}(${weekdayStr})`);
      }
      current.setDate(current.getDate() + 1);
    }
  } else {
    // 모든 날짜
    while (current <= endDate) {
      const year = String(current.getFullYear()).slice(-2);
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const day = String(current.getDate()).padStart(2, "0");
      const weekdayStr = ["일", "월", "화", "수", "목", "금", "토"][current.getDay()];
      dates.push(`${year}.${month}.${day}(${weekdayStr})`);
      current.setDate(current.getDate() + 1);
    }
  }
  
  return dates;
}

const DEFAULT_CATEGORY_DESC: Record<string, string> = {
  training: "연수(직무·자율) – 직무연수, 자율연수, 연수원 수강 등",
  class_open: "수업 공개 – 공개수업, 수업나눔, 동료 장학 등",
  community: "교원학습 공동체 – 학습동아리, 연구회, 모임 등",
  book_edutech: "전문 서적/에듀테크 – 독서, 책 읽기, 에듀테크 활용, 동영상 시청 등",
  health: "건강/체력 – 달리기, 등산, 헬스, 수영, 운동 등",
  other: "기타 계획 – 위 5개에 해당하지 않는 기타 활동",
};

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

    const customCategories = Array.isArray(body.categories) && body.categories.length === 6 ? body.categories as { key: string; label: string; unit?: string }[] : null;
    const currentDateStr = typeof body?.currentDate === "string" ? body.currentDate : new Date().toISOString().split('T')[0];
    const currentDate = new Date(currentDateStr);
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const currentDay = currentDate.getDate();
    const currentWeekday = ["일", "월", "화", "수", "목", "금", "토"][currentDate.getDay()];
    const todayStr = `${String(currentYear).slice(-2)}.${String(currentMonth).padStart(2, "0")}.${String(currentDay).padStart(2, "0")}(${currentWeekday})`;
    
    const categoryLines = customCategories
      ? CATEGORY_KEYS.map((key) => {
          const c = customCategories.find((x) => x && x.key === key);
          const label = (c?.label ?? "").trim() || DEFAULT_CATEGORY_DESC[key];
          const unit = c?.unit || "";
          return `- ${key}: ${label}${unit ? ` (단위: ${unit})` : ""}`;
        }).join("\n")
      : CATEGORY_KEYS.map((key) => `- ${key}: ${DEFAULT_CATEGORY_DESC[key]}`).join("\n");

    const unitInfo = customCategories
      ? CATEGORY_KEYS.map((key) => {
          const c = customCategories.find((x) => x && x.key === key);
          return `${key}: ${c?.unit || ""}`;
        }).join(", ")
      : "";

    // 날짜 범위 계산
    const dateRange = calculateDateRange(text, currentDate);
    let dateList: string[] = [];
    if (dateRange) {
      dateList = generateDateList(dateRange.startDate, dateRange.endDate, dateRange.weekday);
    }

    const prompt = `[역할] 너는 교사의 학교 생활·역량 강화 활동을 6가지 영역으로 분류하는 전문가이다.

[6가지 카테고리 – 반드시 아래 키만 사용]
${categoryLines}

[현재 날짜] ${todayStr} (오늘 날짜)

[중요: 날짜 범위 계산 - 반드시 준수]
${dateList.length > 0 ? `**날짜 범위가 감지되었습니다. 다음 ${dateList.length}개의 날짜를 각각 별도의 항목으로 출력해야 합니다:**
${dateList.map((d, i) => `${i + 1}. ${d}`).join("\n")}

**각 날짜마다 동일한 활동 내용을 반복하여 출력하되, 날짜만 변경하여 출력하세요.**
예: "1월부터 지금까지 매주 토요일 1시간 걸었다"가 입력되었고 위 날짜 리스트가 있다면:
- ${dateList[0]} 걷기 1시간
- ${dateList[1] || dateList[0]} 걷기 1시간
- ${dateList[2] || dateList[0]} 걷기 1시간
... (모든 날짜에 대해 각각 출력)

` : `- "1월부터 지금까지", "1월부터 2월까지", "매주 토요일", "매주 일요일" 같은 날짜 범위 표현이 있으면:
  * 시작 날짜와 종료 날짜(또는 오늘 날짜) 사이의 모든 해당 요일을 **정확히 계산**하여 각각 별도의 항목으로 출력한다.
  * 예: "1월부터 지금까지 매주 토요일 1시간 걸었다" → 1월 첫 토요일부터 오늘(${todayStr})까지의 **모든 토요일 날짜를 각각 계산**하여 각각 별도의 항목으로 출력한다.
  * 예: "1월부터 2월까지 매주 일요일 독서" → 1월 첫 일요일부터 2월 마지막 일요일까지의 **모든 일요일 날짜를 각각 계산**하여 각각 별도의 항목으로 출력한다.
- 날짜 범위 계산 시 연도는 현재 연도(${currentYear})를 기준으로 한다.
- **절대 금지**: 날짜 범위가 있는데 하나의 날짜만 출력하거나, 오늘 날짜만 출력하는 것은 금지. 반드시 모든 해당 날짜를 각각 출력해야 함.`}

[단위 규칙 - 사용자 입력 그대로 유지 (절대 변환 금지)]
${unitInfo ? `**각 카테고리의 단위 설정 (참고용일 뿐, 변환하지 않음):**
${customCategories?.map(c => `- ${c.key}: ${c.label} (관리자 설정 단위: ${c.unit || "미설정"})`).join("\n") || ""}

**절대 규칙**: 사용자가 입력한 단위를 그대로 유지해야 합니다. 절대 변환하지 마세요.
- 사용자가 "수영 1시간"이라고 입력했으면 → "수영 1시간"으로 그대로 출력 (절대 "1km"로 변환하지 않음)
- 사용자가 "달리기 5km"라고 입력했으면 → "달리기 5km"로 그대로 출력 (절대 "시간"으로 변환하지 않음)
- 사용자가 "양재천 달리기 0.5km"라고 입력했으면 → "양재천 달리기 0.5km"로 그대로 출력
- 관리자 설정 단위와 다르더라도 사용자 입력을 그대로 유지합니다.
- 단위 변환은 절대 하지 않습니다. 사용자가 입력한 그대로 100% 유지합니다.
` : `- 각 카테고리의 단위에 맞게 수치를 표기한다.
- training: 시간 단위 (예: "2시간", "1.5시간")
- class_open, community, book_edutech: 회 단위 (예: "1회", "2회")
- health: 시간 또는 km 단위 (단위에 맞게 "1시간" 또는 "5km" 등)
- other: 건 단위 (예: "1건", "2건")
- **절대 금지**: 시간 단위인 카테고리에 km를 쓰거나, km 단위인 카테고리에 시간을 쓰지 않는다.`}

[지시]
1. 사용자가 입력한 텍스트에서 **활동 단위**를 구분한다. (여러 문장, 쉼표, "그리고", "어제/오늘" 등으로 나뉜 여러 활동이 있을 수 있음)
2. 날짜 범위 표현("매주", "부터", "까지" 등)이 있으면 각 날짜별로 분리하여 계산한다.
3. 각 활동마다 **한 개의 카테고리**를 골라 위 6개 키 중 하나로 지정한다.
4. 각 활동의 **기록용 문장**을 만든다: "YY.MM.DD(요일) 활동요약" 형식. 연도는 2자리(${String(currentYear).slice(-2)}). 원문에 날짜가 있으면 그날, 날짜 범위면 각 날짜별로, 없으면 오늘 날짜 사용. 요약은 짧고 구체적으로 (장소·시간·내용 포함).
5. 각 카테고리의 단위에 맞게 수치를 정확히 표기한다.

[출력 형식 – JSON만 출력]
\`\`\`json
[
  { "category": "health", "content": "25.01.04(토) 걷기 1시간" },
  { "category": "health", "content": "25.01.11(토) 걷기 1시간" },
  { "category": "health", "content": "25.01.18(토) 걷기 1시간" }
]
\`\`\`
- category는 반드시 training, class_open, community, book_edutech, health, other 중 하나.
- content는 반드시 "YY.MM.DD(요일) " 로 시작하고 이어서 활동 요약 한 문장.
${dateList.length > 0 ? `- **중요**: 위에 제공된 날짜 리스트(${dateList.length}개)를 반드시 모두 사용하여 각 날짜마다 별도의 객체로 출력해야 합니다. 하나라도 빠뜨리면 안 됩니다.` : `- 날짜 범위가 있으면 각 날짜별로 별도의 객체로 추가한다.`}
- 한 건이면 배열에 1개, 여러 건이면 각각 객체로 추가.
- 사용자가 입력한 단위를 그대로 유지하세요. 단위를 변경하거나 변환하지 마세요.

[사용자 입력]
"""
${text}
"""

[출력] JSON 배열만 출력할 것. 날짜 범위가 있으면 각 날짜별로 분리하여 출력한다.`;

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
        let parsed = JSON.parse(raw) as { category: string; content: string }[];
        
        // 날짜 범위가 계산된 경우, AI 응답을 후처리하여 모든 날짜가 포함되도록 보강
        if (dateList.length > 0) {
          // AI가 생성한 항목에서 활동 내용 추출 (날짜 제거)
          let activityText = "";
          let category = "";
          
          if (parsed.length > 0) {
            const firstEntry = parsed[0];
            category = firstEntry.category;
            // 날짜 부분 제거하여 활동 내용만 추출
            activityText = firstEntry.content.replace(/^\d{2}\.\d{2}\.\d{2}\([^)]+\)\s*/, "").trim();
          } else {
            // AI가 아무것도 생성하지 않은 경우, 원문에서 활동 내용 추출
            activityText = text
              .replace(/\d+월\s*부터\s*(지금까지|현재까지|오늘까지|\d+월\s*까지)/g, "")
              .replace(/매주\s*[일월화수목금토]요일/g, "")
              .replace(/매\s*[일월화수목금토]요일/g, "")
              .trim();
            
            // 카테고리는 텍스트 분석으로 추정
            category = "health"; // 기본값
            if (text.includes("연수") || text.includes("수강") || text.includes("연수원")) category = "training";
            else if (text.includes("수업") || text.includes("공개") || text.includes("장학")) category = "class_open";
            else if (text.includes("공동체") || text.includes("동아리") || text.includes("연구회")) category = "community";
            else if (text.includes("독서") || text.includes("책") || text.includes("서적") || text.includes("에듀테크")) category = "book_edutech";
            else if (text.includes("헬스") || text.includes("근력") || text.includes("운동") || text.includes("달리기") || text.includes("등산") || text.includes("수영") || text.includes("체력") || text.includes("러닝") || text.includes("조깅") || text.includes("걷기")) category = "health";
            
            // 활동 내용에서 수치 추출 (예: "1시간", "10km" 등)
            const timeMatch = text.match(/(\d+(?:\.\d+)?)\s*시간/);
            const kmMatch = text.match(/(\d+(?:\.\d+)?)\s*km/i);
            if (timeMatch && !activityText.includes("시간")) {
              activityText = `${activityText} ${timeMatch[0]}`.trim();
            } else if (kmMatch && !activityText.includes("km")) {
              activityText = `${activityText} ${kmMatch[0]}`.trim();
            } else if (!timeMatch && !kmMatch) {
              // 수치가 없으면 기본값 추가 (단위는 나중에 수정됨)
              const numMatch = text.match(/(\d+)/);
              if (numMatch) {
                activityText = `${activityText} ${numMatch[1]}`.trim();
              }
            }
          }
          
          // 각 날짜에 대해 항목 생성 (날짜 리스트를 우선 사용)
          const expandedEntries: { category: string; content: string }[] = dateList.map((dateStr) => ({
            category,
            content: `${dateStr} ${activityText}`.trim(),
          }));
          
          // AI가 생성한 항목의 날짜 추출
          const existingDates = new Set(parsed.map(e => {
            const dateMatch = e.content.match(/^(\d{2}\.\d{2}\.\d{2}\([^)]+\))/);
            return dateMatch ? dateMatch[1] : null;
          }).filter(Boolean));
          
          // 날짜 리스트에서 AI가 생성하지 않은 날짜만 추가
          const finalEntries = expandedEntries.filter(e => {
            const dateMatch = e.content.match(/^(\d{2}\.\d{2}\.\d{2}\([^)]+\))/);
            return dateMatch && !existingDates.has(dateMatch[1]);
          });
          
          // 날짜 리스트를 우선 사용 (AI 응답보다 우선)
          parsed = [...finalEntries, ...parsed];
        }
        
        // 단위 변환은 하지 않음 - 사용자가 입력한 그대로 유지
        // 단위가 맞지 않으면 경고 아이콘만 표시하고 계산에서 제외됨
        
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
