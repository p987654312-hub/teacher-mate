import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PLAN_GOAL_KEYS: Record<string, string> = {
  community: "community_annual_goal",
  book_edutech: "book_annual_goal",
  health: "education_annual_goal",
  other: "other_annual_goal",
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

/** 같은 학교 멤버 목표값으로 3그룹(쉬움/보통/어려움). 0~1명→쉬움, 2~5명→보통, 6명 이상→tertile */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });
    }

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "teacher") {
      return NextResponse.json({ error: "교사만 이용할 수 있습니다." }, { status: 403 });
    }

    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) {
      return NextResponse.json({ community: 2, book_edutech: 2, health: 2, other: 2 });
    }

    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) {
      console.error("mileage-relative-difficulty listUsers:", listError);
      return NextResponse.json({ community: 2, book_edutech: 2, health: 2, other: 2 });
    }

    const users = (listData?.users ?? []) as Array<{
      email?: string;
      user_metadata?: { role?: string; schoolName?: string };
    }>;
    const sameSchool = users.filter(
      (u) => u.user_metadata?.role === "teacher" && (u.user_metadata?.schoolName ?? "") === schoolName
    );

    const n = sameSchool.length;
    if (n <= 1) {
      return NextResponse.json({ community: 1, book_edutech: 1, health: 1, other: 1 });
    }
    if (n <= 5) {
      return NextResponse.json({ community: 2, book_edutech: 2, health: 2, other: 2 });
    }

    const goalKeys = ["community", "book_edutech", "health", "other"] as const;
    const plansByEmail: Record<string, Record<string, number>> = {};

    for (const t of sameSchool) {
      const email = t.email ?? "";
      const { data: plan } = await supabase
        .from("development_plans")
        .select("community_annual_goal, book_annual_goal, education_annual_goal, other_annual_goal")
        .eq("user_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const row = plan as Record<string, unknown> | null;
      plansByEmail[email] = {};
      goalKeys.forEach((key) => {
        const col = PLAN_GOAL_KEYS[key];
        const raw = String(row?.[col] ?? "").trim();
        plansByEmail[email][key] = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
      });
    }

    const currentEmail = user.email ?? "";
    const currentGoals = plansByEmail[currentEmail] ?? { community: 0, book_edutech: 0, health: 0, other: 0 };

    const result: Record<string, 1 | 2 | 3> = {};

    for (const key of goalKeys) {
      const withEmail = sameSchool
        .map((t) => ({ email: t.email ?? "", value: plansByEmail[t.email ?? ""]?.[key] ?? 0 }))
        .sort((a, b) => a.value !== b.value ? a.value - b.value : a.email.localeCompare(b.email));
      if (withEmail.length === 0) {
        result[key] = 2;
        continue;
      }
      const pos = withEmail.findIndex((x) => x.email === currentEmail);
      const rank = pos >= 0 ? pos : withEmail.length;
      const third = Math.max(1, Math.floor(withEmail.length / 3));
      if (rank < third) result[key] = 1;
      else if (rank < 2 * third) result[key] = 2;
      else result[key] = 3;
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("mileage-relative-difficulty:", e);
    return NextResponse.json(
      { community: 2, book_edutech: 2, health: 2, other: 2 }
    );
  }
}
