/**
 * 역량진단 CSV 파서 (자기역량진단도구.csv 형식).
 * 열 순서: 번호, 대영역, 소영역, 방향, 설문내용 (이후 열은 무시)
 * 방향: (+) 정방향, (-) 역방향
 */
import type { DiagnosisSurvey, DiagnosisSurveyDomain, DiagnosisSurveyQuestion } from "./diagnosisSurvey";

/** 쌍따옴표·쉼표·줄바꿈 처리하여 CSV 행 배열로 파싱 */
function parseCsvRows(content: string): string[][] {
  const raw = content.replace(/\uFEFF/g, "").trim();
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuote) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === ",") {
        row.push(field.trim());
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && raw[i + 1] === "\n") i++;
        row.push(field.trim());
        field = "";
        if (row.some((cell) => cell.length > 0)) rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function parseDirection(s: string): "positive" | "negative" {
  const t = String(s).trim();
  if (t.startsWith("(-") || t.includes("역") || t === "-") return "negative";
  return "positive";
}

export type ParseResult = { ok: true; survey: DiagnosisSurvey } | { ok: false; error: string };

const MAX_DOMAINS = 6;
const MAX_SUBDOMAINS_PER_DOMAIN = 4;

export function parseDiagnosisCsv(content: string): ParseResult {
  const rows = parseCsvRows(content);
  if (rows.length < 2) return { ok: false, error: "헤더와 최소 1행의 데이터가 필요합니다." };

  // 1번 행이 설명(유의사항 등)이면 제외하고 2번 행부터 헤더로 사용
  let start = 0;
  const firstRow = rows[0];
  const firstCell = (firstRow && firstRow[0]) ? String(firstRow[0]).trim() : "";
  const looksLikeHeader = firstCell.includes("번호") || (firstRow && firstRow.length >= 2 && String(firstRow[1] || "").trim().includes("대영역"));
  if (!looksLikeHeader && rows.length >= 2) {
    start = 1; // 설명 행 스킵
  }

  const header = rows[start];
  const colNo = 0;
  const colMajor = 1;
  const colSub = 2;
  const colDirection = 3;
  const colText = 4;
  if (!header || header.length < 5) return { ok: false, error: "열이 부족합니다. 번호,대영역,소영역,방향,설문내용 순으로 필요합니다." };

  const majorOrder: string[] = [];
  const majorToIndex: Record<string, number> = {};
  const domainSubMap: Record<number, Set<string>> = {};
  const dataRows: { no: number; major: string; sub: string; direction: "positive" | "negative"; text: string }[] = [];

  for (let r = start + 1; r < rows.length; r++) {
    const cells = rows[r];
    const text = cells[colText] !== undefined ? String(cells[colText]).trim() : "";
    if (!text) continue;

    const noRaw = cells[colNo] !== undefined ? String(cells[colNo]).trim() : "";
    const no = noRaw ? parseInt(noRaw, 10) || r : r;
    const major = cells[colMajor] !== undefined ? String(cells[colMajor]).trim() : "";
    const sub = cells[colSub] !== undefined ? String(cells[colSub]).trim() : "";
    const dirStr = cells[colDirection] !== undefined ? String(cells[colDirection]).trim() : "";
    const direction = parseDirection(dirStr);

    const majorKey = major || "미분류";
    let idx = majorToIndex[majorKey];
    if (idx === undefined) {
      if (majorOrder.length >= MAX_DOMAINS) {
        return { ok: false, error: `대영역은 ${MAX_DOMAINS}개 이내로 설정해 주세요. (현재 ${majorOrder.length + 1}개)` };
      }
      idx = majorOrder.length;
      majorToIndex[majorKey] = idx;
      majorOrder.push(majorKey);
      domainSubMap[idx] = new Set();
    }
    if (sub) {
      const set = domainSubMap[idx];
      if (set && set.size >= MAX_SUBDOMAINS_PER_DOMAIN && !set.has(sub)) {
        return { ok: false, error: `"${majorKey}" 대영역의 소영역은 ${MAX_SUBDOMAINS_PER_DOMAIN}개 이하로 설정해 주세요.` };
      }
      if (set) set.add(sub);
    }

    dataRows.push({ no, major: majorKey, sub, direction, text });
  }

  if (majorOrder.length < 2) {
    return { ok: false, error: `대영역은 2개 이상 ${MAX_DOMAINS}개 이내로 설정해 주세요. (현재 ${majorOrder.length}개)` };
  }

  const domains: DiagnosisSurveyDomain[] = majorOrder.map((name) => ({
    name,
    subDomains: Array.from(domainSubMap[majorOrder.indexOf(name)] || []),
  }));

  const questions: DiagnosisSurveyQuestion[] = dataRows.map((row) => {
    const domainIndex = majorToIndex[row.major];
    return {
      id: String(row.no),
      text: row.text,
      domainIndex,
      domainKey: `domain${domainIndex + 1}`,
      subDomain: row.sub || undefined,
      direction: row.direction,
    };
  });

  return { ok: true, survey: { domains, questions } };
}
