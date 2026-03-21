import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { invalidateAiProviderCache, type AiBackend } from "@/lib/aiGemini";

const SETTINGS_KEY = "ai_provider";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

function isSuperAdminEmail(email: string | undefined): boolean {
  const allowed = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

/** 슈퍼관리자만: 현재 AI 백엔드(vertex / gemini) 조회·변경 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    if (!isSuperAdminEmail(user.email)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const { data: row, error: readError } = await supabase
      .from("app_global_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (readError) {
      console.error("admin/ai-provider read:", readError);
      return NextResponse.json({ provider: "vertex" as AiBackend, warning: "app_global_settings 테이블을 아직 만들지 않았을 수 있습니다. supabase/app_global_settings.sql을 실행하세요." });
    }
    const raw = (row?.value as string | undefined)?.trim();
    const provider: AiBackend = raw === "gemini" ? "gemini" : "vertex";

    return NextResponse.json({ provider });
  } catch (e) {
    console.error("admin/ai-provider GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    if (!isSuperAdminEmail(user.email)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const next = body?.provider as string | undefined;
    if (next !== "vertex" && next !== "gemini") {
      return NextResponse.json({ error: "provider는 vertex 또는 gemini 여야 합니다." }, { status: 400 });
    }

    const { error } = await supabase.from("app_global_settings").upsert(
      {
        key: SETTINGS_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      console.error("admin/ai-provider upsert:", error);
      return NextResponse.json(
        { error: "저장에 실패했습니다. Supabase에 app_global_settings 테이블이 있는지 확인하세요." },
        { status: 500 }
      );
    }

    invalidateAiProviderCache();
    return NextResponse.json({ ok: true, provider: next });
  } catch (e) {
    console.error("admin/ai-provider POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
