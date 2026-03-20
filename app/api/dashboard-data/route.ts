import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 교사/관리자 대시보드용 데이터를 한 번에 반환 (클라이언트 요청 1회로 체감 속도 개선) */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) {
      return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });
    }

    const email = user.email;
    const origin = new URL(req.url).origin;
    const auth = { Authorization: `Bearer ${token}` };

    const [
      preRes,
      postRes,
      planRes,
      mileageRes,
      catRes,
      diagnosisSettingsRes,
      diffRes,
      pointsRes,
    ] = await Promise.all([
      supabase
        .from("diagnosis_results")
        .select("domain1,domain2,domain3,domain4,domain5,domain6,total_score,category_scores")
        .eq("user_email", email)
        .or("diagnosis_type.is.null,diagnosis_type.eq.pre")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("diagnosis_results")
        .select("id")
        .eq("user_email", email)
        .eq("diagnosis_type", "post")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("development_plans")
        .select("development_goal, expected_outcome, training_plans, education_plans, book_plans, expense_requests, community_plans, other_plans, annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, education_annual_goal_unit, other_annual_goal")
        .eq("user_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("mileage_entries").select("content, category").eq("user_email", email),
      fetch(`${origin}/api/school-category-settings`, { headers: auth }).then((r) => (r.ok ? r.json() : { categories: null })).catch(() => ({ categories: null })),
      fetch(`${origin}/api/diagnosis-settings`, { headers: { ...auth }, cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(`${origin}/api/mileage-relative-difficulty`, { method: "POST", headers: { "Content-Type": "application/json", ...auth } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${origin}/api/points/me`, { headers: auth }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    return NextResponse.json({
      preRes: { data: preRes.data, error: preRes.error },
      postRes: { data: postRes.data, error: postRes.error },
      planRes: { data: planRes.data, error: planRes.error },
      mileageRes: { data: mileageRes.data ?? [], error: mileageRes.error },
      categories: (catRes as { categories?: unknown }).categories ?? null,
      diagnosisSettings: diagnosisSettingsRes,
      relativeDifficulty: diffRes,
      points: pointsRes,
    });
  } catch (e) {
    console.error("dashboard-data:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
