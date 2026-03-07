import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeSubDomainScores } from "@/lib/diagnosisSurvey";
import type { DiagnosisSurvey } from "@/lib/diagnosisSurvey";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

const FALLBACK_DOMAIN_LABELS: Record<string, string> = {
  domain1: "영역1",
  domain2: "영역2",
  domain3: "영역3",
  domain4: "영역4",
  domain5: "영역5",
  domain6: "영역6",
};

const DEF_KEYS = ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const;

type DiagnosisSummaryPayload = {
  strengths: string[];
  weaknesses: string[];
  strengthsDetail?: { label: string; subDomains: { name: string; avg: number }[] }[];
  weaknessesDetail?: { label: string; subDomains: { name: string; avg: number }[] }[];
};

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email이 필요합니다." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller }, error: callerError } = await supabaseAuth.auth.getUser(token);
    if (callerError || !caller) {
      return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
    }

    const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !meta.schoolName) {
      return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = (listData?.users ?? []) as Array<{
      id: string;
      email?: string;
      user_metadata?: { role?: string; schoolName?: string; name?: string };
    }>;
    const teacher = users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase() && (u.user_metadata?.role ?? "") === "teacher"
    );
    if (!teacher) {
      return NextResponse.json({ error: "해당 교원을 찾을 수 없습니다." }, { status: 404 });
    }

    const teacherSchool = (teacher.user_metadata?.schoolName ?? "").trim();
    if (teacherSchool !== (meta.schoolName ?? "").trim()) {
      return NextResponse.json({ error: "같은 학교 소속만 조회할 수 있습니다." }, { status: 403 });
    }

    const targetEmail = teacher.email!;

    const { data: planRow } = await admin
      .from("development_plans")
      .select("*")
      .eq("user_email", targetEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: diag } = await admin
      .from("diagnosis_results")
      .select("domain1,domain2,domain3,domain4,domain5,domain6,raw_answers,category_scores")
      .eq("user_email", targetEmail)
      .or("diagnosis_type.is.null,diagnosis_type.eq.pre")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let diagnosisSummary: DiagnosisSummaryPayload | null = null;
    if (diag) {
      let domainLabels: Record<string, string> = { ...FALLBACK_DOMAIN_LABELS };
      let survey: DiagnosisSurvey | null = null;

      const { data: settingsRow } = await admin
        .from("school_point_settings")
        .select("settings_json")
        .eq("school_name", teacherSchool)
        .maybeSingle();

      if (settingsRow?.settings_json) {
        try {
          const parsed = JSON.parse(settingsRow.settings_json as string) as Record<string, unknown>;
          const s = parsed.diagnosisSurvey as DiagnosisSurvey | undefined;
          if (s?.domains?.length && Array.isArray(s.questions)) {
            survey = s;
            const labels: Record<string, string> = { ...FALLBACK_DOMAIN_LABELS };
            s.domains.forEach((d, i) => {
              const key = DEF_KEYS[i];
              if (key) labels[key] = (d.name ?? "").trim() || FALLBACK_DOMAIN_LABELS[key];
            });
            domainLabels = labels;
          } else if (Array.isArray(parsed.diagnosisDomains)) {
            const doms = parsed.diagnosisDomains as { name?: string }[];
            doms.forEach((d, i) => {
              const key = DEF_KEYS[i];
              if (key) domainLabels[key] = (d.name ?? "").trim() || FALLBACK_DOMAIN_LABELS[key];
            });
          }
        } catch {
          // keep fallback
        }
      }

      const domainCount = survey?.domains?.length ?? 6;
      const cat = (diag.category_scores ?? {}) as Record<string, { count?: number }>;
      const getCount = (key: string) => (cat?.[key]?.count ?? 5);
      const rows = DEF_KEYS.map((key) => ({
        domain: key,
        label: domainLabels[key],
        avg: ((diag[key] as number) ?? 0) / (getCount(key) || 1),
      }));
      const activeRows = rows.slice(0, Math.min(domainCount, 6));
      const sorted = [...activeRows].sort((a, b) => b.avg - a.avg);
      const strengthN = Math.ceil(domainCount / 2);
      const weaknessN = domainCount - strengthN;
      const strengths = sorted.slice(0, strengthN).map((r) => r.label);
      const weaknesses = sorted.slice(-weaknessN).reverse().map((r) => r.label);

      let strengthsDetail: { label: string; subDomains: { name: string; avg: number }[] }[] | undefined;
      let weaknessesDetail: { label: string; subDomains: { name: string; avg: number }[] }[] | undefined;

      if (survey?.domains?.length && Array.isArray(survey.questions)) {
        const rawFromDb = (diag.raw_answers ?? {}) as Record<string, unknown>;
        const rawAnswers: Record<string, number> = {};
        for (const [k, v] of Object.entries(rawFromDb)) {
          if (k === "_schema") continue;
          const num = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(num) && num >= 1 && num <= 5) rawAnswers[String(k)] = num;
        }
        const subByDomain = computeSubDomainScores(survey, rawAnswers);
        strengthsDetail = sorted.slice(0, strengthN).map((x) => ({
          label: x.label,
          subDomains: (subByDomain[x.domain] ?? []).sort((a, b) => b.avg - a.avg),
        }));
        weaknessesDetail = [...sorted.slice(-weaknessN)].reverse().map((x) => ({
          label: x.label,
          subDomains: (subByDomain[x.domain] ?? []).sort((a, b) => a.avg - b.avg),
        }));
      }

      diagnosisSummary = {
        strengths,
        weaknesses,
        strengthsDetail,
        weaknessesDetail,
      };
    }

    return NextResponse.json({
      ok: true,
      name: teacher.user_metadata?.name ?? "",
      schoolName: teacherSchool,
      plan: planRow ?? null,
      diagnosisSummary,
    });
  } catch (error) {
    console.error("plan-by-email error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
