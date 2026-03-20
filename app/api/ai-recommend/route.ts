import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_PROMPT_DEFAULTS, applyPromptTemplate } from "@/lib/aiPromptDefaults";

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
    if (!type || (type !== "goal" && type !== "effect" && type !== "analysis" && type !== "analysis_post" && type !== "mentor" && type !== "result_report" && type !== "plan_outline" && type !== "plan_fill_rows" && type !== "self_eval_sections" && type !== "analysis_post_rewrite" && type !== "next_year_goal")) {
      return NextResponse.json(
        { error: "올바른 type을 제공해주세요." },
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

    // 학교별 AI 프롬프트 오버라이드 조회
    const meta = (user?.user_metadata ?? {}) as { schoolName?: string };
    const schoolName = (meta.schoolName ?? "").trim();
    let promptTemplates: Record<string, string> = {};
    if (schoolName) {
      const { data: settingsRow } = await supabase
        .from("school_point_settings")
        .select("settings_json")
        .eq("school_name", schoolName)
        .maybeSingle();
      if (settingsRow?.settings_json) {
        try {
          const parsed = JSON.parse(settingsRow.settings_json as string) as Record<string, unknown>;
          const raw = parsed.aiPromptTemplates;
          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            promptTemplates = raw as Record<string, string>;
          }
        } catch {
          // ignore
        }
      }
    }

    const getTemplate = (t: string) => (promptTemplates[t]?.trim() || ((AI_PROMPT_DEFAULTS as Record<string, { template: string }>)[t]?.template ?? ""));

    // 프롬프트 구성 (1인칭 시점, 교사 본인의 자기성찰·다짐)
    let prompt = "";

    if (type === "analysis") {
      const domainScores = (body as any)?.domainScores || "";
      const totalScore = (body as any)?.totalScore ?? 0;
      const domainCount = Math.min(6, Math.max(2, Number((body as any)?.domainCount) || 6));
      prompt = applyPromptTemplate(getTemplate("analysis"), {
        domainCount,
        strongDomainsText: strongDomainsText || "없음",
        weakDomainsText: weakDomainsText || "없음",
        domainScores: domainScores || "제공되지 않음",
        totalScore,
      });
    } else if (type === "analysis_post") {
      const pre = (body as any)?.preScores || {};
      const post = (body as any)?.postScores || {};
      const preTotal = Number((body as any)?.preTotal) ?? 0;
      const postTotal = Number((body as any)?.postTotal) ?? 0;
      const FALLBACK_DOMAIN_LABELS: Record<string, string> = {
        domain1: "영역1", domain2: "영역2", domain3: "영역3",
        domain4: "영역4", domain5: "영역5", domain6: "영역6",
      };
      const domainLabels = typeof (body as any)?.domainLabels === "object" && (body as any).domainLabels !== null
        ? { ...FALLBACK_DOMAIN_LABELS, ...(body as any).domainLabels }
        : FALLBACK_DOMAIN_LABELS;
      const domainKeysList: string[] = Array.isArray((body as any)?.domainKeys) && (body as any).domainKeys.length > 0
        ? (body as any).domainKeys
        : Object.keys(domainLabels);
      const getScore = (dataObj: any, key: string, label: string) => {
        if (dataObj[key] !== undefined) return Number(dataObj[key]);
        if (dataObj[label] !== undefined) return Number(dataObj[label]);
        return 0;
      };
      const preText = domainKeysList.map((k) => `${domainLabels[k] ?? k}: ${getScore(pre, k, domainLabels[k])}점`).join(", ");
      const postText = domainKeysList.map((k) => `${domainLabels[k] ?? k}: ${getScore(post, k, domainLabels[k])}점`).join(", ");
      prompt = applyPromptTemplate(getTemplate("analysis_post"), { preText, postText, preTotal, postTotal });
    } else if (type === "result_report") {
      const planSummary = String((body as any)?.planSummary ?? "").trim();
      const mileageText = String((body as any)?.mileageText ?? "").trim();
      prompt = applyPromptTemplate(getTemplate("result_report"), {
        planSummary: planSummary || "(없음)",
        mileageText: mileageText || "(없음)",
      });
    } else if (type === "self_eval_sections") {
      const planSummary = String((body as any)?.planSummary ?? "").trim();
      const mileageText = String((body as any)?.mileageText ?? "").trim();
      const ctx = (body as any)?.context ?? {};
      const contextText = [
        `소속: ${ctx.affiliation ?? ""}, 직위: ${ctx.position ?? ""}, 성명: ${ctx.evaluatorName ?? ""}`,
        `담당 학년·학급: ${ctx.gradeClass ?? ""}, 담당 과목: ${ctx.subject ?? ""}, 담임 여부: ${ctx.isHomeroom ?? ""}, 담당 업무: ${ctx.assignedDuties ?? ""}, 보직교사 여부: ${ctx.isPositionTeacher ?? ""}`,
        `주당 수업시간: ${ctx.hoursPerWeek ?? ""}, 연간 수업공개 실적: ${ctx.openClassResult ?? ""}, 연간 학생 상담 실적: ${ctx.studentCounselResult ?? ""}, 연간 학부모 상담 실적: ${ctx.parentCounselResult ?? ""}, 그 밖의 실적: ${ctx.otherResult ?? ""}`,
      ].join("\n");
      prompt = applyPromptTemplate(getTemplate("self_eval_sections"), {
        planSummary: planSummary || "(없음)",
        mileageText: mileageText || "(없음)",
        contextText: contextText || "(없음)",
      });
    } else if (type === "plan_outline") {
      const planSummary = String((body as any)?.planSummary ?? "").trim();
      const mileageText = String((body as any)?.mileageText ?? "").trim();
      prompt = applyPromptTemplate(getTemplate("plan_outline"), {
        planSummary: planSummary || "(없음)",
        mileageText: mileageText || "(없음)",
      });
    } else if (type === "goal") {
      prompt = applyPromptTemplate(getTemplate("goal"), {
        strongDomainsText: strongDomainsText || "(제공되지 않음)",
        weakDomainsText: weakDomainsText,
      });
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
        "[마일리지카드1 계획]",
        formatList(trainingPlans, (r) => `- ${r?.name ?? ""} (${r?.period ?? ""}, ${r?.duration ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[마일리지카드5 계획]",
        formatList(educationPlans, (r) => `- ${r?.area ?? ""} (${r?.period ?? ""}, ${r?.duration ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[마일리지카드4 계획]",
        formatList(bookPlans, (r) => `- ${r?.title ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""})`.trim()) || "(없음)",
        "[마일리지카드2 계획]",
        formatList(expenseRequests, (r) => `- ${r?.activity ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
      ].join("\n");
      prompt = applyPromptTemplate(getTemplate("effect"), {
        weakDomainsText: weakDomainsText || "없음",
        strongDomainsText: strongDomainsText || "없음",
        planText,
      });
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
        "[마일리지카드1 계획]",
        formatList(trainingPlans, (r: any) => `- ${r?.name ?? ""} (${r?.period ?? ""}, ${r?.duration ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[마일리지카드2 계획]",
        formatList(expenseRequests, (r: any) => `- ${r?.activity ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[마일리지카드3 계획]",
        formatList(communityPlans, (r: any) => `- ${r?.activity ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[마일리지카드4 계획]",
        formatList(bookPlans, (r: any) => `- ${r?.title ?? ""} (${r?.period ?? ""}, ${r?.method ?? ""})`.trim()) || "(없음)",
        "[마일리지카드5 계획]",
        formatList(educationPlans, (r: any) => `- ${r?.area ?? ""} (${r?.period ?? ""}, ${r?.duration ?? ""}) ${r?.remarks ?? ""}`.trim()) || "(없음)",
        "[마일리지카드6 계획]",
        formatList(otherPlans, (r: any) => `- ${(r as any)?.text ?? ""}`.trim()) || "(없음)",
      ].join("\n");
      prompt = applyPromptTemplate(getTemplate("mentor"), {
        strongDomainsText: strongDomainsText || "없음",
        weakDomainsText: weakDomainsText || "없음",
        planText,
      });
    } else if (type === "analysis_post_rewrite") {
      const text = String((body as any)?.text ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "text를 제공해주세요." }, { status: 400 });
      }
      prompt = applyPromptTemplate(getTemplate("analysis_post_rewrite"), { text });
    } else if (type === "next_year_goal") {
      const resultAnalysis = String((body as any)?.resultAnalysis ?? "").trim();
      const goalKeywords = Array.isArray((body as any)?.goalKeywords) ? (body as any)?.goalKeywords : [];
      if (!resultAnalysis) {
        return NextResponse.json({ error: "resultAnalysis(결과 분석)를 제공해주세요." }, { status: 400 });
      }
      const goalKeywordsArray = goalKeywords
        .map((k: unknown) => String(k ?? "").trim())
        .filter((k: string) => Boolean(k))
        .slice(0, 3);
      const goalKeywordsText = goalKeywordsArray.join(", ");
      const goalKeywordsExactLinesText = goalKeywordsArray.length
        ? goalKeywordsArray.map((k: string, idx: number) => `${idx + 1}) ${k}`).join("\n")
        : "";
      prompt = applyPromptTemplate(getTemplate("next_year_goal"), { resultAnalysis, goalKeywordsText, goalKeywordsExactLinesText });
    } else if (type === "plan_fill_rows") {
      const cardType = String((body as any)?.cardType ?? "").trim();
      const count = Math.min(Math.max(1, Number((body as any)?.count) || 1), 20);
      const developmentGoal = String((body as any)?.developmentGoal ?? "").trim();
      const categoryKey = String((body as any)?.categoryKey ?? "").trim();
      const categoryLabel = String((body as any)?.categoryLabel ?? "").trim();
      const categoryUnit = String((body as any)?.categoryUnit ?? "").trim();
      const currentYear = new Date().getFullYear();
      const allowedCardTypes = ["training", "expense", "community", "book", "education", "other"];
      if (!allowedCardTypes.includes(cardType)) {
        return NextResponse.json(
          { error: "cardType은 training, expense, community, book, education, other 중 하나여야 합니다." },
          { status: 400 }
        );
      }
      // 카테고리명·단위는 요청에서 옴(관리자가 학교에서 설정한 카드 제목) — 6개 카드 모두 고정 성격 없이 이 항목명에만 맞춤
      const categoryTitle = categoryLabel || categoryKey || "";
      const specDesc = categoryTitle ? `${categoryTitle}(내용, 시기 및 방법, 기대효과)` : "(내용, 시기 및 방법, 기대효과)";
      const categoryContext = categoryTitle
        ? `\n[카테고리(학교 설정) – 반드시 준수]\n- 현재 항목명(카드 제목): "${categoryTitle}"\n- 생성하는 내용은 **이 항목명이 의미하는 성격**에 맞아야 한다. 학교 관리자가 정한 이 항목의 성격·범위에 맞는 계획만 작성할 것. 항목명과 무관한 다른 영역(예: 제목과 딴판인 주제)은 넣지 말 것.\n- 카테고리 단위(참고): "${categoryUnit || "(없음)"}"\n`
        : "";
      const periodInstruction = `\n[시기 및 방법(periodMethod) 규칙 – 반드시 준수]\n- 연도는 **${currentYear}년**(올해)만 사용할 것. 과거 연도 사용 금지.\n- 시기 표현은 ${currentYear}년 기준 월 또는 학기 단위로, 방법(주기·형태)은 함께 한 줄로 작성할 것.\n`;
      // 6개 카드 공통: 행 구조만 안내(항목별 성격은 위 categoryContext의 항목명에 따름)
      const extraEducationInstruction = `\n[공통 – 모든 카드]\n- 각 행의 content(내용), periodMethod(시기 및 방법), effect(기대효과) 세 필드를 모두 채울 것. 내용은 위에서 정한 항목명("${categoryTitle || "해당 카드"}")의 성격에 맞게 작성할 것.\n`;
      const categoryTitlePrefix = categoryTitle ? `${categoryTitle}: ` : "";
      prompt = applyPromptTemplate(getTemplate("plan_fill_rows"), {
        categoryTitle: categoryTitlePrefix,
        specDesc,
        count,
        periodInstruction,
        extraEducationInstruction,
        categoryContext,
        developmentGoal: developmentGoal || "(없음 - 일반적인 교원 역량 개발에 맞는 합리적인 예시로 생성)",
        currentYear,
      });
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
