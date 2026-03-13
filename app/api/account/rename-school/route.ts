import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/**
 * 관리자가 개인정보에서 학교명을 변경할 때 호출.
 * 기존 학교명(old)으로 된 학교별 세팅(영역/포인트, 사전사후검사)을 새 학교명으로 옮기고,
 * 해당 학교 소속 모든 사용자의 user_metadata.schoolName을 새 이름으로 통일합니다.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin") return NextResponse.json({ error: "관리자만 학교명 변경이 가능합니다." }, { status: 403 });

    const oldSchoolName = (meta.schoolName ?? "").trim();
    const body = await req.json().catch(() => ({}));
    const newSchoolName = (body?.newSchoolName as string)?.trim() ?? "";
    if (!newSchoolName) return NextResponse.json({ error: "새 학교명이 필요합니다." }, { status: 400 });
    if (oldSchoolName === newSchoolName) return NextResponse.json({ ok: true, renamed: false });

    // 1) school_point_settings: 기존 행 복사 후 새 school_name으로 삽입, 기존 행 삭제
    const { data: pointRow } = await supabase
      .from("school_point_settings")
      .select("settings_json, updated_at")
      .eq("school_name", oldSchoolName)
      .maybeSingle();
    if (pointRow) {
      await supabase.from("school_point_settings").upsert({
        school_name: newSchoolName,
        settings_json: pointRow.settings_json,
        updated_at: new Date().toISOString(),
      }, { onConflict: "school_name" });
      await supabase.from("school_point_settings").delete().eq("school_name", oldSchoolName);
    }

    // 2) school_diagnosis_settings: 동일하게 복사 후 삭제
    const { data: diagRow } = await supabase
      .from("school_diagnosis_settings")
      .select("domains_json, updated_at")
      .eq("school_name", oldSchoolName)
      .maybeSingle();
    if (diagRow) {
      await supabase.from("school_diagnosis_settings").upsert({
        school_name: newSchoolName,
        domains_json: diagRow.domains_json,
        updated_at: new Date().toISOString(),
      }, { onConflict: "school_name" });
      await supabase.from("school_diagnosis_settings").delete().eq("school_name", oldSchoolName);
    }

    // 3) 해당 학교 소속 모든 사용자 user_metadata.schoolName 을 새 이름으로 변경
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!listError && listData?.users) {
      for (const u of listData.users) {
        const uMeta = (u.user_metadata ?? {}) as { schoolName?: string };
        if ((uMeta.schoolName ?? "").trim() !== oldSchoolName) continue;
        const nextMeta = { ...u.user_metadata, schoolName: newSchoolName } as Record<string, unknown>;
        await supabase.auth.admin.updateUserById(u.id, { user_metadata: nextMeta });
      }
    }

    return NextResponse.json({ ok: true, renamed: true });
  } catch (e) {
    console.error("account/rename-school:", e);
    return NextResponse.json({ error: "학교명 변경 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
