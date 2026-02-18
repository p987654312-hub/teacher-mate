import { createClient, SupabaseClient } from "@supabase/supabase-js";

const REMEMBER_KEY = "teacher-mate-remember";

// 빌드 시 env가 없을 수 있어서, 실제 사용 시점에만 클라이언트 생성
let cached: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  }
  cached = createClient(url, key, {
    auth: {
      ...(typeof window !== "undefined" && {
        storage:
          window.localStorage.getItem(REMEMBER_KEY) === "1"
            ? window.localStorage
            : window.sessionStorage,
        storageKey: "teacher-mate-auth",
      }),
    },
  });
  return cached;
}

// 로그인 유지 시 localStorage, 아니면 sessionStorage(탭 닫으면 로그아웃)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabase() as unknown as Record<string, unknown>)[prop as string];
  },
});

