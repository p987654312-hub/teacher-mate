import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const category = String(body?.category ?? "").trim();
    if (!email) {
      return NextResponse.json({ error: "email이 필요합니다." }, { status: 400 });
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

    const query = supabase
      .from("mileage_entries")
      .select("id, content, category, created_at")
      .eq("user_email", email)
      .order("created_at", { ascending: false });

    const { data, error } = category ? await query.eq("category", category) : await query;
    if (error) {
      console.error("admin/mileage-by-email:", error);
      return NextResponse.json({ error: "기록을 불러오는 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (e) {
    console.error("admin/mileage-by-email:", e);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

