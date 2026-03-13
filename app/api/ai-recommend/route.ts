import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

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
    if (!type || (type !== "goal" && type !== "effect" && type !== "analysis" && type !== "analysis_post" && type !== "mentor" && type !== "result_report" && type !== "plan_outline" && type !== "plan_fill_rows" && type !== "self_eval_sections")) {
      return NextResponse.json(
        { error: "올바른 type을 제공해주세요. 'goal', 'effect', 'analysis', 'analysis_post', 'mentor', 'result_report', 'plan_outline', 'plan_fill_rows', 'self_eval_sections' 중 하나여야 합니다." },
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
      const totalScore = (body as any)?.totalScore ?? 0;
      const domainCount = Math.min(6, Math.max(2, Number((body as any)?.domainCount) || 6));

      prompt = `[역할] 너는 교원 역량 개발을 지원하는 전문 컨설턴트이다. 진단 결과를 객관적·외부자 시각으로 분석하여 해당 교사에게 피드백을 제공하는 역할을 한다.

[시점·어조] 반드시 제3자·컨설턴트 시각을 유지할 것. "선생님께서는", "분석 결과", "~으로 보입니다", "권장드립니다", "다음과 같이 정리할 수 있습니다" 등 전문적이고 객관적인 컨설팅 어조로 작성할 것.

[절대 금지] "저는", "나의", "제가" 같은 1인칭 자기성찰 어조는 사용하지 말 것. 인사말 없이 분석 내용부터 시작할 것.

[점수 해석] 역량별 점수는 1~5점 척도 평균이며, 총점은 100점 만점 환산 점수이다. 반드시 아래 제공된 강점·약점 영역과 점수만을 근거로 분석할 것.

[내용] 아래 전체 진단 결과를 바탕으로, 전체 역량 영역(${domainCount}개)에 대한 종합 분석을 3문단으로 작성해 줘.
- 1문단: 강점 영역(${strongDomainsText || "없음"})에 대한 객관적 평가와, 이를 수업·학급 운영에 어떻게 활용할 수 있을지에 대한 컨설턴트 관점의 제안
- 2문단: 약점 영역(${weakDomainsText || "없음"})에 대한 분석(부족한 점, 원인 가능성)과 보완이 필요한 이유를 외부 시각으로 서술
- 3문단: 역량 개발을 위한 구체적 제안(연수, 동료장학, 학습공동체, 수업 성찰 일지, 독서 등)을 컨설턴트가 권하는 형태로 정리

역량별 점수(1~5점 척도 평균): ${domainScores || "제공되지 않음"}
총점(100점 만점 환산): ${totalScore}점

각 문단은 명확한 주제를 다루되, 전문 컨설턴트가 결과를 해석하고 제안하는 톤으로 서술할 것.`;
    } else if (type === "analysis_post") {
      const pre = (body as any)?.preScores || {};
      const post = (body as any)?.postScores || {};
      const preTotal = Number((body as any)?.preTotal) ?? 0;
      const postTotal = Number((body as any)?.postTotal) ?? 0;
      const FALLBACK_DOMAIN_LABELS: Record<string, string> = {
        domain1: "영역1", domain2: "영역2", domain3: "영역3",
        domain4: "영역4", domain5: "영역5", domain6: "영역6",
      };
      const domainLabels: Record<string, string> =
        typeof (body as any)?.domainLabels === "object" && (body as any).domainLabels !== null
          ? { ...FALLBACK_DOMAIN_LABELS, ...(body as any).domainLabels }
          : FALLBACK_DOMAIN_LABELS;
      const domainKeysList: string[] = Array.isArray((body as any)?.domainKeys) && (body as any).domainKeys.length > 0
        ? (body as any).domainKeys
        : Object.keys(domainLabels);
      const preText = domainKeysList.map((k) => `${domainLabels[k] ?? k}: ${Number(pre[k]) ?? 0}점`).join(", ");
      const postText = domainKeysList.map((k) => `${domainLabels[k] ?? k}: ${Number(post[k]) ?? 0}점`).join(", ");
      prompt = `[역할] 너는 교원 역량 개발을 지원하는 전문 컨설턴트이다. 사전검사와 사후 검사를 비교하여 분석해줄거야, 만약 사전검사 결과를 모른다면 방사형그래프를 해석해보거나 비교표를 참고해줘.

[지시] 사전 검사 결과와 사후 검사 결과를 **비교**하여, "무엇이 얼마나 좋아졌는지"와 "어디가 아직 덜 오른 것인지"를 중심으로 분석·제언한다.

[점수 해석] 역량별 점수는 1~5점 척도 평균이며, 총점은 100점 만점 환산 점수이다. 반드시 제공된 수치만을 근거로 분석할 것.

[시점·어조] 제3자·컨설턴트 시각으로 "선생님께서는", "분석 결과", "~으로 보입니다" 등 객관적 어조를 사용할 것. 인사말 없이 분석 내용부터 시작할 것.

[내용] 사전·사후 진단 결과를 비교하여, **3문단 내외**로 작성해 줘.
- 1문단: "분석 결과"로 시작하고, 전체 총점 변화(전·후)를 한 번 짚고, 가장 많이 **향상된 영역 1~2개**를 구체적인 점수 차이와 함께 설명한다. (예: "특히 △△ 영역은 2.8점에서 3.7점으로 0.9점 향상되었습니다.")
- 2문단: **향상이 상대적으로 적거나 거의 없는 영역 1~2개**를 골라, 왜 그럴 가능성이 있는지(실제 수업·업무 맥락을 가정하여) 분석하고, 해당 영역을 보완하기 위한 현실적인 전략(연수, 수업 나눔, 학습공동체, 성찰 일지 등)을 제안한다.
- 3문단: 앞으로 꾸준히 "잘 유지해야 할 강점"과 "아직 보완이 필요한 약점"을 한 번씩 정리하고, 사전·사후 변화 흐름을 이어 가기 위한 간단한 실천 방향을 제시한다.

[사전 진단 결과] (역량별 1~5점 평균)
${preText}
총점(100점 만점 환산): ${preTotal}점

[사후 진단 결과] (역량별 1~5점 평균)
${postText}
총점(100점 만점 환산): ${postTotal}점`;
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
    } else if (type === "self_eval_sections") {
      const planSummary = String((body as any)?.planSummary ?? "").trim();
      const mileageText = String((body as any)?.mileageText ?? "").trim();
      const ctx = (body as any)?.context ?? {};
      const contextText = [
        `소속: ${ctx.affiliation ?? ""}, 직위: ${ctx.position ?? ""}, 성명: ${ctx.evaluatorName ?? ""}`,
        `담당 학년·학급: ${ctx.gradeClass ?? ""}, 담당 과목: ${ctx.subject ?? ""}, 담임 여부: ${ctx.isHomeroom ?? ""}, 담당 업무: ${ctx.assignedDuties ?? ""}, 보직교사 여부: ${ctx.isPositionTeacher ?? ""}`,
        `주당 수업시간: ${ctx.hoursPerWeek ?? ""}, 연간 수업공개 실적: ${ctx.openClassResult ?? ""}, 연간 학생 상담 실적: ${ctx.studentCounselResult ?? ""}, 연간 학부모 상담 실적: ${ctx.parentCounselResult ?? ""}, 그 밖의 실적: ${ctx.otherResult ?? ""}`,
      ].join("\n");
      prompt = `[역할] 너는 초등학교 교사 자기실적평가서 작성을 돕는 전문가이다.

[지시] 아래 [참고 자료]를 반드시 활용하여, **가. 학습지도, 나. 생활지도, 다. 전문성계발, 라. 담당 업무** 네 영역에 대해, 각 영역별로 **추진 목표**와 **추진 실적**을 작성한다.
- **목표와 실적은 서로 연계**되게 쓸 것. (목표에서 세운 내용에 대해 실적에서 구체적 수행 결과가 이어지도록)
- **초등학교 실정**에 맞는 구체적인 표현을 사용할 것.
- **칸당 200자 내외**로 작성할 것.

[문체·어미 – 필수]
- **개조식**으로만 작성할 것. 설명식 문단·서술형 금지. 한 줄 한 줄 짧은 조항 형태로 나열.
- 문장 끝은 **~임**, **~함**으로 마무리할 것. (예: ~실시함, ~지원함, ~적용함, ~조성함)
- **목표** 진술 시에는 **성장 지원**, **교수법 적용**, **조성함**, **강화함**, **제공함** 등 간단명료한 어미만 사용할 것.
- **실적**도 개조식으로, ~함/~임 어미로 구체적 수행 내용을 나열할 것.

[참고 자료]
- 계획서/목표 요약:
${planSummary || "(없음)"}

- 마일리지/실천 기록:
${mileageText || "(없음)"}

- 평가자 기초 자료:
${contextText || "(없음)"}

[담당 업무 작성 가이드 – 반드시 반영]
- 초등학교 일반적인 교육활동 업무분장(예: 교육기획부, 생활인성부, 과학정보부, 문화예술부, 방과후·돌봄, 체육교육부, 안전교육부, 행정·업무지원 등)을 기본 틀로 이해하고, 평가자의 실제 담당 업무(위 참고 자료의 "담당 업무")와 연결해서 작성할 것.
- "담당 업무" 영역(dutyGoal, dutyResult)은 위 업무분장 틀과 평가자의 실제 역할(예: 생활인성부, 과학정보부, 방과후학교 담당, 안전·보건, 예산·구매, 시설관리 등)이 드러나도록, 구체적인 학교 업무(계획 수립, 회의 운영, 문서 작성, 행사 운영, 학부모·학생 안내, 안전점검, 예산 집행 등)를 포함해서 써 줄 것.
- 단순히 "학교 업무를 성실히 수행함"과 같은 포괄적 표현만 쓰지 말고, 업무분장표에 나올 법한 실제 활동 중심으로 개조식으로 작성할 것.

[출력 형식] 반드시 아래 JSON만 출력할 것. 다른 설명이나 마크다운 없이 JSON만. 각 값은 개조식 문장들(줄바꿈 가능)이며 200자 내외.
{
  "learningGoal": "가. 학습지도 추진 목표 (개조식, ~지원/~적용/~조성함 등, 200자 내외)",
  "learningResult": "가. 학습지도 추진 실적 (개조식, ~함/~임, 200자 내외)",
  "lifeGoal": "나. 생활지도 추진 목표 (개조식, 간단명료 어미, 200자 내외)",
  "lifeResult": "나. 생활지도 추진 실적 (개조식, ~함/~임, 200자 내외)",
  "professionalGoal": "다. 전문성계발 추진 목표 (개조식, 간단명료 어미, 200자 내외)",
  "professionalResult": "다. 전문성계발 추진 실적 (개조식, ~함/~임, 200자 내외)",
  "dutyGoal": "라. 담당 업무 추진 목표 (개조식, 간단명료 어미, 200자 내외)",
  "dutyResult": "라. 담당 업무 추진 실적 (개조식, ~함/~임, 200자 내외)"
}`;
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

[문장 끝맺음]
- 마지막 문장을 포함해 "다짐합니다"라는 표현은 절대 쓰지 말 것.
- 대신 "노력할 것입니다.", "실천할 것입니다.", "꾸준히 개선해 나갈 것입니다.", "성실히 이행하겠습니다."처럼 자연스러운 종결 표현을 사용할 것.

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
      const categoryKey = String((body as any)?.categoryKey ?? "").trim();
      const categoryLabel = String((body as any)?.categoryLabel ?? "").trim();
      const categoryUnit = String((body as any)?.categoryUnit ?? "").trim();
      const currentYear = new Date().getFullYear();
      const cardTypes: Record<string, { desc: string }> = {
        training: { desc: "직무/자율 연수(내용, 시기 및 방법, 기대효과)" },
        expense: { desc: "수업 공개(내용, 시기 및 방법, 기대효과)" },
        community: { desc: "교원학습 공동체(내용, 시기 및 방법, 기대효과)" },
        book: { desc: "전문 서적/에듀테크(내용, 시기 및 방법, 기대효과)" },
        education: { desc: "건강/체력(내용, 시기 및 방법, 기대효과)" },
        other: { desc: "기타 계획(내용, 시기 및 방법, 기대효과)" },
      };
      const spec = cardTypes[cardType];
      if (!spec) {
        return NextResponse.json(
          { error: "cardType은 training, expense, community, book, education, other 중 하나여야 합니다." },
          { status: 400 }
        );
      }

      const categoryTitle = categoryLabel || categoryKey || "";
      const isHealthCategory = /건강|체력|보건/.test(categoryTitle);
      const categoryContext = categoryTitle
        ? `\n[카테고리(학교 설정) – 반드시 준수]\n- 현재 카테고리명: "${categoryTitle}"\n- 생성하는 내용은 반드시 이 카테고리명(의미)에 맞아야 한다.\n${
            isHealthCategory
              ? '- 이 카테고리는 건강/체력 관련 영역이므로, 연수·대학원·연구회·수업공개 등 다른 전문성 계발 내용은 쓰지 말고 건강/체력 향상 활동에만 집중한다. 예: 걷기, 조깅, 런닝, 근력 운동(헬스), 요가, 필라테스, 수영, 자전거 타기, 하이킹, 스트레칭, 명상·호흡, 수면·식습관 관리 등.\n'
              : '- 이 카테고리는 건강/체력 영역이 아니므로, 조깅·헬스·걷기·스트레칭·수면관리 등 건강/체력 중심 예시는 절대 쓰지 말 것. 특히 "건강", "체력", "운동", "걷기", "조깅", "런닝", "헬스", "요가", "필라테스", "수영", "스트레칭", "수면", "식단", "다이어트" 등의 단어가 한 글자라도 포함되면 안 된다.\n'
          }- 카테고리 단위(있으면 참고): "${categoryUnit || "(없음)"}"\n`
        : "";
      const periodInstruction = `\n[시기 및 방법(periodMethod) 규칙 – 반드시 준수]\n- 연도는 **${currentYear}년**(올해)만 사용할 것. 과거 연도 사용 금지.\n- 시기 표현은 ${currentYear}년 기준 월 또는 학기 단위로, 방법(주기·형태)은 함께 한 줄로 작성할 것.\n  예: "3~7월, 주 2회 30분 조깅", "1학기, 매주 1회 공개수업" 등.\n`;
      const extraEducationInstruction =
        cardType === "education" && isHealthCategory
          ? `\n[건강/체력 카드 추가 규칙 – 반드시 준수]\n- 각 행의 content(내용), periodMethod(시기 및 방법), effect(기대효과) 세 필드를 모두 채울 것.\n- content: 구체적인 건강/체력 활동 내용. 예: "주 3회 30분 조깅", "점심시간 스트레칭 10분" 등.\n- periodMethod: 언제, 얼마나 자주 할지 한 줄로. 예: "3~7월, 주 3회", "1학기, 매일 10분" 등.\n- effect: 기대되는 변화나 효과. 예: "체력 향상 및 스트레스 해소", "허리 통증 예방" 등.\n`
          : "";
      const descPrefix = categoryTitle ? `${categoryTitle}: ` : "";
      prompt = `[역할] 너는 **서울시 초등학교 교사**를 위한 자기역량 개발 계획서 작성을 돕는 전문가이다.
항상 서울시교육청 정책과 최근 교육적 트렌드(학생 참여 중심 수업, AI·에듀테크 활용, 교사의 삶의 질과 웰빙 등)를 자연스럽게 반영한다.

[지시] 아래 '자기역량 개발목표'를 참고하여, **${descPrefix}${spec.desc}**에 해당하는 계획 행을 **정확히 ${count}개** 생성한다.
${periodInstruction}${extraEducationInstruction}
[중요] 학교 설정 카테고리명에 맞지 않는 내용(예: 제목이 전문성 계발인데 체력훈련 내용 등)은 금지.${categoryContext}
[자기역량 개발목표]
${developmentGoal || "(없음 - 일반적인 교원 역량 개발에 맞는 합리적인 예시로 생성)"}

[출력 형식 – 반드시 준수]
- **반드시 유효한 JSON 배열만** 출력할 것. 다른 설명·마크다운 없이 JSON만.
- 배열 길이: 정확히 ${count}개.
- 각 요소는 **반드시** 다음 세 키만 가진 객체여야 한다(다른 키 금지): ["content","periodMethod","effect"]
- 값은 모두 문자열(string).
- content에는 계획의 **내용**, periodMethod에는 **시기와 방법을 함께**, effect에는 **기대효과**를 한 문장 또는 두 문장으로 작성할 것.
- 모든 문장은 초등학교 교사가 실제 계획서에 그대로 옮겨 적을 수 있는 자연스러운 한국어여야 한다.
- 문장 끝 어미는 "~한다", "~을 강화한다", "~을 실천한다"와 같은 **서술형 평서문**으로만 쓸 것. "~합니다", "~해요" 등 존댓말·구어체는 사용하지 말 것.
- periodMethod는 **빠른 시기(예: 3월, 1학기)부터 늦은 시기(예: 2학기, 11월) 순으로 정렬**되도록 작성할 것. 즉, 배열의 앞쪽 요소일수록 달력상 더 이른 시기의 활동이 오게 배치한다.

예시(형식만 참고, 실제로는 요청한 개수만큼 생성):
[{"content":"AI 활용 학생 참여 수업 연수 이수","periodMethod":"${currentYear}년 4월, 온라인 직무연수 15시간 수강","effect":"AI·에듀테크를 활용한 수업 설계 역량을 높이고, 학생 참여율을 향상시킨다."}]

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
            let parsed = JSON.parse(raw) as any;
            // 모델이 { "rows": [...] } 형태로 줄 수도 있으니 보완
            let rows: unknown[] | null = null;
            if (Array.isArray(parsed)) {
              rows = parsed;
            } else if (parsed && Array.isArray(parsed.rows)) {
              rows = parsed.rows;
            } else {
              // 그래도 배열이 아니면, 텍스트에서 대괄호 부분만 추출해서 한 번 더 시도
              const start = raw.indexOf("[");
              const end = raw.lastIndexOf("]");
              if (start !== -1 && end !== -1 && end > start) {
                const slice = raw.slice(start, end + 1);
                const again = JSON.parse(slice);
                if (Array.isArray(again)) {
                  rows = again;
                }
              }
            }
            if (!rows) throw new Error("배열이 아님");

            // 1단계: AI 응답을 공통 포맷(content, periodMethod, effect)으로 정규화
            const normalized = rows.map((item) => {
              const obj = (item ?? {}) as any;
              const content =
                (obj.content ??
                  obj.name ??
                  obj.title ??
                  obj.activity ??
                  obj.area ??
                  obj.text ??
                  "") as string;
              const periodMethod =
                (obj.periodMethod ??
                  obj.period ??
                  obj.method ??
                  obj.duration ??
                  "") as string;
              const effect = (obj.effect ?? obj.remarks ?? "") as string;
              return {
                content: String(content ?? "").trim(),
                periodMethod: String(periodMethod ?? "").trim(),
                effect: String(effect ?? "").trim(),
              };
            });

            // 2단계: 모든 카드에 공통된 키(activity, period, remarks)로 통일
            const mapped = normalized.map((r) => ({
              activity: r.content,
              period: r.periodMethod,
              remarks: r.effect,
            }));

            return NextResponse.json({ rows: mapped });
          } catch (parseErr) {
            console.error("plan_fill_rows parse error:", parseErr);
            return NextResponse.json(
              { error: "AI가 반환한 형식을 파싱할 수 없습니다." },
              { status: 500 }
            );
          }
        }
        if (type === "self_eval_sections") {
          let raw = recommendation.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          try {
            const parsed = JSON.parse(raw) as Record<string, string>;
            const out: Record<string, string> = {};
            const keys = ["learningGoal", "learningResult", "lifeGoal", "lifeResult", "professionalGoal", "professionalResult", "dutyGoal", "dutyResult"];
            for (const k of keys) {
              out[k] = typeof parsed[k] === "string" ? parsed[k].trim() : "";
            }
            return NextResponse.json(out);
          } catch (parseErr) {
            console.error("self_eval_sections parse error:", parseErr);
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
    const msg = (error?.message ?? "").toLowerCase();
    const isQuotaOrRate =
      error?.status === 429 ||
      msg.includes("quota") ||
      msg.includes("rate") ||
      msg.includes("limit") ||
      msg.includes("resource_exhausted");
    if (isQuotaOrRate) {
      // 개발 환경에서는 실제 오류 내용을 함께 반환하여 원인 파악을 쉽게 합니다.
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          {
            error: "Gemini 호출이 제한되었습니다(쿼터/레이트리밋 가능).",
            code: "QUOTA_EXCEEDED",
            debug: {
              status: error?.status ?? null,
              name: error?.name ?? null,
              message: error?.message ?? null,
              details: error?.errorDetails ?? error?.details ?? null,
            },
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error: "개발자의 AI(제미나이) API한도가 초과되었습니다. 개발자의 주머니 사정이 여의치 않아 발생하는 오류이니 30여분 후 다시 실행부탁드립니다.",
          code: "QUOTA_EXCEEDED",
        },
        { status: 503 }
      );
    }
    const errorMessage = error?.message || "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json(
      process.env.NODE_ENV === "development"
        ? {
            error: `Gemini API 호출 실패: ${errorMessage}`,
            debug: {
              status: error?.status ?? null,
              name: error?.name ?? null,
              message: error?.message ?? null,
              details: error?.errorDetails ?? error?.details ?? null,
            },
          }
        : { error: `Gemini API 호출 실패: ${errorMessage}` },
      { status: 500 }
    );
  }
}
