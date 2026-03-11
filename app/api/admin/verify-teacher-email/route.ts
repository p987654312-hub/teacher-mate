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
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email이 필요합니다." }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return NextResponse.json({ error: "email이 필요합니다." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller }, error: callerError } = await supabaseAuth.auth.getUser(token);
    if (callerError || !caller) {
      return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
    }

    const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !meta.schoolName) {
      return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    type ListedUser = { id: string; email?: string; user_metadata?: { role?: string; schoolName?: string; name?: string } };

    const findByEmail = async (): Promise<ListedUser | undefined> => {
      const perPage = 1000;
      const maxPages = 200;

      // Supabase 프로젝트/버전에 따라 page가 0-base/1-base로 동작하는 차이가 보고되어
      // 1-base(1..N) 먼저, 실패하면 0-base(0..N-1)로 한 번 더 찾습니다.
      const tryRanges: Array<{ start: number; label: string }> = [
        { start: 1, label: "one-based" },
        { start: 0, label: "zero-based" },
      ];

      for (const { start } of tryRanges) {
        for (let i = 0; i < maxPages; i++) {
          const page = start + i;
          const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
          if (listError) {
            console.error("verify-teacher-email listUsers error:", listError);
            break;
          }
          const users = (listData?.users ?? []) as ListedUser[];
          if (users.length === 0) break;
          const found = users.find((u) => (u.email ?? "").trim().toLowerCase() === normalizedEmail);
          if (found) return found;
          if (users.length < perPage) break; // last page
        }
      }
      return undefined;
    };

    const target = await findByEmail();
    if (!target) {
      return NextResponse.json({ error: "해당 교원을 찾을 수 없습니다." }, { status: 404 });
    }

    const rawRole = (target.user_metadata as any)?.role;
    const roleNorm = Array.isArray(rawRole)
      ? rawRole.map((r) => String(r)).join(",").toLowerCase()
      : String(rawRole ?? "").trim().toLowerCase();
    const isTeacherRole = roleNorm.includes("teacher");
    const isAdminRole = roleNorm.includes("admin");
    // 관리자도 교원 권한을 가집니다.
    if (roleNorm && !(isTeacherRole || isAdminRole)) {
      return NextResponse.json({ error: "해당 계정은 교원 계정이 아닙니다." }, { status: 400 });
    }

    const teacherSchool = (target.user_metadata?.schoolName ?? "").trim();
    if (teacherSchool !== (meta.schoolName ?? "").trim()) {
      return NextResponse.json({ error: "같은 학교 소속만 조회할 수 있습니다." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      email: target.email,
      name: target.user_metadata?.name ?? "",
      schoolName: teacherSchool,
    });
  } catch (error) {
    console.error("verify-teacher-email error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
