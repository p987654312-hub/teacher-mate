/**
 * 엑셀 업로드 기반 역량진단 설문 (4대영역, 소영역 가변, 5지선다 1~5점).
 * 관리자가 엑셀을 업로드하면 해당 학교에 이 설문이 적용된다.
 */

export type DiagnosisSurveyQuestion = {
  id: string;
  text: string;
  domainIndex: number; // 0 ~ (domains.length - 1)
  domainKey: string;   // "domain1" .. "domain6" (영역 개수에 따라 2~6)
  subDomain?: string;
  direction: "positive" | "negative";
};

export type DiagnosisSurveyDomain = {
  name: string;
  subDomains: string[];
};

export type DiagnosisSurvey = {
  title?: string;
  domains: DiagnosisSurveyDomain[]; // 2~6개
  questions: DiagnosisSurveyQuestion[];
};

const DEFAULT_4_DOMAINS: DiagnosisSurveyDomain[] = [
  { name: "영역1", subDomains: [] },
  { name: "영역2", subDomains: [] },
  { name: "영역3", subDomains: [] },
  { name: "영역4", subDomains: [] },
];

/** 빈 4영역 설문 (업로드 전 기본값) */
export function getEmptySurvey(): DiagnosisSurvey {
  return {
    title: "",
    domains: [...DEFAULT_4_DOMAINS],
    questions: [],
  };
}

/** 역방향 문항 점수 보정: 선택지 1~5 → 점수 5~1 */
export function scoreForQuestion(
  choiceIndex1Based: number,
  direction: "positive" | "negative"
): number {
  const v = Math.min(5, Math.max(1, Math.round(Number(choiceIndex1Based))));
  if (direction === "negative") return 6 - v; // 1→5, 5→1
  return v;
}

/** 영역별 합계 계산 (영역 개수에 따라 domain1..domainN) */
export function computeDomainScores(
  survey: DiagnosisSurvey,
  answers: Record<string, number>
): Record<string, number> {
  const n = Math.max(0, survey.domains?.length ?? 0);
  const sums = new Array(n).fill(0);
  survey.questions.forEach((q) => {
    const score = answers[q.id];
    if (score !== undefined && !Number.isNaN(score) && q.domainIndex >= 0 && q.domainIndex < n) {
      sums[q.domainIndex] += score;
    }
  });
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) out[`domain${i + 1}`] = sums[i];
  return out;
}

export function totalScoreFromDomainScores(d: Record<string, number>): number {
  return Object.values(d).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

/** 설문 문항을 진단 페이지용 Question[] 형태로 (기존 호환용 id, text, domain) */
export type FlatQuestion = { id: string; text: string; domain: string };
export function surveyToFlatQuestions(survey: DiagnosisSurvey): FlatQuestion[] {
  return survey.questions.map((q) => ({
    id: q.id,
    text: q.text,
    domain: q.domainKey,
  }));
}

/** 소영역별 점수 (raw_answers는 1~5 선택값, 방향 반영하여 합산) */
export type SubDomainScore = { name: string; sum: number; count: number; avg: number };
export type SubDomainScoresByDomain = Record<string, SubDomainScore[]>;

export function computeSubDomainScores(
  survey: DiagnosisSurvey,
  rawAnswers: Record<string, number>
): SubDomainScoresByDomain {
  const n = Math.max(0, survey.domains?.length ?? 0);
  const byDomain: Record<string, Map<string, { sum: number; count: number }>> = {};
  for (let i = 0; i < n; i++) byDomain[`domain${i + 1}`] = new Map();
  survey.questions.forEach((q) => {
    const raw = rawAnswers[String(q.id)];
    if (raw === undefined || raw === null || raw < 1 || raw > 5) return;
    const points = scoreForQuestion(raw, q.direction);
    const subName = q.subDomain?.trim() || "기타";
    const map = byDomain[q.domainKey];
    if (!map) return;
    const cur = map.get(subName) ?? { sum: 0, count: 0 };
    cur.sum += points;
    cur.count += 1;
    map.set(subName, cur);
  });
  const out: SubDomainScoresByDomain = {};
  for (let i = 0; i < n; i++) {
    const key = `domain${i + 1}`;
    const map = byDomain[key];
    out[key] = Array.from(map.entries()).map(([name, { sum, count }]) => ({
      name,
      sum,
      count,
      avg: count > 0 ? sum / count : 0,
    }));
  }
  return out;
}
