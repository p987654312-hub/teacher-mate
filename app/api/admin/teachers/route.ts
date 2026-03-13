import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 빌드 시점에는 env가 없을 수 있으므로 요청 시점에만 클라이언트 생성 (서버 전용, 서비스 롤 키는 브라우저로 노출되지 않음)
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

    const body = await req.json();
    const schoolName = body?.schoolName;
    if (!schoolName || typeof schoolName !== "string") {
      return NextResponse.json(
        { error: "schoolName is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !caller) {
      return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 });
    }

    const meta = (caller.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin" || !meta.schoolName) {
      return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
    }
    const callerSchool = (meta.schoolName ?? "").trim();
    if (callerSchool !== (schoolName as string).trim()) {
      return NextResponse.json({ error: "본인 소속 학교만 조회할 수 있습니다." }, { status: 403 });
    }

    // auth.users 테이블은 Admin API를 통해 조회합니다.
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) {
      console.error("Error fetching teachers (admin.listUsers):", error);
      return NextResponse.json(
        { error: "교원 목록을 불러오는 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    const users = (data?.users ?? []) as any[];

    const teachers = users
      .filter((user) => {
        const metadata = (user.user_metadata ||
          user.user_metadata ||
          {}) as {
          role?: string;
          schoolName?: string;
        };
        return (
          metadata.role === "teacher" &&
          (metadata.schoolName ?? "").trim() === callerSchool
        );
      })
      .map((user) => ({
        id: user.id as string,
        email: user.email as string,
        name:
          ((user.user_metadata as any)?.name as string | undefined) ?? "",
        schoolName:
          ((user.user_metadata as any)?.schoolName as string | undefined) ??
          schoolName,
        createdAt: user.created_at as string,
      }));

    return NextResponse.json({ teachers });
  } catch (error) {
    console.error("Unexpected error in /api/admin/teachers:", error);
    return NextResponse.json(
      { error: "알 수 없는 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

