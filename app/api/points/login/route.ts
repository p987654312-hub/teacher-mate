import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseStored } from "../school-settings/route";

const LOGIN_POINTS_PER_DEFAULT = 2;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 로그인 시 설정된 점수 추가, 하루 1회만 (같은 날 재로그인 시 추가 점수 없음) */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const today = new Date().toISOString().slice(0, 10);

    const { data: row } = await supabase
      .from("user_points")
      .select("base_points, login_points, last_login_date, login_points_that_day")
      .eq("user_email", user.email)
      .maybeSingle();

    let loginPoints = (row?.login_points ?? 0) as number;
    const lastDate = row?.last_login_date as string | null;

    // 같은 날 이미 로그인했으면 추가 점수 없음
    if (lastDate === today) {
      return NextResponse.json({
        added: 0,
        login_points: loginPoints,
        message: undefined,
      });
    }

    // 학교별 로그인 포인트 설정 가져오기
    const meta = (user.user_metadata ?? {}) as { schoolName?: string };
    const schoolName = (meta.schoolName ?? "").trim();
    let loginPointsPer = LOGIN_POINTS_PER_DEFAULT;
    
    if (schoolName) {
      const { data: settingsRow } = await supabase
        .from("school_point_settings")
        .select("settings_json")
        .eq("school_name", schoolName)
        .maybeSingle();
      
      if (settingsRow) {
        const { points } = parseStored(settingsRow);
        loginPointsPer = typeof points.login_points === "number" && points.login_points >= 0 ? points.login_points : LOGIN_POINTS_PER_DEFAULT;
      }
    }

    // 새로운 날 첫 로그인: 설정된 점수 추가
    const toAdd = loginPointsPer;
    loginPoints += toAdd;

    const { error: upsertError } = await supabase.from("user_points").upsert(
      {
        user_email: user.email,
        base_points: row?.base_points ?? 100,
        login_points: loginPoints,
        last_login_date: today,
        login_points_that_day: loginPointsPer, // 하루 1회이므로 설정된 점수
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_email" }
    );

    if (upsertError) {
      console.error("points/login:", upsertError);
      return NextResponse.json({ error: "포인트 반영에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      added: toAdd,
      login_points: loginPoints,
      message: toAdd > 0 ? `열정 포인트 +${toAdd}점 획득` : undefined,
    });
  } catch (e) {
    console.error("points/login:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
