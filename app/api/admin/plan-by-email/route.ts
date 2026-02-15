import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

const DOMAIN_LABELS: Record<string, string> = {
  domain1: "수업 설계·운영",
  domain2: "학생 이해·생활지도",
  domain3: "평가·피드백",
  domain4: "학급경영·안전",
  domain5: "전문성 개발·성찰",
  domain6: "소통·협력 및 포용적 교육",
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
      .select("domain1,domain2,domain3,domain4,domain5,domain6")
      .eq("user_email", targetEmail)
      .or("diagnosis_type.is.null,diagnosis_type.eq.pre")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let diagnosisSummary: { strengths: string[]; weaknesses: string[] } | null = null;
    if (diag) {
      const rows = [
        { domain: "domain1", label: DOMAIN_LABELS.domain1, avg: ((diag.domain1 as number) ?? 0) / 5 },
        { domain: "domain2", label: DOMAIN_LABELS.domain2, avg: ((diag.domain2 as number) ?? 0) / 5 },
        { domain: "domain3", label: DOMAIN_LABELS.domain3, avg: ((diag.domain3 as number) ?? 0) / 5 },
        { domain: "domain4", label: DOMAIN_LABELS.domain4, avg: ((diag.domain4 as number) ?? 0) / 5 },
        { domain: "domain5", label: DOMAIN_LABELS.domain5, avg: ((diag.domain5 as number) ?? 0) / 5 },
        { domain: "domain6", label: DOMAIN_LABELS.domain6, avg: ((diag.domain6 as number) ?? 0) / 5 },
      ];
      const sorted = [...rows].sort((a, b) => b.avg - a.avg);
      diagnosisSummary = {
        strengths: sorted.slice(0, 3).map((r) => r.label),
        weaknesses: sorted.slice(-3).reverse().map((r) => r.label),
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
