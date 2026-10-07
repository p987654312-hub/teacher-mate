import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { DEFAULT_DIAGNOSIS_DOMAINS, domainsToQuestions, type DiagnosisDomainConfig } from "@/lib/diagnosisQuestions";
import type { DiagnosisSurvey } from "@/lib/diagnosisSurvey";
import {
  buildDiagnosisExportSheets,
  collectSubDomains,
  summarizePhase,
  type DiagnosisExportPayload,
  type DiagnosisExportRow,
  type ExportDomain,
  type ExportQuestion,
} from "@/lib/diagnosisResultExport";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

type ListedUser = {
  id: string;
  email?: string;
  user_metadata?: {
    role?: string;
    schoolName?: string;
    name?: string;
    gradeClass?: string;
    subject?: string;
    schoolLevel?: string;
  };
};

type DbResult = {
  user_email?: string | null;
  diagnosis_type?: string | null;
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

async function listAllUsers(admin: ReturnType<typeof getSupabaseAdmin>): Promise<ListedUser[]> {
  const perPage = 1000;
  for (const start of [1, 0]) {
    const batch: ListedUser[] = [];
    for (let i = 0; i < 30; i++) {
      const page = start + i;
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const users = (data?.users ?? []) as ListedUser[];
      if (users.length === 0) break;
      batch.push(...users);
      if (users.length < perPage) break;
    }
    if (batch.length > 0) return batch;
  }
  return [];
}

function parseSchoolInstrument(settingsJson: string | null): {
  title: string;
  domains: ExportDomain[];
  questions: ExportQuestion[];
  fromSurvey: boolean;
} {
  let parsed: Record<string, unknown> = {};
  if (settingsJson) {
    try {
      parsed = JSON.parse(settingsJson) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }

  const survey = parsed.diagnosisSurvey as DiagnosisSurvey | undefined;
  const surveyOk =
    !!survey &&
    Array.isArray(survey.domains) &&
    survey.domains.length >= 2 &&
    survey.domains.length <= 6 &&
    Array.isArray(survey.questions) &&
    survey.questions.length > 0;

  const titleFromSettings = typeof parsed.diagnosisTitle === "string" ? parsed.diagnosisTitle.trim() : "";
  const title = titleFromSettings || (surveyOk ? (survey.title ?? "").trim() : "");

  if (surveyOk && survey) {
    const domains: ExportDomain[] = survey.domains.map((d, i) => ({
      key: `domain${i + 1}`,
      name: (d.name ?? "").trim() || `영역${i + 1}`,
    }));
    const questions: ExportQuestion[] = survey.questions.map((q) => ({
      id: String(q.id),
      text: q.text ?? "",
      domainKey: q.domainKey || `domain${(q.domainIndex ?? 0) + 1}`,
      domainName: domains[q.domainIndex]?.name ?? domains.find((d) => d.key === q.domainKey)?.name ?? "",
      subDomain: (q.subDomain ?? "").trim() || undefined,
      direction: q.direction === "negative" ? "negative" : "positive",
    }));
    return { title, domains, questions, fromSurvey: true };
  }

  let source: DiagnosisDomainConfig[] = DEFAULT_DIAGNOSIS_DOMAINS;
  if (Array.isArray(parsed.diagnosisDomains) && parsed.diagnosisDomains.length === 6) {
    source = (parsed.diagnosisDomains as unknown[]).map((d, i) => {
      const def = DEFAULT_DIAGNOSIS_DOMAINS[i];
      if (!d || typeof d !== "object") return def;
      const o = d as { name?: unknown; items?: unknown };
      const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : def.name;
      const rawItems = Array.isArray(o.items) ? o.items : [];
      const items = Array.from({ length: 5 }, (_, idx) =>
        typeof rawItems[idx] === "string" && String(rawItems[idx]).trim()
          ? String(rawItems[idx]).trim()
          : (def.items[idx] ?? "")
      );
      return { name, items };
    });
  }

  const flat = domainsToQuestions(source);
  return {
    title,
    fromSurvey: false,
    domains: source.map((d, i) => ({ key: `domain${i + 1}`, name: d.name })),
    questions: flat.map((q) => ({
      id: q.id,
      text: q.text,
      domainKey: q.domain,
      domainName: source[Number(q.domain.replace("domain", "")) - 1]?.name ?? q.domain,
      direction: "positive" as const,
    })),
  };
}

function isPre(row: DbResult): boolean {
  const t = String(row.diagnosis_type ?? "pre").trim().toLowerCase();
  return t === "" || t === "pre";
}

function isPost(row: DbResult): boolean {
  return String(row.diagnosis_type ?? "").trim().toLowerCase() === "post";
}

function latestOf(rows: DbResult[], pred: (row: DbResult) => boolean): DbResult | null {
  const matched = rows.filter(pred);
  matched.sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });
  return matched[0] ?? null;
}

