import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

async function getCallerAdmin(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { error: "로그인이 필요합니다.", status: 401 as const };

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user: caller }, error: callerError } = await supabaseAuth.auth.getUser(token);
  if (callerError || !caller) return { error: "인증에 실패했습니다.", status: 401 as const };

  const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
  if (meta.role !== "admin" || !meta.schoolName?.trim()) {
    return { error: "학교 관리자만 실행할 수 있습니다.", status: 403 as const };
  }
  return { email: caller.email ?? "", schoolName: meta.schoolName.trim() };
}

function isMissingTable(error: unknown): boolean {
  const e = error as { message?: string; code?: string };
  return (e?.message?.includes("does not exist") ?? false) || e?.code === "42P01";
}

/** 학교 관리자: 사전/사후 학생 인식조사 결과 조회 */
export async function GET(req: Request) {
  try {
    const caller = await getCallerAdmin(req);
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const phase = new URL(req.url).searchParams.get("phase");
    if (phase !== "pre" && phase !== "post") {
      return NextResponse.json({ error: "phase는 pre 또는 post 여야 합니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("student_perception_results")
      .select("data, updated_at")
      .eq("school_name", caller.schoolName)
      .eq("phase", phase)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ ok: true, data: null, warning: "student_perception_results 테이블이 없습니다. supabase/student_perception_results.sql을 실행하세요." });
      }
      console.error("student-perception GET:", error);
      return NextResponse.json({ error: "조회에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data?.data ?? null, updatedAt: data?.updated_at ?? null });
  } catch (e) {
    console.error("student-perception GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** 학교 관리자: 사전/사후 학생 인식조사 결과 업로드(업서트) */
export async function POST(req: Request) {
  try {
    const caller = await getCallerAdmin(req);
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await req.json().catch(() => ({}));
    const phase = body?.phase as string | undefined;
    const data = body?.data;
    if (phase !== "pre" && phase !== "post") {
      return NextResponse.json({ error: "phase는 pre 또는 post 여야 합니다." }, { status: 400 });
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.classes) || !Array.isArray(data.rows)) {
      return NextResponse.json({ error: "데이터 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin.from("student_perception_results").upsert(
      {
        school_name: caller.schoolName,
        phase,
        data,
        updated_at: new Date().toISOString(),
        updated_by: caller.email,
      },
      { onConflict: "school_name,phase" }
    );

    if (error) {
      const hint = isMissingTable(error)
        ? " Supabase SQL Editor에서 supabase/student_perception_results.sql을 실행하세요."
        : "";
      console.error("student-perception POST:", error);
      return NextResponse.json(
        { error: `저장에 실패했습니다.${hint}`, details: (error as { message?: string }).message ?? String(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, phase });
  } catch (e) {
    console.error("student-perception POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
