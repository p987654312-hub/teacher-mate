/**
 * 마일리지 진행률: 목표 단위(시간/회/권/km/건)에 맞게 content에서 수치를 파싱해 합산하고 진행률 계산.
 */

export const MILEAGE_CATEGORIES = [
  { key: "training", label: "연수(직무·자율)" },
  { key: "class_open", label: "수업 공개" },
  { key: "community", label: "교원학습 공동체" },
  { key: "book_edutech", label: "전문 서적/에듀테크" },
  { key: "health", label: "건강/체력" },
  { key: "other", label: "기타 계획" },
] as const;

export const PLAN_GOAL_KEYS: Record<string, string> = {
  training: "annual_goal",
  class_open: "expense_annual_goal",
  community: "community_annual_goal",
  book_edutech: "book_annual_goal",
  health: "education_annual_goal",
  other: "other_annual_goal",
};

function collectUnitValues(text: string, regex: RegExp): number {
  let sum = 0;
  const re = new RegExp(regex.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat((m[1] ?? "").replace(",", "."));
    if (!Number.isNaN(n)) sum += n;
  }
  return sum;
}

/** 시간 카테고리: 시간 + 분(60분=1시간, 남는 분은 절삭). */
function parseTimeValue(text: string): number {
  const hours = collectUnitValues(text, /(\d+(?:\.\d+)?)\s*시간/g);
  const minutes = collectUnitValues(text, /(\d+(?:\.\d+)?)\s*분/g);
  return hours + Math.floor(minutes / 60);
}

/** 시간에 유효 패턴(시간 또는 분)이 있는지. */
function hasTimePattern(text: string): boolean {
  return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*시간/g) > 0 || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*분/g) > 0;
}

/** 패턴만으로 추출한 값(폴백 없음). 마일리지 계산 실패 여부 판단용. */
function valueFromPatternOnly(
  text: string,
  categoryKey: string,
  healthGoalUnit: "시간" | "거리"
): number {
  switch (categoryKey) {
    case "training":
      return parseTimeValue(text);
    case "class_open":
    case "community":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g);
    case "book_edutech":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*권/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g);
    case "health":
      if (healthGoalUnit === "거리") {
        return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*km/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*킬로/g);
      }
      return parseTimeValue(text);
    case "other":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*건/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g);
    default:
      return 0;
  }
}

/** 기재양식에 맞는지. 단위가 정확히 일치하는 경우에만 true 반환. */
export function hasValidMileageFormat(
  content: string,
  categoryKey: string,
  healthGoalUnit: "시간" | "거리",
  categoryUnit?: string
): boolean {
  const text = (content ?? "").trim();
  if (!text) return true;
  
  // categoryUnit이 있으면 해당 단위 기준으로 정확히 검증
  if (categoryUnit) {
    if (categoryUnit === "km") {
      // km 단위: km만 허용 (시간은 허용하지 않음)
      // "0.5km", "2.5km", "10km" 등 소수점 포함 모든 km 패턴 매칭
      const kmMatch1 = text.match(/(\d+(?:\.\d+)?)\s*km/gi);
      const kmMatch2 = text.match(/(\d+(?:\.\d+)?)\s*킬로/gi);
      return (kmMatch1 !== null && kmMatch1.length > 0) || (kmMatch2 !== null && kmMatch2.length > 0);
    }
    if (categoryUnit === "시간") {
      // 시간 단위: 시간 또는 분만 허용 (km은 허용하지 않음)
      return hasTimePattern(text);
    }
    if (categoryUnit === "분") {
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*분/g) > 0;
    }
    if (categoryUnit === "회") {
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) > 0 || true; // 기본적으로 허용
    }
    if (categoryUnit === "건") {
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*건/g) > 0 || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) > 0 || true;
    }
    if (categoryUnit === "권") {
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*권/g) > 0 || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) > 0 || true;
    }
  }
  
  switch (categoryKey) {
    case "training":
      return hasTimePattern(text);
    case "health":
      if (healthGoalUnit === "거리") {
        // 거리 단위: km만 허용 (시간은 허용하지 않음)
        const kmMatch = text.match(/(\d+(?:\.\d+)?)\s*km/gi) || text.match(/(\d+(?:\.\d+)?)\s*킬로/gi);
        return kmMatch !== null && kmMatch.length > 0;
      }
      return hasTimePattern(text);
    case "class_open":
    case "community":
    case "book_edutech":
    case "other":
      return true;
    default:
      return valueFromPatternOnly(text, categoryKey, healthGoalUnit) > 0;
  }
}