async function fetchResults(admin: ReturnType<typeof getSupabaseAdmin>, emails: string[]): Promise<DbResult[]> {
  const all: DbResult[] = [];
  for (let i = 0; i < emails.length; i += 80) {
    const chunk = emails.slice(i, i + 80);
    const { data, error } = await admin
      .from("diagnosis_results")
      .select(
        "user_email, diagnosis_type, exam_date, created_at, domain1, domain2, domain3, domain4, domain5, domain6, total_score, raw_answers, category_scores"
      )
      .in("user_email", chunk)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    all.push(...((data ?? []) as DbResult[]));
  }
  return all;
}

function ymd(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** 관리자: 같은 학교 교원의 사전·사후 검사 결과를 JSON 또는 엑셀로 반환 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const format = (body as { format?: string })?.format === "xlsx" ? "xlsx" : "json";

    const admin = getSupabaseAdmin();
    const { data: { user: caller }, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !caller) {
      return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
    }

    const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !(meta.schoolName ?? "").trim()) {
      return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
    }
    const schoolName = (meta.schoolName ?? "").trim();

    const users = await listAllUsers(admin);
    const teachers = users.filter((u) => {
      const m = u.user_metadata ?? {};
      return (m.role === "teacher" || m.role === "admin") && (m.schoolName ?? "").trim() === schoolName;
    });

    const emailSet = new Set<string>();
    teachers.forEach((t) => {
      const raw = (t.email ?? "").trim();
      if (!raw) return;
      emailSet.add(raw);
      emailSet.add(raw.toLowerCase());
    });

    const { data: settingsRow } = await admin
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    const instrument = parseSchoolInstrument((settingsRow?.settings_json as string | null) ?? null);

    const results = emailSet.size > 0 ? await fetchResults(admin, Array.from(emailSet)) : [];
    if (!instrument.fromSurvey && instrument.domains.length > 4) {
      const looksLikeFourDomain = results.some((row) => row.raw_answers?._schema === "v4");
      const hasLaterDomain = results.some((row) => {
        const cat = row.category_scores;
        return (cat?.domain5?.count ?? 0) > 0 || (cat?.domain6?.count ?? 0) > 0;
      });
      if (looksLikeFourDomain && !hasLaterDomain) {
        instrument.domains = instrument.domains.slice(0, 4);
        instrument.questions = instrument.questions.filter((q) =>
          q.domainKey === "domain1" || q.domainKey === "domain2" || q.domainKey === "domain3" || q.domainKey === "domain4"
        );
      }
    }
    const subDomains = collectSubDomains(instrument.domains, instrument.questions);
    const byEmail = new Map<string, DbResult[]>();
    results.forEach((row) => {
      const key = (row.user_email ?? "").trim().toLowerCase();
      if (!key) return;
      const list = byEmail.get(key) ?? [];
      list.push(row);
      byEmail.set(key, list);
    });

    const rows: DiagnosisExportRow[] = [];
    teachers.forEach((t) => {
      const email = (t.email ?? "").trim();
      if (!email) return;
      const list = byEmail.get(email.toLowerCase()) ?? [];
      const pre = latestOf(list, isPre);
      const post = latestOf(list, isPost);
      if (!pre && !post) return;
      const teacherMeta = t.user_metadata ?? {};
      rows.push({
        name: (teacherMeta.name ?? "").trim(),
        email,
        gradeClass: (teacherMeta.gradeClass ?? teacherMeta.subject ?? teacherMeta.schoolLevel ?? "").trim(),
        pre: pre ? summarizePhase(pre, instrument.domains, instrument.questions, subDomains) : null,
        post: post ? summarizePhase(post, instrument.domains, instrument.questions, subDomains) : null,
      });
    });

    rows.sort((a, b) => {
      const ag = a.gradeClass.trim() ? a.gradeClass : "\uffff";
      const bg = b.gradeClass.trim() ? b.gradeClass : "\uffff";
      const g = ag.localeCompare(bg, "ko");
      if (g !== 0) return g;
      return (a.name || a.email).localeCompare(b.name || b.email, "ko");
    });

    const payload: DiagnosisExportPayload = {
      schoolName,
      title: instrument.title,
      domains: instrument.domains,
      subDomains,
      questions: instrument.questions,
      rows,
    };

    if (format === "json") {
      return NextResponse.json({ ok: true, ...payload });
    }

    const sheets = buildDiagnosisExportSheets(payload);
    const wb = XLSX.utils.book_new();
    sheets.forEach((sheet) => {
      const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
      const header = sheet.rows[0] ?? [];
      ws["!cols"] = header.map((h) => ({ wch: Math.min(36, Math.max(12, String(h).length + 2)) }));
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    });
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
    const safeSchool = schoolName.replace(/[\\/:*?"<>|]/g, "_");
    const filename = `${safeSchool}_사전사후검사결과_${ymd()}.xlsx`;
    const ascii = `diagnosis-results-${ymd()}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("diagnosis-results-export error:", error);
    return NextResponse.json({ error: "검사 결과를 불러오는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
