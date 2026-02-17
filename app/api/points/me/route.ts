import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseValueFromContent } from "@/lib/mileageProgress";
import { parseStored } from "@/app/api/points/school-settings/route";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const email = user.email;
    const meta = (user.user_metadata ?? {}) as { schoolName?: string };
    const schoolName = (meta.schoolName ?? "").trim();

    const { data: pointsRow } = await supabase.from("user_points").select("base_points, login_points").eq("user_email", email).maybeSingle();
    const base = (pointsRow?.base_points ?? 100) as number;
    const login = (pointsRow?.login_points ?? 0) as number;

    type MileageBreakdownItem = {
      key: string;
      label: string;
      unit: string;
      sum: number;
      pointPerUnit: number;
      points: number;
    };

    let mileage = 0;
    let mileageBreakdown: MileageBreakdownItem[] = [];
    if (schoolName) {
      const [settingsRes, entriesRes, planRes] = await Promise.all([
        supabase.from("school_point_settings").select("settings_json").eq("school_name", schoolName).maybeSingle(),
        supabase.from("mileage_entries").select("content, category").eq("user_email", email),
        supabase.from("development_plans").select("education_annual_goal_unit").eq("user_email", email).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const { points: settings, categories } = parseStored(settingsRes.data);
      const unitByKey: Record<string, string> = {};
      const labelByKey: Record<string, string> = {};
      categories.forEach((c) => {
        unitByKey[c.key] = c.unit;
        labelByKey[c.key] = c.label;
      });
      const healthGoalUnit = (planRes.data?.education_annual_goal_unit === "거리" ? "거리" : "시간") as "시간" | "거리";

      const sumByKey: Record<string, number> = {};
      (entriesRes.data ?? []).forEach((e: { content: string; category: string }) => {
        const unit = unitByKey[e.category];
        const value = parseValueFromContent(e.content, e.category, healthGoalUnit, unit);
        sumByKey[e.category] = (sumByKey[e.category] ?? 0) + value;
      });

      mileageBreakdown = categories.map((c) => {
        const sum = sumByKey[c.key] ?? 0;
        const pointPerUnit = settings[c.key] ?? 0;
        const points = Math.round(sum * pointPerUnit);
        return {
          key: c.key,
          label: labelByKey[c.key] ?? c.label,
          unit: unitByKey[c.key] ?? c.unit,
          sum,
          pointPerUnit,
          points,
        };
      });
      mileage = mileageBreakdown.reduce((acc, item) => acc + (item.points ?? 0), 0);
    }

    const total = base + login + mileage;
    return NextResponse.json({
      total,
      base,
      login,
      mileage,
      mileageBreakdown,
    });
  } catch (e) {
    console.error("points/me:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
