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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 토큰으로 사용자 확인
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // 이미 프로필이 완성된 사용자는 업데이트 불가
    const existingMetadata = user.user_metadata as { role?: string } | undefined;
    if (existingMetadata?.role) {
      return NextResponse.json({ error: "Profile already completed" }, { status: 400 });
    }

    const { role, name, schoolName, gradeClass } = await req.json();

    if (!role || !name || !schoolName) {
      return NextResponse.json(
        { error: "role, name, and schoolName are required" },
        { status: 400 }
      );
    }

    if (role !== "teacher" && role !== "admin") {
      return NextResponse.json(
        { error: "role must be 'teacher' or 'admin'" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 관리자 역할인 경우: 학교별 최대 3명 제한 (서버 검증)
    const MAX_ADMINS_PER_SCHOOL = 3;
    if (role === "admin") {
      const trimmedSchool = (schoolName as string)?.trim() ?? "";
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (!listError && listData?.users) {
        const users = listData.users as Array<{ user_metadata?: { role?: string; schoolName?: string } }>;
        const adminCount = users.filter(
          (u) =>
            (u.user_metadata?.role ?? "") === "admin" &&
            (u.user_metadata?.schoolName ?? "").trim() === trimmedSchool
        ).length;
        if (adminCount >= MAX_ADMINS_PER_SCHOOL) {
          return NextResponse.json(
            { error: "해당 학교는 관리자가 3명으로 이미 만원입니다." },
            { status: 403 }
          );
        }
      }
    }

    // Admin API로 user_metadata 업데이트
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        role,
        name: name.trim(),
        schoolName: schoolName.trim(),
        gradeClass: gradeClass?.trim() || "",
      },
    });

    if (updateError) {
      console.error("Update user metadata error:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Complete profile error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
