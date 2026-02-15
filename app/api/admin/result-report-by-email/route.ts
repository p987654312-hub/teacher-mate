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

    const [
      { data: preData },
      { data: postData },
      { data: mileageData },
      { data: draftRow },
      { data: evidenceRow },
      { data: nextYearRow },
    ] = await Promise.all([
      admin.from("diagnosis_results").select("*").eq("user_email", targetEmail).or("diagnosis_type.is.null,diagnosis_type.eq.pre").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("diagnosis_results").select("*").eq("user_email", targetEmail).eq("diagnosis_type", "post").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("mileage_entries").select("id, content, category, created_at").eq("user_email", targetEmail).order("created_at", { ascending: false }),
      admin.from("reflection_drafts").select("goal_achievement_text, reflection_text").eq("user_email", targetEmail).maybeSingle(),
      admin.from("user_preferences").select("pref_value").eq("user_email", targetEmail).eq("pref_key", "reflection_evidence_text").maybeSingle(),
      admin.from("user_preferences").select("pref_value").eq("user_email", targetEmail).eq("pref_key", "reflection_next_year_goal").maybeSingle(),
    ]);

    return NextResponse.json({
      ok: true,
      email: targetEmail,
      name: teacher.user_metadata?.name ?? "",
      schoolName: teacherSchool,
      preResult: preData ?? null,
      postResult: postData ?? null,
      mileageEntries: mileageData ?? [],
      goalAchievementText: (draftRow?.goal_achievement_text as string) ?? "",
      reflectionText: (draftRow?.reflection_text as string) ?? "",
      evidenceText: evidenceRow?.pref_value != null ? String(evidenceRow.pref_value) : "",
      nextYearGoalText: nextYearRow?.pref_value != null ? String(nextYearRow.pref_value) : "",
    });
  } catch (error) {
    console.error("result-report-by-email error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
