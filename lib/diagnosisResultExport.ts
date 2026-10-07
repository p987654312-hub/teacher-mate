/**
 * 관리자용 사전·사후 검사 결과 엑셀 시트 구성.
 * 영역 평균은 저장 시 역방향 문항을 보정한 영역 합계를 문항 수로 나눈 1~5점이다.
 */
import { computeSubDomainScores, scoreForQuestion, type DiagnosisSurvey } from "@/lib/diagnosisSurvey";

export type ExportDomain = { key: string; name: string };

export type ExportQuestion = {
  id: string;
  text: string;
  domainKey: string;
  domainName: string;
  subDomain?: string;
  direction: "positive" | "negative";
};

export type ExportSubDomain = {
  domainKey: string;
  domainName: string;
  name: string;
};

export type PhaseScores = {
  examDate: string;
  domainAvgs: Record<string, number | null>;
  subAvgs: Record<string, number | null>;
  totalNorm: number | null;
  answers: Record<string, { raw: number | null; scored: number | null }>;
};

export type DiagnosisExportRow = {
  name: string;
  email: string;
  gradeClass: string;
  pre: PhaseScores | null;
  post: PhaseScores | null;
};

export type DiagnosisExportPayload = {
  schoolName: string;
  title: string;
  domains: ExportDomain[];
  subDomains: ExportSubDomain[];
  questions: ExportQuestion[];
  rows: DiagnosisExportRow[];
};

export type ExportSheet = { name: string; rows: (string | number)[][] };

type StoredResult = {
  exam_date?: string | null;
  created_at?: string | null;
  domain1?: number | null;
  domain2?: number | null;
  domain3?: number | null;
  domain4?: number | null;
  domain5?: number | null;
  domain6?: number | null;
  total_score?: number | null;
  raw_answers?: Record<string, unknown> | null;
  category_scores?: Record<string, { score?: number; count?: number }> | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function subKey(domainKey: string, name: string): string {
  return `${domainKey}::${name}`;
}

export function collectSubDomains(domains: ExportDomain[], questions: ExportQuestion[]): ExportSubDomain[] {
  const nameByKey = new Map(domains.map((d) => [d.key, d.name]));
  const seen = new Set<string>();
  const out: ExportSubDomain[] = [];
  questions.forEach((q) => {
    const name = (q.subDomain ?? "").trim();
    if (!name) return;
    const key = subKey(q.domainKey, name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      domainKey: q.domainKey,
      domainName: q.domainName || nameByKey.get(q.domainKey) || q.domainKey,
      name,
    });
  });
  return out;
}

function countForDomain(
  key: string,
  category: StoredResult["category_scores"],
  questions: ExportQuestion[]
): number {
  const stored = category?.[key]?.count;
  if (typeof stored === "number") return stored > 0 ? stored : 0;
  return questions.filter((q) => q.domainKey === key).length;
}

function readChoice(raw: Record<string, unknown> | null | undefined, id: string): number | null {
  if (!raw) return null;
  const v = raw[id];
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

export function formatExamDate(examDate: string | null | undefined, createdAt: string | null | undefined): string {
  if (examDate) return String(examDate).slice(0, 10);
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return String(createdAt).slice(0, 10);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function summarizePhase(
  row: StoredResult,
  domains: ExportDomain[],
  questions: ExportQuestion[],
  subDomains: ExportSubDomain[]
): PhaseScores {
  const category = row.category_scores ?? null;
  const domainAvgs: Record<string, number | null> = {};
  let maxTotal = 0;
  let summed = 0;
  domains.forEach((d) => {
    const count = countForDomain(d.key, category, questions);
    const score = Number((row as Record<string, unknown>)[d.key]);
    const scoreOk = Number.isFinite(score);
    if (count > 0 && scoreOk) {
      domainAvgs[d.key] = score / count;
      maxTotal += count * 5;
      summed += score;
    } else {
      domainAvgs[d.key] = null;
    }
  });

  const storedTotal = Number(row.total_score);
  const totalNorm =
    maxTotal > 0
      ? ((Number.isFinite(storedTotal) ? storedTotal : summed) / maxTotal) * 100
      : null;

  const raw = (row.raw_answers ?? null) as Record<string, unknown> | null;
  const answers: PhaseScores["answers"] = {};
  const rawChoices: Record<string, number> = {};
  questions.forEach((q) => {
    const choice = readChoice(raw, q.id);
    const scored = choice == null ? null : scoreForQuestion(choice, q.direction);
    answers[q.id] = { raw: choice, scored };
    if (choice != null) rawChoices[q.id] = choice;
  });

  const subAvgs: Record<string, number | null> = {};
  if (subDomains.length > 0) {
    const survey: DiagnosisSurvey = {
      domains: domains.map((d) => ({ name: d.name, subDomains: [] })),
      questions: questions.map((q) => ({
        id: q.id,
        text: q.text,
        domainIndex: Math.max(0, Number(q.domainKey.replace("domain", "")) - 1),
        domainKey: q.domainKey,
        subDomain: q.subDomain,
        direction: q.direction,
      })),
    };
    const computed = computeSubDomainScores(survey, rawChoices);
    subDomains.forEach((s) => {
      const found = (computed[s.domainKey] ?? []).find((item) => item.name === s.name);
      subAvgs[subKey(s.domainKey, s.name)] = found && found.count > 0 ? found.avg : null;
    });
  }

  return {
    examDate: formatExamDate(row.exam_date, row.created_at),
    domainAvgs,
    subAvgs,
    totalNorm,
    answers,
  };
}

function cell(n: number | null | undefined): number | "" {
  if (n == null || Number.isNaN(n)) return "";
  return round2(n);
}

function diff(a: number | null | undefined, b: number | null | undefined): number | "" {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return "";
  return round2(b - a);
}

function uniqueLabels(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = name.trim() || "영역";
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let i = 2;
    while (used.has(`${base}_${i}`)) i += 1;
    const next = `${base}_${i}`;
    used.add(next);
    return next;
  });
}

