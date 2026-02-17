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

    // Admin API로 user_metadata 업데이트
    const supabaseAdmin = getSupabaseAdmin();
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