/** 단위 문자열에 따라 content에서 수치 추출 (학교 설정 반영). 단위가 정확히 일치하는 경우에만 반환. */
function parseByUnit(text: string, unit: string): number {
  switch (unit) {
    case "시간":
      // 시간 단위: 시간 또는 분만 허용 (km은 허용하지 않음)
      return parseTimeValue(text) || 0;
    case "분":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*분/g) || 0;
    case "회":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) || 0;
    case "건":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*건/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) || 0;
    case "권":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*권/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) || 0;
    case "km":
      // km 단위: km만 허용 (시간은 허용하지 않음)
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*km/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*킬로/g) || 0;
    default:
      return parseTimeValue(text) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) || 0;
  }
}

/** 한 건의 content에서 목표 단위에 맞는 수치 추출. categoryUnit이 있으면 해당 단위로 파싱(학교 설정 반영). */
export function parseValueFromContent(
  content: string,
  categoryKey: string,
  healthGoalUnit: "시간" | "거리",
  categoryUnit?: string
): number {
  const text = (content ?? "").trim();
  if (!text) return 0;

  if (categoryUnit && ["시간", "분", "회", "건", "권", "km"].includes(categoryUnit)) {
    return parseByUnit(text, categoryUnit);
  }

  switch (categoryKey) {
    case "training":
      return parseTimeValue(text) || 1;
    case "health":
      if (healthGoalUnit === "거리") {
        // km 단위: km만 허용 (시간은 허용하지 않음)
        const km = collectUnitValues(text, /(\d+(?:\.\d+)?)\s*km/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*킬로/g);
        return km || 0; // 단위가 맞지 않으면 0 반환 (계산 제외)
      }
      // 시간 단위: 시간 또는 분만 허용 (km은 허용하지 않음)
      return parseTimeValue(text) || 0;
    case "class_open":
    case "community":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) || 1;
    case "book_edutech":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*권/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) || 1;
    case "other":
      return collectUnitValues(text, /(\d+(?:\.\d+)?)\s*건/g) || collectUnitValues(text, /(\d+(?:\.\d+)?)\s*회/g) || 1;
    default:
      return 1;
  }
}

export type MileageEntryLike = { content: string; category: string };
export type PlanGoalsLike = Record<string, number>;

function getCategoryUnit(categoryKey: string, healthGoalUnit: "시간" | "거리", unitOverride?: string): string {
  if (unitOverride) return unitOverride;
  if (categoryKey === "training") return "시간";
  if (categoryKey === "health") return healthGoalUnit === "거리" ? "km" : "시간";
  if (categoryKey === "class_open" || categoryKey === "community" || categoryKey === "book_edutech") return "회";
  return "건";
}

export type CategoryConfigLike = { key: string; label: string; unit: string }[];

/** 카테고리별 합산 및 진행률 계산. sum, goal, unit 포함. schoolCategories 있으면 영역명·단위 반영. */
export function computeMileageProgress(
  entries: MileageEntryLike[],
  planGoals: PlanGoalsLike,
  healthGoalUnit: "시간" | "거리",
  schoolCategories?: CategoryConfigLike
): {
  categories: { key: string; label: string; progress: number; sum: number; goal: number; unit: string }[];
  overallProgress: number;
} {
  const cats = schoolCategories?.length === 6 ? schoolCategories : MILEAGE_CATEGORIES.map((c) => ({ key: c.key, label: c.label, unit: getCategoryUnit(c.key, healthGoalUnit) }));
  const sumByCategory: Record<string, number> = {};
  cats.forEach((c) => {
    sumByCategory[c.key] = 0;
  });
  const unitByKey: Record<string, string> = {};
  cats.forEach((c) => {
    unitByKey[c.key] = c.unit;
  });
  entries.forEach((e) => {
    const k = e.category;
    if (k && sumByCategory[k] !== undefined) {
      const unit = unitByKey[k];
      sumByCategory[k] += parseValueFromContent(e.content, k, healthGoalUnit, unit);
    }
  });

  const categories = cats.map((c) => {
    const goal = planGoals[c.key] ?? 0;
    const sum = sumByCategory[c.key] ?? 0;
    const progress = goal > 0 ? Math.min(100, (sum / goal) * 100) : 0;
    return { key: c.key, label: c.label, progress, sum, goal, unit: c.unit };
  });

  const overallProgress =
    categories.length > 0
      ? Math.min(100, Math.round(categories.reduce((a, c) => a + c.progress, 0) / categories.length))
      : 0;

  return { categories, overallProgress };
}
