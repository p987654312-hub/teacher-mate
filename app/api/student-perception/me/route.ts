import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 로그인한 교원: 본인 학교의 학생 인식조사 결과(학급 단위 집계) 조회 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user: caller }, error: callerError } = await supabaseAuth.auth.getUser(token);
    if (callerError || !caller) return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });

    const meta = (caller.user_metadata ?? {}) as { schoolName?: string };
    const schoolName = meta.schoolName?.trim();
    if (!schoolName) return NextResponse.json({ ok: true, data: null });

    const phase = new URL(req.url).searchParams.get("phase");
    if (phase !== "pre" && phase !== "post") {
      return NextResponse.json({ error: "phase는 pre 또는 post 여야 합니다." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("student_perception_results")
      .select("data")
      .eq("school_name", schoolName)
      .eq("phase", phase)
      .maybeSingle();

    if (error) {
      const e = error as { message?: string; code?: string };
      if ((e?.message?.includes("does not exist") ?? false) || e?.code === "42P01") {
        return NextResponse.json({ ok: true, data: null });
      }
      console.error("student-perception/me GET:", error);
      return NextResponse.json({ ok: true, data: null });
    }

    return NextResponse.json({ ok: true, data: data?.data ?? null });
  } catch (e) {
    console.error("student-perception/me GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
