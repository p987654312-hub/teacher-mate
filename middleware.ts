import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminStanding } from "@/lib/adminAccess";

const ADMIN_API = [
  "/api/points/school-settings",
  "/api/ai-prompt-settings",
  "/api/account/rename-school",
];

function isGuardedPath(pathname: string): boolean {
  if (pathname === "/api/admin/verify-code") return false;
  if (pathname.startsWith("/api/admin/")) return true;
  return ADMIN_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 만료된 임시 관리자는 교사로 되돌리고 관리자 API를 막는다.
 * 예상 밖 오류는 통과시켜 상설 관리자 화면이 함께 멈추지 않게 한다.
 */
export async function middleware(request: NextRequest) {
  if (!isGuardedPath(request.nextUrl.pathname)) return NextResponse.next();

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.next();

  try {
    const admin = createClient(url, serviceKey);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return NextResponse.next();

    if (adminStanding(data.user.user_metadata as { role?: string; adminExpiresAt?: string | null }) !== "expired") {
      return NextResponse.next();
    }

    await admin.auth.admin.updateUserById(data.user.id, {
      user_metadata: {
        role: "teacher",
        adminExpiresAt: null,
        adminGrantedBy: null,
        adminGrantedAt: null,
      },
    });

    return NextResponse.json(
      { error: "임시 관리자 권한이 만료되어 교사 권한으로 돌아갔습니다.", expired: true, role: "teacher" },
      { status: 403 }
    );
  } catch (error) {
    console.error("temporary admin expiry check:", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/api/admin/:path*",
    "/api/points/school-settings",
    "/api/points/school-settings/:path*",
    "/api/ai-prompt-settings",
    "/api/account/rename-school",
  ],
};
