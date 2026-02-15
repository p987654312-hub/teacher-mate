import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 이 코드는 서버에서만 실행됩니다. 서비스 롤 키는 브라우저로 절대 보내지지 않습니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: Request) {
  try {
    const { schoolName } = await req.json();

    if (!schoolName) {
      return NextResponse.json(
        { error: "schoolName is required" },
        { status: 400 }
      );
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
          (metadata.schoolName ?? "") === schoolName
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