export function buildDiagnosisExportSheets(payload: DiagnosisExportPayload): ExportSheet[] {
  const preCount = payload.rows.filter((r) => r.pre).length;
  const postCount = payload.rows.filter((r) => r.post).length;
  const bothCount = payload.rows.filter((r) => r.pre && r.post).length;

  const guide: ExportSheet = {
    name: "안내",
    rows: [
      ["항목", "내용"],
      ["학교", payload.schoolName],
      ["검사 제목", payload.title || "(제목 없음)"],
      ["포함 인원", `${payload.rows.length}명 (사전 ${preCount}명, 사후 ${postCount}명, 둘 다 ${bothCount}명)`],
      ["포함 대상", "이 학교에 소속된 교원 중 사전 또는 사후 검사를 한 번 이상 실시한 사람"],
      ["영역 평균", "1~5점. 역방향 문항은 선택값을 뒤집어(1↔5) 합산한 뒤 문항 수로 나눈 값"],
      ["총점", "100점 환산 (영역 만점 합 대비 취득 점수)"],
      ["변화", "사후 − 사전. 한쪽만 실시한 경우 빈칸"],
      ["문항별점수", "선택은 교원이 고른 1~5. 점수는 방향 보정 후 값. 문항 내용은 문항목록 시트"],
      ["빈칸", "해당 검사 미실시, 또는 그 문항 응답 없음"],
    ],
  };

  const domainLabels = uniqueLabels(payload.domains.map((d) => d.name));
  const domainHeader = ["성명", "이메일", "학년반", "사전실시일", "사후실시일"];
  payload.domains.forEach((_, i) => {
    const label = domainLabels[i];
    domainHeader.push(`사전_${label}_평균`, `사후_${label}_평균`, `변화_${label}`);
  });
  domainHeader.push("사전_총점(100점)", "사후_총점(100점)", "총점변화");

  const domainRows: (string | number)[][] = [domainHeader];
  payload.rows.forEach((row) => {
    const cells: (string | number)[] = [
      row.name,
      row.email,
      row.gradeClass,
      row.pre?.examDate ?? "",
      row.post?.examDate ?? "",
    ];
    payload.domains.forEach((d) => {
      const pre = row.pre?.domainAvgs[d.key] ?? null;
      const post = row.post?.domainAvgs[d.key] ?? null;
      cells.push(cell(pre), cell(post), diff(pre, post));
    });
    const preT = row.pre?.totalNorm ?? null;
    const postT = row.post?.totalNorm ?? null;
    cells.push(cell(preT), cell(postT), diff(preT, postT));
    domainRows.push(cells);
  });

  const sheets: ExportSheet[] = [guide, { name: "영역별결과", rows: domainRows }];

  if (payload.subDomains.length > 0) {
    const subLabels = uniqueLabels(payload.subDomains.map((s) => `${s.domainName}_${s.name}`));
    const header = ["성명", "이메일", "학년반", "사전실시일", "사후실시일"];
    payload.subDomains.forEach((_, i) => {
      const label = subLabels[i];
      header.push(`사전_${label}_평균`, `사후_${label}_평균`, `변화_${label}`);
    });
    const rows: (string | number)[][] = [header];
    payload.rows.forEach((row) => {
      const cells: (string | number)[] = [
        row.name,
        row.email,
        row.gradeClass,
        row.pre?.examDate ?? "",
        row.post?.examDate ?? "",
      ];
      payload.subDomains.forEach((s) => {
        const key = subKey(s.domainKey, s.name);
        const pre = row.pre?.subAvgs[key] ?? null;
        const post = row.post?.subAvgs[key] ?? null;
        cells.push(cell(pre), cell(post), diff(pre, post));
      });
      rows.push(cells);
    });
    sheets.push({ name: "소영역결과", rows });
  }

  const itemHeader = ["성명", "이메일", "학년반"];
  payload.questions.forEach((_, i) => {
    const n = i + 1;
    itemHeader.push(`사전Q${n}선택`, `사전Q${n}점수`, `사후Q${n}선택`, `사후Q${n}점수`);
  });
  const itemRows: (string | number)[][] = [itemHeader];
  payload.rows.forEach((row) => {
    const cells: (string | number)[] = [row.name, row.email, row.gradeClass];
    payload.questions.forEach((q) => {
      const pre = row.pre?.answers[q.id];
      const post = row.post?.answers[q.id];
      cells.push(cell(pre?.raw), cell(pre?.scored), cell(post?.raw), cell(post?.scored));
    });
    itemRows.push(cells);
  });
  sheets.push({ name: "문항별점수", rows: itemRows });

  const catalog: (string | number)[][] = [["번호", "문항ID", "대영역", "소영역", "방향", "설문내용"]];
  payload.questions.forEach((q, i) => {
    catalog.push([
      i + 1,
      q.id,
      q.domainName,
      q.subDomain ?? "",
      q.direction === "negative" ? "역방향" : "정방향",
      q.text,
    ]);
  });
  sheets.push({ name: "문항목록", rows: catalog });

  return sheets;
}
