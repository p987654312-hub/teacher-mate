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
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = bearer ?? req.headers.get("x-supabase-auth") ?? null;
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : undefined,
    );
    const { data, error } = await anon.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const user = data.user;
    const email = user.email;
    const admin = getSupabaseAdmin();
    if (email) {
      await admin.from("diagnosis_results").delete().eq("user_email", email);
      await admin.from("development_plans").delete().eq("user_email", email);
      await admin.from("mileage_entries").delete().eq("user_email", email);
      await admin.from("reflection_drafts").delete().eq("user_email", email);
      await admin.from("user_points").delete().eq("user_email", email);
      await admin.from("user_preferences").delete().eq("user_email", email);
    }
    await admin.auth.admin.deleteUser(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("account/delete POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

