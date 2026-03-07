/**
 * 역량진단 엑셀 파서.
 *
 * 엑셀 형식 (첫 행 헤더):
 * - 문항번호: 번호 (선택, 없으면 행 번호 사용)
 * - 대영역: 반드시 4개. 동일 이름은 한 영역으로 묶임. 순서 = 첫 등장 순서.
 * - 소영역: 선택. 영역별 소분류 표시용.
 * - 방향: 정방향(1=낮음~5=높음) / 역방향(1=높음~5=낮음, 역·-·음 등)
 * - 문항(또는 문항내용): 문항 텍스트
 *
 * 5지선다 1~5점으로 설문 생성.
 */
import * as XLSX from "xlsx";
import type { DiagnosisSurvey, DiagnosisSurveyDomain, DiagnosisSurveyQuestion } from "./diagnosisSurvey";

const HEADER_ALIASES: Record<string, string[]> = {
  no: ["문항번호", "문항 번호", "번호", "no", "NO"],
  major: ["대영역", "영역", "major"],
  sub: ["소영역", "소 영역", "sub", "하위영역"],
  direction: ["방향", "direction", "정방향역방향"],
  text: ["문항", "문항내용", "문항 내용", "내용", "text", "질문"],
};

function findColumnKey(row: string[], key: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[key];
  for (let i = 0; i < row.length; i++) {
    const cell = String((row[i] ?? "")).trim();
    if (!cell) continue;
    if (aliases.some((a) => cell.includes(a) || a.includes(cell))) return i;
  }
  return -1;
}

function cellString(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[ref];
  if (!cell) return "";
  const v = cell.v;
  if (v == null) return "";
  return String(v).trim();
}

function cellNumber(sheet: XLSX.WorkSheet, row: number, col: number): number | null {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[ref];
  if (!cell) return null;
  const v = cell.v;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** 방향 문자열 → positive | negative */
function parseDirection(s: string): "positive" | "negative" {
  const t = String(s).trim().toLowerCase();
  if (t.includes("역") || t === "-" || t === "역방향" || t === "음") return "negative";
  return "positive";
}

export type ParseResult = { ok: true; survey: DiagnosisSurvey } | { ok: false; error: string };

export function parseDiagnosisExcel(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  if (!firstSheet) return { ok: false, error: "엑셀 시트가 비어 있습니다." };

  const range = XLSX.utils.decode_range(firstSheet["!ref"] ?? "A1");
  const headerRow = 0;
  const header: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    header.push(cellString(firstSheet, headerRow, c));
  }

  const colNo = findColumnKey(header, "no");
  const colMajor = findColumnKey(header, "major");
  const colSub = findColumnKey(header, "sub");
  const colDirection = findColumnKey(header, "direction");
  const colText = findColumnKey(header, "text");

  if (colMajor < 0 || colText < 0) {
    return {
      ok: false,
      error: "엑셀에 '대영역'과 '문항' 열이 필요합니다. 첫 행을 헤더로 사용합니다.",
    };
  }

  const majorOrder: string[] = [];
  const majorToIndex: Record<string, number> = {};
  const domainSubMap: Record<number, Set<string>> = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() };
  const rows: { no: number; major: string; sub: string; direction: "positive" | "negative"; text: string }[] = [];

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const major = colMajor >= 0 ? cellString(firstSheet, r, colMajor) : "";
    const text = colText >= 0 ? cellString(firstSheet, r, colText) : "";
    if (!text) continue;

    const no = colNo >= 0 ? cellNumber(firstSheet, r, colNo) : r;
    const sub = colSub >= 0 ? cellString(firstSheet, r, colSub) : "";
    const dirStr = colDirection >= 0 ? cellString(firstSheet, r, colDirection) : "";
    const direction = parseDirection(dirStr);

    const majorKey = major || "미분류";
    let idx = majorToIndex[majorKey];
    if (idx === undefined) {
      if (majorOrder.length >= 4) {
        return { ok: false, error: "대영역은 정확히 4개만 허용됩니다. 5개 이상 발견되었습니다." };
      }
      idx = majorOrder.length;
      majorToIndex[majorKey] = idx;
      majorOrder.push(majorKey);
      if (!domainSubMap[idx]) domainSubMap[idx] = new Set();
    }
    if (sub) domainSubMap[idx].add(sub);

    rows.push({
      no: no ?? r + 1,
      major: majorKey,
      sub,
      direction,
      text,
    });
  }

  if (majorOrder.length !== 4) {
    return {
      ok: false,
      error: `대영역이 정확히 4개여야 합니다. 현재 ${majorOrder.length}개입니다.`,
    };
  }

  const domains: DiagnosisSurveyDomain[] = majorOrder.map((name) => ({
    name,
    subDomains: Array.from(domainSubMap[majorOrder.indexOf(name)] || []),
  }));

  const questions: DiagnosisSurveyQuestion[] = rows.map((row, i) => {
    const domainIndex = majorToIndex[row.major];
    return {
      id: String(row.no),
      text: row.text,
      domainIndex,
      domainKey: `domain${domainIndex + 1}` as "domain1" | "domain2" | "domain3" | "domain4",
      subDomain: row.sub || undefined,
      direction: row.direction,
    };
  });

  const survey: DiagnosisSurvey = {
    domains,
    questions,
  };

  return { ok: true, survey };
}
