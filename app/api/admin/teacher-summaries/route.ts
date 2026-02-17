import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeMileageProgress, parseValueFromContent } from "@/lib/mileageProgress";
import { parseStored } from "@/app/api/points/school-settings/route";
import {
  getTrainingDifficultyLevel,
  getClassOpenDifficultyLevel,
  getDifficultyStars,
  getRelativeDifficultyStars,
} from "@/lib/mileageDifficulty";

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
  education_annual_goal_unit?: string | null;
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
      user_metadata?: { role?: string; schoolName?: string; name?: string; gradeClass?: string; schoolLevel?: string };
      created_at?: string;
    }>;

    const teachers = users.filter((u) => {
      const meta = u.user_metadata ?? {};
      // 관리자도 교원 권한을 가지므로 교원 목록에 포함
      return (meta.role === "teacher" || meta.role === "admin") && (meta.schoolName ?? "") === schoolName;
    });

    const { data: settingsRow } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();
    const parsedSettings = parseStored(settingsRow);
    const schoolCategories = parsedSettings.categories;
    const pointSettings = parsedSettings.points ?? {};
    const unitByKey: Record<string, string> = {};
    schoolCategories.forEach((c) => {
      unitByKey[c.key] = c.unit;
    });

    const result = await Promise.all(
      teachers.map(async (t) => {
        const email = t.email ?? "";
        // 사용자의 provider 정보 확인 (구글 로그인 여부)
        // listUsers는 identities를 포함하지 않을 수 있으므로 getUserById로 확인
        let isGoogleOnly = false;
        try {
          const { data: userDetail, error: userError } = await supabase.auth.admin.getUserById(t.id);
          if (!userError && userDetail?.user) {
            const identities = (userDetail.user as any)?.identities as Array<{ provider: string }> | undefined;
            const hasOAuthProvider = identities?.some((id) => id.provider === "google" || id.provider === "oauth");
            const hasEmailPassword = identities?.some((id) => id.provider === "email");
            isGoogleOnly = hasOAuthProvider && !hasEmailPassword;
          }
        } catch (err) {
          console.error(`Error fetching user ${t.id} identities:`, err);
        }
        
        const [preRes, postRes, planRes, mileageRes, reflectionRes, pointsRes] = await Promise.all([
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
            .select("development_goal, expected_outcome, training_plans, education_plans, book_plans, expense_requests, community_plans, other_plans, annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, education_annual_goal_unit, other_annual_goal")
            .eq("user_email", email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from("mileage_entries").select("id, content, category").eq("user_email", email),
          supabase.from("reflection_drafts").select("id").eq("user_email", email).limit(1).maybeSingle(),
          supabase.from("user_points").select("base_points, login_points").eq("user_email", email).maybeSingle(),
        ]);

        const planRow = planRes.data as PlanRow | null;
        const planFilledRatio = planRow ? getPlanFillRatio(planRow) : 0;
        const planCompleted = planFilledRatio >= 0.7;

        const planGoals: Record<string, number> = {};
        MILEAGE_CATEGORIES.forEach((c) => {
          const key = PLAN_GOAL_KEYS[c.key];
          const raw = String(planRow?.[key as keyof PlanRow] ?? "").trim();
          planGoals[c.key] = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
        });
        const healthGoalUnit = (planRow?.education_annual_goal_unit === "거리" ? "거리" : "시간") as "시간" | "거리";
        const { categories: categoriesWithGoal, overallProgress } = computeMileageProgress(
          (mileageRes.data ?? []) as { content: string; category: string }[],
          planGoals,
          healthGoalUnit,
          schoolCategories
        );

        // 개인 포인트(마일리지 총점) 계산: 기본/로그인 + 마일리지(학교 설정 단위당 포인트)
        const sumByKey: Record<string, number> = {};
        (mileageRes.data ?? []).forEach((e: { content: string; category: string }) => {
          const unit = unitByKey[e.category];
          const value = parseValueFromContent(e.content, e.category, healthGoalUnit, unit);
          sumByKey[e.category] = (sumByKey[e.category] ?? 0) + value;
        });
        let mileagePoints = 0;
        schoolCategories.forEach((c) => {
          const sum = sumByKey[c.key] ?? 0;
          const ppu = pointSettings[c.key] ?? 0;
          mileagePoints += Math.round(sum * ppu);
        });
        const basePoints = (pointsRes.data?.base_points ?? 100) as number;
        const loginPoints = (pointsRes.data?.login_points ?? 0) as number;
        const totalPoints = Math.round(basePoints + loginPoints + mileagePoints);

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
          mileageSummary: { overallProgress, categories: categoriesWithGoal },
          totalPoints,
          planGoals,
          isGoogleOnly, // 구글 로그인만 사용하는 경우
        };
      })
    );

    const goalKeysRel = ["community", "book_edutech", "health", "other"] as const;
    const goalsByEmail: Record<string, Record<string, number>> = {};
    result.forEach((r) => {
      goalsByEmail[r.email] = (r as { planGoals?: Record<string, number> }).planGoals ?? {};
    });
    const n = result.length;
    const relativeByEmail: Record<string, Record<string, 1 | 2 | 3>> = {};
    result.forEach((r) => {
      relativeByEmail[r.email] = {};
      goalKeysRel.forEach((key) => {
        if (n <= 1) relativeByEmail[r.email][key] = 1;
        else if (n <= 5) relativeByEmail[r.email][key] = 2;
        else {
          const values = result
            .map((t) => goalsByEmail[t.email]?.[key] ?? 0)
            .sort((a, b) => a - b);
          const current = goalsByEmail[r.email]?.[key] ?? 0;
          const pos = values.indexOf(current);
          const rank = pos >= 0 ? pos : values.length;
          const third = Math.max(1, Math.floor(values.length / 3));
          if (rank < third) relativeByEmail[r.email][key] = 1;
          else if (rank < 2 * third) relativeByEmail[r.email][key] = 2;
          else relativeByEmail[r.email][key] = 3;
        }
      });
    });

    const teachersOut = result.map((r) => {
      const rel = relativeByEmail[r.email] ?? {};
      const categories = (r.mileageSummary.categories as { key: string; label: string; progress: number; sum: number; goal: number; unit: string }[]).map((c) => {
        const goal = c.goal ?? 0;
        let difficultyStars: string;
        if (c.key === "training") difficultyStars = getDifficultyStars(getTrainingDifficultyLevel(goal));
        else if (c.key === "class_open") difficultyStars = getDifficultyStars(getClassOpenDifficultyLevel(goal));
        else difficultyStars = getRelativeDifficultyStars(rel[c.key] ?? 2);
        return { key: c.key, label: c.label, progress: c.progress, sum: c.sum ?? 0, goal: c.goal ?? 0, unit: c.unit ?? "", difficultyStars };
      });
      const { planGoals: _pg, ...rest } = r as { planGoals?: Record<string, number> };
      return { ...rest, mileageSummary: { overallProgress: r.mileageSummary.overallProgress, categories } };
    });

    return NextResponse.json({ teachers: teachersOut });
  } catch (error) {
    console.error("teacher-summaries error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
