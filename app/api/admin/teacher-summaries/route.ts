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

type PlanRow = {
  development_goal?: string | null;
  expected_outcome?: string | null;
  training_plans?: Array<{ name?: string; period?: string; duration?: string; remarks?: string }> | null;
  education_plans?: Array<{ area?: string; period?: string; duration?: string; remarks?: string }> | null;
  book_plans?: Array<{ title?: string; period?: string; method?: string }> | null;
  expense_requests?: Array<{ activity?: string; period?: string; method?: string; remarks?: string }> | null;
  community_plans?: Array<{ activity?: string; period?: string; method?: string; remarks?: string }> | null;
  other_plans?: Array<{ text?: string }> | null;
  annual_goal?: string | null;
  expense_annual_goal?: string | null;
  community_annual_goal?: string | null;
  book_annual_goal?: string | null;
  education_annual_goal?: string | null;
  other_annual_goal?: string | null;
};

function getPlanFillRatio(row: PlanRow): number {
  let total = 0;
  let filled = 0;
  const count = (v: string | null | undefined) => {
    total += 1;
    if ((v ?? "").trim() !== "") filled += 1;
  };
  count(row.development_goal ?? "");
  count(row.expected_outcome ?? "");
  (row.training_plans ?? []).forEach((r) => {
    count(r.name); count(r.period); count(r.duration); count(r.remarks);
  });
  (row.education_plans ?? []).forEach((r) => {
    count(r.area); count(r.period); count(r.duration); count(r.remarks);
  });
  (row.book_plans ?? []).forEach((r) => {
    count(r.title); count(r.period); count(r.method);
  });
  (row.expense_requests ?? []).forEach((r) => {
    count(r.activity); count(r.period); count(r.method); count(r.remarks);
  });
  (row.community_plans ?? []).forEach((r) => {
    count(r.activity); count(r.period); count(r.method); count(r.remarks);
  });
  (row.other_plans ?? []).forEach((r) => count(r.text));
  return total > 0 ? filled / total : 0;
}

const MILEAGE_CATEGORIES = [
  { key: "training", label: "연수(직무·자율)" },
  { key: "class_open", label: "수업 공개" },
  { key: "community", label: "교원학습 공동체" },
  { key: "book_edutech", label: "전문 서적/에듀테크" },
  { key: "health", label: "건강/체력" },
  { key: "other", label: "기타 계획" },
] as const;

const PLAN_GOAL_KEYS: Record<string, string> = {
  training: "annual_goal",
  class_open: "expense_annual_goal",
  community: "community_annual_goal",
  book_edutech: "book_annual_goal",
  health: "education_annual_goal",
  other: "other_annual_goal",
};

export async function POST(req: Request) {
  try {
    const { schoolName } = await req.json();
    if (!schoolName) {
      return NextResponse.json({ error: "schoolName is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) {
      console.error("Error listing users:", listError);
      return NextResponse.json({ error: "교원 목록을 불러올 수 없습니다." }, { status: 500 });
    }

    const users = (listData?.users ?? []) as Array<{
      id: string;
      email?: string;
      user_metadata?: { role?: string; schoolName?: string; name?: string };
      created_at?: string;
    }>;

    const teachers = users.filter((u) => {
      const meta = u.user_metadata ?? {};
      return meta.role === "teacher" && (meta.schoolName ?? "") === schoolName;
    });

    const result = await Promise.all(
      teachers.map(async (t) => {
        const email = t.email ?? "";
        const [preRes, postRes, planRes, mileageRes, reflectionRes] = await Promise.all([
          supabase
            .from("diagnosis_results")
            .select("id")
            .eq("user_email", email)
            .or("diagnosis_type.is.null,diagnosis_type.eq.pre")
            .limit(1)
            .maybeSingle(),
          supabase
            .from("diagnosis_results")
            .select("id")
            .eq("user_email", email)
            .eq("diagnosis_type", "post")
            .limit(1)
            .maybeSingle(),
          supabase
            .from("development_plans")
            .select("development_goal, expected_outcome, training_plans, education_plans, book_plans, expense_requests, community_plans, other_plans, annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, other_annual_goal")
            .eq("user_email", email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from("mileage_entries").select("category").eq("user_email", email),
          supabase.from("reflection_drafts").select("id").eq("user_email", email).limit(1).maybeSingle(),
        ]);

        const planRow = planRes.data as PlanRow | null;
        const planFilledRatio = planRow ? getPlanFillRatio(planRow) : 0;
        const planCompleted = planFilledRatio >= 0.7;

        const countByCategory: Record<string, number> = {};
        MILEAGE_CATEGORIES.forEach((c) => {
          countByCategory[c.key] = 0;
        });
        (mileageRes.data ?? []).forEach((r: { category?: string }) => {
          const k = r.category;
          if (k && countByCategory[k] !== undefined) countByCategory[k] += 1;
        });

        const categories = MILEAGE_CATEGORIES.map((c) => {
          const goalKey = PLAN_GOAL_KEYS[c.key];
          const goalRaw = String(planRow?.[goalKey as keyof PlanRow] ?? "").trim();
          const goalNum = parseFloat(goalRaw.replace(/[^\d.]/g, "")) || 0;
          const progress = goalNum > 0 ? Math.min(100, (countByCategory[c.key] / goalNum) * 100) : 0;
          return { key: c.key, label: c.label, progress };
        });
        const overallProgress =
          categories.length > 0
            ? Math.min(100, Math.round(categories.reduce((a, c) => a + c.progress, 0) / categories.length))
            : 0;

        return {
          id: t.id,
          email,
          name: (t.user_metadata?.name as string) ?? "",
          schoolName: (t.user_metadata?.schoolName as string) ?? schoolName,
          createdAt: t.created_at ?? "",
          gradeClass: (t.user_metadata?.gradeClass ?? t.user_metadata?.schoolLevel) ?? "",
          hasPreDiagnosis: !!preRes.data,
          hasPostDiagnosis: !!postRes.data,
          planCompleted,
          reflectionDone: !!reflectionRes.data,
          mileageSummary: { overallProgress, categories },
        };
      })
    );

    return NextResponse.json({ teachers: result });
  } catch (error) {
    console.error("teacher-summaries error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
