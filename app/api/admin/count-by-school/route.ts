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

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const schoolName = body?.schoolName;
    if (!schoolName || typeof schoolName !== "string") {
      return NextResponse.json({ error: "schoolName is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(token);
    if (callerError || !caller) {
      return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
    }

    const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !meta.schoolName) {
      return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
    }
    const callerSchool = (meta.schoolName ?? "").trim();
    if (callerSchool !== (schoolName as string).trim()) {
      return NextResponse.json({ error: "본인 소속 학교만 조회할 수 있습니다." }, { status: 403 });
    }

    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) {
      console.error("count-by-school listUsers error:", error);
      return NextResponse.json({ error: "조회에 실패했습니다." }, { status: 500 });
    }

    const users = (data?.users ?? []) as Array<{ user_metadata?: { role?: string; schoolName?: string } }>;
    const trimmed = callerSchool;
    const adminCount = users.filter(
      (u) => (u.user_metadata?.role ?? "") === "admin" && (u.user_metadata?.schoolName ?? "").trim() === trimmed
    ).length;

    return NextResponse.json({ adminCount });
  } catch (error) {
    console.error("count-by-school error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
