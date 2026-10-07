import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminStanding, isPermanentAdmin } from "@/lib/adminAccess";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

type ListedUser = {
  id: string;
  email?: string;
  user_metadata?: {
    role?: string;
    schoolName?: string;
    name?: string;
    gradeClass?: string;
    subject?: string;
    schoolLevel?: string;
    adminExpiresAt?: string | null;
    adminGrantedBy?: string | null;
    adminGrantedAt?: string | null;
  };
};

async function listAllUsers(admin: SupabaseClient): Promise<ListedUser[]> {
  const perPage = 1000;
  for (const start of [1, 0]) {
    const batch: ListedUser[] = [];
    for (let i = 0; i < 30; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: start + i, perPage });
      if (error) throw error;
      const users = (data?.users ?? []) as ListedUser[];
      if (users.length === 0) break;
      batch.push(...users);
      if (users.length < perPage) break;
    }
    if (batch.length > 0) return batch;
  }
  return [];
}

function endOfKstDay(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 14, 59, 59));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function clearGrant(): Record<string, null | string> {
  return {
    role: "teacher",
    adminExpiresAt: null,
    adminGrantedBy: null,
    adminGrantedAt: null,
  };
}

async function requireCaller(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 }) };
  }
  return { admin, user: data.user };
}

/** 상설 관리자가 같은 학교 구성원에게 기한부 관리자 권한을 부여·회수한다. */
export async function POST(req: Request) {
  try {
    const callerResult = await requireCaller(req);
    if ("error" in callerResult && callerResult.error) return callerResult.error;
    const { admin, user: caller } = callerResult as {
      admin: SupabaseClient;
      user: { id: string; email?: string; user_metadata?: ListedUser["user_metadata"] };
    };

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      userId?: string;
      days?: number;
      until?: string;
    };
    const action = body.action ?? "list";
    const meta = caller.user_metadata ?? {};
    const standing = adminStanding(meta);

    if (action === "sync") {
      if (standing === "expired") {
        await admin.auth.admin.updateUserById(caller.id, { user_metadata: clearGrant() });
        return NextResponse.json({ ok: true, role: "teacher", adminExpiresAt: null, expired: true });
      }
      return NextResponse.json({
        ok: true,
        role: meta.role === "admin" ? "admin" : "teacher",
        adminExpiresAt: standing === "temporary" ? meta.adminExpiresAt ?? null : null,
        expired: false,
      });
    }

    if (!isPermanentAdmin(meta) || !(meta.schoolName ?? "").trim()) {
      return NextResponse.json({ error: "상설 관리자만 임시 권한을 부여할 수 있습니다." }, { status: 403 });
    }
    const schoolName = (meta.schoolName ?? "").trim();

    const users = await listAllUsers(admin);
    const schoolUsers = users.filter((u) => {
      const m = u.user_metadata ?? {};
      const role = m.role;
      return (role === "teacher" || role === "admin") && (m.schoolName ?? "").trim() === schoolName;
    });

    const expiredIds = schoolUsers
      .filter((u) => adminStanding(u.user_metadata) === "expired")
      .map((u) => u.id);
    if (expiredIds.length > 0) {
      await Promise.all(
        expiredIds.map((id) => admin.auth.admin.updateUserById(id, { user_metadata: clearGrant() }))
      );
      expiredIds.forEach((id) => {
        const found = schoolUsers.find((u) => u.id === id);
        if (!found?.user_metadata) return;
        found.user_metadata.role = "teacher";
        found.user_metadata.adminExpiresAt = null;
        found.user_metadata.adminGrantedBy = null;
        found.user_metadata.adminGrantedAt = null;
      });
    }

    if (action === "grant" || action === "revoke") {
      const userId = (body.userId ?? "").trim();
      if (!userId) return NextResponse.json({ error: "구성원을 선택해 주세요." }, { status: 400 });
      if (userId === caller.id) {
        return NextResponse.json({ error: "본인 권한은 이 메뉴에서 바꿀 수 없습니다." }, { status: 400 });
      }
      const target = schoolUsers.find((u) => u.id === userId);
      if (!target) {
        return NextResponse.json({ error: "같은 학교 구성원만 변경할 수 있습니다." }, { status: 403 });
      }
      const targetStanding = adminStanding(target.user_metadata);

      if (action === "revoke") {
        if (targetStanding !== "temporary") {
          return NextResponse.json({ error: "임시 관리자만 회수할 수 있습니다." }, { status: 400 });
        }
        const { error: updateError } = await admin.auth.admin.updateUserById(userId, { user_metadata: clearGrant() });
        if (updateError) {
          return NextResponse.json({ error: "권한을 회수하지 못했습니다." }, { status: 500 });
        }
        if (target.user_metadata) {
          target.user_metadata.role = "teacher";
          target.user_metadata.adminExpiresAt = null;
          target.user_metadata.adminGrantedBy = null;
        }
      } else {
        if (targetStanding === "permanent") {
          return NextResponse.json({ error: "이미 상설 관리자입니다." }, { status: 400 });
        }
        let expires: Date | null = null;
        if (typeof body.until === "string" && body.until.trim()) {
          expires = endOfKstDay(body.until);
          if (!expires) return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
        } else if (typeof body.days === "number" && Number.isFinite(body.days)) {
          const days = Math.floor(body.days);
          if (days < 1 || days > 90) {
            return NextResponse.json({ error: "기간은 1일에서 90일 사이로 지정해 주세요." }, { status: 400 });
          }
          expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        }
        if (!expires) return NextResponse.json({ error: "권한 기간을 지정해 주세요." }, { status: 400 });
        if (expires.getTime() <= Date.now()) {
          return NextResponse.json({ error: "만료 시각은 현재보다 이후여야 합니다." }, { status: 400 });
        }
        if (expires.getTime() > Date.now() + 91 * 24 * 60 * 60 * 1000) {
          return NextResponse.json({ error: "임시 권한은 최대 90일까지 부여할 수 있습니다." }, { status: 400 });
        }
        const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
          user_metadata: {
            role: "admin",
            adminExpiresAt: expires.toISOString(),
            adminGrantedBy: (caller.email ?? "").trim(),
            adminGrantedAt: new Date().toISOString(),
          },
        });
        if (updateError) {
          return NextResponse.json({ error: "권한을 부여하지 못했습니다." }, { status: 500 });
        }
        if (target.user_metadata) {
          target.user_metadata.role = "admin";
          target.user_metadata.adminExpiresAt = expires.toISOString();
          target.user_metadata.adminGrantedBy = (caller.email ?? "").trim();
        }
      }
    } else if (action !== "list") {
      return NextResponse.json({ error: "요청을 처리할 수 없습니다." }, { status: 400 });
    }

    const members = schoolUsers
      .map((u) => {
        const m = u.user_metadata ?? {};
        const kindStanding = adminStanding(m);
        const kind: "permanent" | "temporary" | "teacher" =
          kindStanding === "permanent" || kindStanding === "temporary" ? kindStanding : "teacher";
        return {
          id: u.id,
          name: (m.name ?? "").trim(),
          email: (u.email ?? "").trim(),
          gradeClass: (m.gradeClass ?? m.subject ?? m.schoolLevel ?? "").trim(),
          kind,
          adminExpiresAt: kind === "temporary" ? (m.adminExpiresAt ?? null) : null,
          adminGrantedBy: kind === "temporary" ? (m.adminGrantedBy ?? null) : null,
        };
      })
      .sort((a, b) => {
        const order = { permanent: 0, temporary: 1, teacher: 2 };
        const d = order[a.kind] - order[b.kind];
        if (d !== 0) return d;
        const ag = a.gradeClass || "\uffff";
        const bg = b.gradeClass || "\uffff";
        const g = ag.localeCompare(bg, "ko");
        if (g !== 0) return g;
        return (a.name || a.email).localeCompare(b.name || b.email, "ko");
      });

    return NextResponse.json({ ok: true, schoolName, members });
  } catch (error) {
    console.error("temporary-admins error:", error);
    return NextResponse.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
