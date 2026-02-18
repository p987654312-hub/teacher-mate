import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_DIAGNOSIS_DOMAINS, domainsToQuestions, type DiagnosisDomainConfig } from "@/lib/diagnosisQuestions";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

function parseDomainsJson(json: string | null): DiagnosisDomainConfig[] {
  if (!json?.trim()) return DEFAULT_DIAGNOSIS_DOMAINS;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 6) return DEFAULT_DIAGNOSIS_DOMAINS;
    return parsed.map((d: unknown, i: number) => {
      const def = DEFAULT_DIAGNOSIS_DOMAINS[i];
      if (!d || typeof d !== "object" || !("name" in d) || !("items" in d)) return def;
      const name = typeof (d as { name?: unknown }).name === "string" ? (d as { name: string }).name.trim() : def.name;
      const rawItems = (d as { items?: unknown }).items;
      const items = Array.isArray(rawItems)
        ? rawItems.slice(0, 5).map((t: unknown) => (typeof t === "string" ? t.trim() : ""))
        : def.items.slice(0, 5);
      return { name: name || def.name, items: items.length === 5 ? items : [...items, ...def.items.slice(items.length)].slice(0, 5) };
    });
  } catch {
    return DEFAULT_DIAGNOSIS_DOMAINS;
  }
}

/** 로그인한 사용자 소속 학교의 사전/사후검사 문항 조회 (교사·관리자) */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta?.role !== "teacher" && meta?.role !== "admin") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) {
      const questions = domainsToQuestions(DEFAULT_DIAGNOSIS_DOMAINS);
      return NextResponse.json({ domains: DEFAULT_DIAGNOSIS_DOMAINS, questions });
    }

    const { data: row } = await supabase
      .from("school_diagnosis_settings")
      .select("domains_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    const domains = parseDomainsJson(row?.domains_json ?? null);
    const questions = domainsToQuestions(domains);
    return NextResponse.json({ domains, questions });
  } catch (e) {
    console.error("diagnosis-questions GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
