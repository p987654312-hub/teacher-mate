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
    const { schoolName } = await req.json();
    if (!schoolName || typeof schoolName !== "string") {
      return NextResponse.json({ error: "schoolName is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) {
      console.error("count-by-school listUsers error:", error);
      return NextResponse.json({ error: "조회에 실패했습니다." }, { status: 500 });
    }

    const users = (data?.users ?? []) as Array<{ user_metadata?: { role?: string; schoolName?: string } }>;
    const trimmed = schoolName.trim();
    const adminCount = users.filter(
      (u) => (u.user_metadata?.role ?? "") === "admin" && (u.user_metadata?.schoolName ?? "").trim() === trimmed
    ).length;

    return NextResponse.json({ adminCount });
  } catch (error) {
    console.error("count-by-school error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
