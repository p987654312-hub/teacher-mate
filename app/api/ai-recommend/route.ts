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
    const { type, weakDomains, strongDomains, weakItems } = body;

    // 입력 검증
    if (!type || (type !== "goal" && type !== "effect" && type !== "analysis" && type !== "analysis_post" && type !== "mentor" && type !== "result_report" && type !== "plan_outline" && type !== "plan_fill_rows")) {
      return NextResponse.json(
        { error: "올바른 type을 제공해주세요. 'goal', 'effect', 'analysis', 'analysis_post', 'mentor', 'result_report', 'plan_outline', 'plan_fill_rows' 중 하나여야 합니다." },
        { status: 400 }
      );
    }

    const strongList = Array.isArray(strongDomains) ? strongDomains : [];
    const weakDomainsArray = Array.isArray(weakDomains) ? weakDomains : [];
    const weakDomainsText = weakDomainsArray.length > 0 ? weakDomainsArray.join(", ") : "";
    const strongDomainsText = strongList.length > 0 ? strongList.join(", ") : "";
    const weakItemsList = Array.isArray(weakItems) ? weakItems : [];

    // analysis/effect가 아닌 경우(goal) weakDomains 필수
    if (type === "goal" && weakDomainsArray.length === 0) {
      return NextResponse.json(
        { error: "약점 영역 데이터(weakDomains)를 제공해주세요." },
        { status: 400 }
      );
    }

    // 프롬프트 구성 (1인칭 시점, 교사 본인의 자기성찰·다짐)
    let prompt = "";

    if (type === "analysis") {
      const domainScores = (body as any)?.domainScores || "";
      const totalScore = (body as any)?.totalScore || 0;
      
      prompt = `[역할] 너는 교원 역량 개발을 지원하는 전문 컨설턴트이다. 진단 결과를 객관적·외부자 시각으로 분석하여 해당 교사에게 피드백을 제공하는 역할을 한다.

[시점·어조] 반드시 제3자·컨설턴트 시각을 유지할 것. "이 교사님은", "분석 결과", "~으로 보입니다", "권장드립니다", "다음과 같이 정리할 수 있습니다" 등 전문적이고 객관적인 컨설팅 어조로 작성할 것.

[절대 금지] "저는", "나의", "제가" 같은 1인칭 자기성찰 어조는 사용하지 말 것. 인사말 없이 분석 내용부터 시작할 것.

[내용] 아래 전체 진단 결과를 바탕으로, 6개 영역 전반에 대한 종합 분석을 3문단으로 작성해 줘.
- 1문단: 강점 영역(${strongDomainsText || "없음"})에 대한 객관적 평가와, 이를 수업·학급 운영에 어떻게 활용할 수 있을지에 대한 컨설턴트 관점의 제안
- 2문단: 약점 영역(${weakDomainsText || "없음"})에 대한 분석(부족한 점, 원인 가능성)과 보완이 필요한 이유를 외부 시각으로 서술
- 3문단: 역량 개발을 위한 구체적 제안(연수, 동료장학, 학습공동체, 수업 성찰 일지, 독서 등)을 컨설턴트가 권하는 형태로 정리

전체 영역 점수: ${domainScores || "제공되지 않음"}
총점: ${totalScore}점

각 문단은 명확한 주제를 다루되, 전문 컨설턴트가 결과를 해석하고 제안하는 톤으로 서술할 것.`;
    } else if (type === "analysis_post") {
      const pre = (body as any)?.preScores || {};
      const post = (body as any)?.postScores || {};
      const preTotal = Number((body as any)?.preTotal) || 0;
      const postTotal = Number((body as any)?.postTotal) || 0;
      const DEFAULT_DOMAIN_LABELS: Record<string, string> = {
        domain1: "수업 설계·운영", domain2: "학생 이해·생활지도", domain3: "평가·피드백",
        domain4: "학급경영·안전", domain5: "전문성 개발·성찰", domain6: "소통·협력 및 포용적 교육",
      };
      const domainLabels: Record<string, string> =
        typeof (body as any)?.domainLabels === "object" && (body as any).domainLabels !== null
          ? { ...DEFAULT_DOMAIN_LABELS, ...(body as any).domainLabels }
          : DEFAULT_DOMAIN_LABELS;
      const preText = Object.keys(domainLabels).map((k) => `${domainLabels[k]}: ${Number(pre[k]) ?? 0}점`).join(", ");
      const postText = Object.keys(domainLabels).map((k) => `${domainLabels[k]}: ${Number(post[k]) ?? 0}점`).join(", ");
      prompt = `[역할] 너는 교원 역량 개발을 지원하는 전문 컨설턴트이다.

[지시] 사전 검사 결과와 사후 검사 결과를 비교 분석하여, **향상된 내용 위주로** 기술하도록 한다.

[시점·어조] 제3자·컨설턴트 시각으로 "이 교사님은", "분석 결과", "~으로 보입니다" 등 객관적 어조를 사용할 것. 인사말 없이 분석 내용부터 시작할 것.

[내용] 아래 사전·사후 진단 결과를 비교하여, 2~3문단으로 작성해 줘.
- 향상된 영역과 점수 변화를 구체적으로 언급하고, 그 의미를 컨설턴트 관점으로 해석할 것.
- 유지되거나 소폭 변화한 영역도 필요 시 간단히 언급할 수 있으나, **향상된 내용을 위주로** 서술할 것.
- 마지막에는 사후 진단을 바탕으로 한 다음 단계 제안을 한 문단 이내로 정리할 것.

[사전 진단 결과]
${preText}
총점: ${preTotal}점

[사후 진단 결과]
${postText}
총점: ${postTotal}점`;
    } else if (type === "result_report") {
      const planSummary = String((body as any)?.planSummary ?? "").trim();
      const mileageText = String((body as any)?.mileageText ?? "").trim();
      prompt = `[역할] 너는 교원 역량 개발 결과를 정리하는 전문가이다.

[지시] 아래 '계획서(설정 목표)'와 '마일리지 실천 기록'을 분석하여, **목표별로** 한 줄 제목을 "[항목명] 목표 : [목표 수치] 이상 ( N% 완료)" 형식으로 쓰고, 다음 줄부터 해당 목표와 연결된 실천 내용을 개조식(불릿)으로 나열한다. 인사말·서두 없이 바로 아래 형식대로만 출력할 것.

[달성률 표기 – "미달" 등 다른 용어 사용 금지]
- **정량적 목표**(예: N회, N시간, N km): 목표 수치를 적고 "이상"을 붙인 뒤, **달성률**을 계산하여 "( N% 완료)"로만 표기한다. 달성률 = (실천 기록의 합계 또는 횟수 / 목표 수치) × 100. 100을 초과하면 100%로 표기. 예: 목표 80시간, 실천 36시간 → "연수 목표 : 80 시간 이상 ( 45% 완료)".
- **정성적 목표**: 실천 기록이 **1건 이상** 있으면 "( 100% 완료)", **한 건도 없으면** "( 0% 완료)".
- 실천 기록이 **한 건도 없으면** 해당 목표는 "( 0% 완료)"이고, 아래에 "(해당 실천 기록 없음)"만 불릿으로 표기.

[출력 형식]
목표 : [항목명] : [목표 수치] 이상 ( [달성률]% 완료)
  - [마일리지에서 해당하는 실천 1]
  - [마일리지에서 해당하는 실천 2]
  - ... (항목이 많으면 생략 가능)

- 계획서에 목표가 여러 개 있으면, 위 형식으로 **목표마다 한 블록씩** 반복하여 작성할 것.
- 각 "  - " 항목은 마일리지 실천 기록에 실제로 있는 활동만 사용할 것.
- 날짜 표기: 연도는 2자리만 사용 (예: 2025.06.03 → 25.06.03, 2024 → 24).
- "미달", "달성" 등 "( N% 완료)"가 아닌 표현은 사용하지 말 것. 반드시 "( N% 완료)" 형식만 사용.

[계획서(설정 목표 및 내용)]
${planSummary || "(없음)"}

[마일리지 실천 기록]
${mileageText || "(없음)"}

[출력] 위 두 자료를 매칭하여, 목표 수치 대비 실천량으로 **달성률(%)**을 계산하고 "( N% 완료)" 형식으로만 붙여, 불릿 목록 형식으로 작성할 것.`;
    } else if (type === "plan_outline") {
      const planSummary = String((body as any)?.planSummary ?? "").trim();
      const mileageText = String((body as any)?.mileageText ?? "").trim();
      prompt = `[역할] 너는 교원 역량 개발 계획을 정리하는 전문가이다.

[지시] 아래 '연간 계획서 목표 및 내용'과 (제공된 경우) '마일리지 실천 기록'을 바탕으로, **연간 계획한 목표와 달성 정도**를 **구체적인 개조식**으로 정리한다.

[형식]
- 반드시 **개조식**으로 작성할 것. 한 문장은 짧고 구체적으로.
- 예시: "학부모 공개수업 학기별 1회, 연 2회 실시.", "직무연수 30시간 이수 완료.", "전문 서적 2권 읽고 수업에 적용."
- **100문장 이내**로, 간단한 문장만 나열할 것. 서두나 결말 문단 없이 개조식 문장만 출력.

[연간 계획서 목표 및 내용]
${planSummary || "(없음)"}

[마일리지 실천 기록] (있으면 달성 정도 반영)
${mileageText || "(없음)"}

[출력] 위 내용을 참고하여 개조식 짧은 문장들만 나열할 것. 100문장 이내.`;
    } else if (type === "goal") {
      prompt = `[역할] 너는 AI나 컨설턴트가 아니라, 역량 진단 결과를 바탕으로 이번 학기 목표를 직접 세우고 있는 '교사 본인'이다.

[시점·어조] 반드시 1인칭 시점("저는", "나의")을 사용하고, 학교나 교육청에 제출하는 공식 계획서처럼 전문적이고 의지적인 어조("~하고자 합니다", "~할 계획입니다", "~노력하겠습니다")로 작성할 것.

[절대 금지] "이 교사님의~", "추천합니다", "다음과 같습니다", "결과를 분석해보면" 같은 제3자 화법이나 AI 비서 도입부는 사용하지 말 것. 인사말 없이 바로 본인의 다짐과 목표부터 시작할 것.

[내용] 아래 진단 결과를 바탕으로, 자기역량 개발 목표를 1~2문단으로 작성해 줘.
- 강점(상위 역량): ${strongDomainsText || "(제공되지 않음)"} → 이 강점을 수업에 어떻게 적극 활용할 것인지, 스스로의 다짐으로 서술.
- 약점(하위 역량): ${weakDomainsText} → 이 영역을 구체적으로 어떤 노력(연수, 동료장학, 학습공동체 참여, 수업 성찰 일지 등)으로 보완할 것인지, 굳은 다짐처럼 자연스럽게 녹여낼 것.`;
    } else if (type === "effect") {
      const developmentGoal = (body as any)?.development_goal ?? "";
      const trainingPlans = (body as any)?.training_plans ?? [];
      const educationPlans = (body as any)?.education_plans ?? [];
      const bookPlans = (body as any)?.book_plans ?? [];
      const expenseRequests = (body as any)?.expense_requests ?? [];

      const hasGoal = typeof developmentGoal === "string" && developmentGoal.trim().length >= 20;
      const hasTraining = Array.isArray(trainingPlans) && trainingPlans.some((r: any) => r?.name?.trim?.());
      const hasEducation = Array.isArray(educationPlans) && educationPlans.some((r: any) => r?.area?.trim?.());
      const hasBook = Array.isArray(bookPlans) && bookPlans.some((r: any) => r?.title?.trim?.());
      const hasExpense = Array.isArray(expenseRequests) && expenseRequests.some((r: any) => r?.activity?.trim?.());
      const planSufficient = hasGoal && (hasTraining || hasEducation || hasBook || hasExpense);

      if (!planSufficient) {
        return NextResponse.json({
          recommendation: "수행 계획이 충분하지 않아, 기대효과를 작성하기 어렵습니다. 수행 계획을 충분히 입력해 주세요.",
        });
      }

      const formatList = (arr: any[], lineFn: (r: any) => string) =>
        Array.isArray(arr) ? arr.filter((r) => lineFn(r).trim()).map(lineFn).join("\n") : "";
      const planText = [
        "[자기역량 개발목표]",
        developmentGoal.trim() || "(없음)",
        "[연수(직무, 자율) 계획]",
        formatList(trainingPlans, (r) => `- ${r?.name ?? ""} (${r?.period ?? ""}, ${r?.duration ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[건강/체력 향상 계획]",
        formatList(educationPlans, (r) => `- ${r?.area ?? ""} (${r?.period ?? ""}, ${r?.duration ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[전문 서적 / 에듀테크 등 구입 활용 계획]",
        formatList(bookPlans, (r) => `- ${r?.title ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""})`.trim()) || "(없음)",
        "[수업 공개 계획]",
        formatList(expenseRequests, (r) => `- ${r?.activity ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
      ].join("\n");

      prompt = `[역할] 너는 AI가 아니라, 앞서 세운 자기역량 개발 계획을 실행한 뒤의 '나의 모습'을 그리는 교사 본인이다.

[시점·어조] 반드시 1인칭 시점("저는", "나의")을 사용하고, 공식 계획서의 '기대 효과' 문단처럼 전문적이고 진지한 어조로 작성할 것.

[서술 시제] 기대 효과는 아직 달성 전이므로 **반드시 미래형**으로 서술할 것. 예: "~할 수 있을 것이다", "~하게 될 것이다", "~하겠다", "~될 것으로 기대한다", "~할 계획이다". **과거형**(~했다, ~되었다, ~했다고 생각한다)은 사용하지 말 것.

[절대 금지] "이 교사님의~", "기대됩니다", "다음과 같은 효과가 있을 것입니다" 같은 제3자·AI 화법은 사용하지 말 것. 인사말 없이 바로 본인의 성장될 모습을 서술할 것.

[참고 자료]
- 진단 상 약점 영역(보완 대상): ${weakDomainsText || "없음"}
- 진단 상 강점 영역: ${strongDomainsText || "없음"}

아래는 해당 교사가 직접 입력한 자기역량 개발계획서 내용이다. 이 수행 계획을 반드시 참고할 것.
---
${planText}
---

[내용] 위 계획서에 기재된 수행 계획과 기존 부족했던 점(약점 영역)을 잘 엮어서, 계획 실행 후의 기대 효과를 **성장 가능성** 위주로 두 문단 정도 작성해 줘. 구체적인 연수·독서·비용 계획이 역량 보완과 어떻게 연결되는지, 교사로서 어떤 성장이 기대되는지 1인칭 미래형(~할 것이다, ~되겠다 등)으로 긍정적이고 구체적으로 서술할 것.`;
    } else if (type === "mentor") {
      const developmentGoal = (body as any)?.development_goal ?? "";
      const trainingPlans = (body as any)?.training_plans ?? [];
      const educationPlans = (body as any)?.education_plans ?? [];
      const bookPlans = (body as any)?.book_plans ?? [];
      const expenseRequests = (body as any)?.expense_requests ?? [];
      const communityPlans = (body as any)?.community_plans ?? [];
      const otherPlans = (body as any)?.other_plans ?? [];

      const formatList = (arr: any[], lineFn: (r: any) => string) =>
        Array.isArray(arr) ? arr.filter((r) => lineFn(r).trim()).map(lineFn).join("\n") : "";
      const planText = [
        "[자기역량 개발목표]",
        (developmentGoal as string).trim() || "(없음)",
        "[연수(직무, 자율) 계획]",
        formatList(trainingPlans, (r: any) => `- ${r?.name ?? ""} (${r?.period ?? ""}, ${r?.duration ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[수업 공개 계획]",
        formatList(expenseRequests, (r: any) => `- ${r?.activity ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[교원학습 공동체 활동 계획]",
        formatList(communityPlans, (r: any) => `- ${r?.activity ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[전문 서적 / 에듀테크 등 구입 활용 계획]",
        formatList(bookPlans, (r: any) => `- ${r?.title ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""})`.trim()) || "(없음)",
        "[건강/체력 향상 계획]",
        formatList(educationPlans, (r: any) => `- ${r?.area ?? ""} (${r?.period ?? ""}, ${r?.duration ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[기타 계획]",
        formatList(otherPlans, (r: any) => `- ${(r as any)?.text ?? ""}`.trim()) || "(없음)",
      ].join("\n");

      prompt = `[역할] 너는 교원 역량 개발을 지원하는 AI 멘토이다. 교사의 '교원역량사전진단' 결과와 '자기역량 개발계획서' 작성 내용을 비교하여, **솔직하고 정확한** 피드백을 준다.

[제약] 반드시 **5문장을 넘지 않도록** 작성할 것. 인사말 없이 코멘트 내용만 출력.

[피드백 원칙 – 반드시 준수]
0. **'자기역량 개발목표' 카드의 내용은 언급하거나 평가하지 말 것.** 멘토링 코멘트에서 해당 문단을 인용하거나 "목표가 ~하다" 등으로 말하지 말고, 연수·수업 공개·교원학습 공동체·전문 서적·건강/체력·기타 계획만 진단 결과와 비교하여 피드백할 것.
1. **못한 것은 못했다고 명확히 말할 것.** 계획이 비어 있거나, 진단의 약점 영역을 전혀 보완하지 못했으면 "해당 영역에 대한 계획이 부족합니다", "약점 영역(○○)을 다루는 연수·활동이 없습니다" 등으로 구체적으로 지적할 것.
2. **전혀 엉뚱한 내용이면 직관적으로 질책할 것.** 역량 개발과 무관한 내용, 말도 안 되는 입력, 뚜렷한 성의 없음이 보이면 "이 내용은 역량 개발 계획서로 적절하지 않습니다", "진단 결과와 연계된 구체적 계획이 필요합니다" 등 직설적으로 꼬집을 것. 잘못을 덮어주지 말 것.
3. **잘 썼을 때만 칭찬할 것.** 진단의 약점·강점과 계획이 실제로 잘 연결되어 있고, 구체적인 연수·활동·독서 등이 들어 있을 때만 "목표와 계획이 잘 이루어졌습니다" 등으로 격려할 것. 애매하거나 부실하면 격려로 마무리하지 말 것.
4. **조언은 데이터에 기반할 것.** 예: "수업 설계·운영 역량을 보완하기 위해 ○○ 연수 참가를 권합니다." 진단의 약점 영역(하위 3)을 반드시 언급하며, 계획서에 그에 맞는 내용이 있는지 판단할 것.

[진단 결과]
- 강점 영역(상위 3): ${strongDomainsText || "없음"}
- 약점 영역(하위 3): ${weakDomainsText || "없음"}

[계획서 요약]
---
${planText}
---

[출력] 위 진단과 계획서를 비교한 뒤, 5문장 이내로 **솔직한** 멘토링 코멘트를 작성할 것. 부족하면 부족하다고, 엉망이면 질책하고, 정말 잘 썼을 때만 칭찬할 것.`;
    } else if (type === "plan_fill_rows") {
      const cardType = String((body as any)?.cardType ?? "").trim();
      const count = Math.min(Math.max(1, Number((body as any)?.count) || 1), 20);
      const developmentGoal = String((body as any)?.developmentGoal ?? "").trim();
      const cardTypes: Record<string, { keys: string[]; desc: string }> = {
        training: { keys: ["name", "period", "duration", "remarks"], desc: "직무/자율 연수: name(연수명), period(시기 예: 4월), duration(시간 수), remarks(비고)" },
        expense: { keys: ["activity", "period", "method", "remarks"], desc: "수업 공개: activity(내용 예: 학부모 공개수업), period(시기), method(방법), remarks(비고)" },
        community: { keys: ["activity", "period", "method", "remarks"], desc: "교원학습 공동체: activity(활동 내용), period(시기), method(방법), remarks(비고)" },
        book: { keys: ["title", "period", "method"], desc: "전문 서적/에듀테크: title(서적 또는 도구명), period(시기), method(활용방법)" },
        education: { keys: ["area", "period", "duration", "remarks"], desc: "건강/체력: area(내용 예: 조깅), period(시기), duration(기간), remarks(비고)" },
        other: { keys: ["text"], desc: "기타: text(계획 내용 한 줄)" },
      };
      const spec = cardTypes[cardType];
      if (!spec) {
        return NextResponse.json(
          { error: "cardType은 training, expense, community, book, education, other 중 하나여야 합니다." },
          { status: 400 }
        );
      }
      prompt = `[역할] 너는 교원 자기역량 개발 계획서 작성을 돕는 전문가이다.

[지시] 아래 '자기역량 개발목표'를 참고하여, **${spec.desc}** 형식의 계획 행을 **정확히 ${count}개** 생성한다.

[자기역량 개발목표]
${developmentGoal || "(없음 - 일반적인 교원 역량 개발에 맞는 합리적인 예시로 생성)"}

[출력 형식 – 반드시 준수]
- **반드시 유효한 JSON 배열만** 출력할 것. 다른 설명·마크다운 없이 JSON만.
- 배열 길이: 정확히 ${count}개.
- 각 요소는 다음 키만 가진 객체: ${JSON.stringify(spec.keys)}
- 값은 모두 문자열(string). 숫자도 duration 등은 "8"처럼 문자열로.
- 한국어로, 교원이 실제로 계획서에 쓸 수 있는 구체적인 내용으로 작성할 것.

예시(카드별 형식만 참고, 실제로는 요청한 개수만큼 생성):
${cardType === "training" ? '[{"name":"AI 활용 수업 연수","period":"4월","duration":"8","remarks":"직무연수"}]' : ""}
${cardType === "expense" ? '[{"activity":"학부모 공개수업","period":"3월","method":"학부모 참관","remarks":""}]' : ""}
${cardType === "other" ? '[{"text":"교육과정 워크숍 참가"}]' : ""}

[출력] JSON 배열만 출력할 것.`;
    }

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
        const recommendation = response.text().trim();

        if (!recommendation || recommendation === "") {
          return NextResponse.json(
            { error: "AI 추천 결과가 비어있습니다." },
            { status: 500 }
          );
        }
        if (type === "plan_fill_rows") {
          let raw = recommendation.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          try {
            const rows = JSON.parse(raw) as unknown[];
            if (!Array.isArray(rows)) throw new Error("배열이 아님");
            return NextResponse.json({ rows });
          } catch (parseErr) {
            console.error("plan_fill_rows parse error:", parseErr);
            return NextResponse.json(
              { error: "AI가 반환한 형식을 파싱할 수 없습니다." },
              { status: 500 }
            );
          }
        }
        return NextResponse.json({ recommendation });
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
    console.error("Error in /api/ai-recommend:", error);
    const errorMessage = error?.message || "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json(
      { error: `Gemini API 호출 실패: ${errorMessage}` },
      { status: 500 }
    );
  }
}
