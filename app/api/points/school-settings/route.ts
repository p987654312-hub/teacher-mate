import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CATEGORY_KEYS = ["training", "class_open", "community", "book_edutech", "health", "other"] as const;
const UNIT_OPTIONS = ["시간", "분", "회", "건", "권", "km"] as const;
export type CategoryUnit = (typeof UNIT_OPTIONS)[number];

export interface SchoolCategoryConfig {
  key: string;
  label: string;
  unit: string;
}

function defaultPoints(): Record<string, number> {
  const o: Record<string, number> = {};
  CATEGORY_KEYS.forEach((k) => {
    o[k] = 1;
  });
  o.login_points = 2; // 1일 로그인 점수 기본값
  return o;
}

export function defaultCategories(): SchoolCategoryConfig[] {
  return [
    { key: "training", label: "연수(직무·자율)", unit: "시간" },
    { key: "class_open", label: "수업 공개", unit: "회" },
    { key: "community", label: "교원학습 공동체", unit: "회" },
    { key: "book_edutech", label: "전문 서적/에듀테크", unit: "회" },
    { key: "health", label: "건강/체력", unit: "시간" },
    { key: "other", label: "기타 계획", unit: "건" },
  ];
}

export function parseStored(row: { settings_json?: string | null } | null): {
  points: Record<string, number>;
  categories: SchoolCategoryConfig[];
} {
  if (!row?.settings_json) {
    return { points: defaultPoints(), categories: defaultCategories() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.settings_json as string);
  } catch {
    return { points: defaultPoints(), categories: defaultCategories() };
  }
  const obj = parsed as Record<string, unknown>;
  // 신규 형식: { points: {...}, categories: [...] }
  if (obj && typeof obj.points === "object" && Array.isArray(obj.categories)) {
    const points = { ...defaultPoints(), ...(obj.points as Record<string, number>) };
    const def = defaultCategories();
    const categories: SchoolCategoryConfig[] = CATEGORY_KEYS.map((key) => {
      const found = (obj.categories as SchoolCategoryConfig[]).find((c) => c && c.key === key);
      const d = def.find((x) => x.key === key)!;
      return {
        key,
        label: typeof found?.label === "string" && found.label.trim() ? found.label.trim() : d.label,
        unit: typeof found?.unit === "string" && UNIT_OPTIONS.includes(found.unit as CategoryUnit) ? found.unit : d.unit,
      };
    });
    return { points, categories };
  }
  // 레거시: 전체가 숫자만 있는 객체면 points
  if (obj && typeof obj === "object" && !Array.isArray(obj) && !obj.points) {
    const points = { ...defaultPoints(), ...(obj as Record<string, number>) };
    return { points, categories: defaultCategories() };
  }
  return { points: defaultPoints(), categories: defaultCategories() };
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key);
}

/** 학교별 포인트 설정 + 6가지 영역(이름·단위) 조회 (관리자) */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin") return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });

    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) {
      return NextResponse.json({
        settings: defaultPoints(),
        categories: defaultCategories(),
      });
    }

    const { data: row } = await supabase
      .from("school_point_settings")
      .select("settings_json")
      .eq("school_name", schoolName)
      .maybeSingle();

    const { points, categories } = parseStored(row);
    return NextResponse.json({
      settings: points,
      categories,
    });
  } catch (e) {
    console.error("points/school-settings GET:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** 학교별 포인트 설정 + 6가지 영역(이름·단위) 저장 (관리자) */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 401 });

    const meta = (user.user_metadata ?? {}) as { role?: string; schoolName?: string };
    if (meta.role !== "admin") return NextResponse.json({ error: "관리자만 저장할 수 있습니다." }, { status: 403 });

    const schoolName = (meta.schoolName ?? "").trim();
    if (!schoolName) return NextResponse.json({ error: "학교 정보가 없습니다." }, { status: 400 });

    const body = await req.json();
    const pointsInput = (body.settings ?? body) as Record<string, number>;
    const filteredPoints: Record<string, number> = {};
    CATEGORY_KEYS.forEach((k) => {
      const v = pointsInput[k];
      filteredPoints[k] = typeof v === "number" && v >= 0 ? v : 1;
    });
    // 로그인 포인트 설정 추가
    const loginPoints = pointsInput.login_points;
    filteredPoints.login_points = typeof loginPoints === "number" && loginPoints >= 0 ? loginPoints : 2;

    const def = defaultCategories();
    const rawCategories = (body.categories ?? []) as SchoolCategoryConfig[];
    const categories: SchoolCategoryConfig[] = CATEGORY_KEYS.map((key) => {
      const found = rawCategories.find((c) => c && c.key === key);
      const d = def.find((x) => x.key === key)!;
      return {
        key,
        label: typeof found?.label === "string" && found.label.trim() ? String(found.label).trim() : d.label,
        unit: typeof found?.unit === "string" && UNIT_OPTIONS.includes(found.unit as CategoryUnit) ? found.unit : d.unit,
      };
    });

    const payload = { points: filteredPoints, categories };
    const { error } = await supabase.from("school_point_settings").upsert(
      {
        school_name: schoolName,
        settings_json: JSON.stringify(payload),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_name" }
    );

    if (error) {
      console.error("points/school-settings POST:", error);
      return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, settings: filteredPoints, categories });
  } catch (e) {
    console.error("points/school-settings POST:", e);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
