import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// sessionStorage 사용 → 브라우저/탭을 닫으면 로그인 해제됨
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(typeof window !== "undefined" && {
      storage: window.sessionStorage,
      storageKey: "teacher-mate-auth",
    }),
  },
});

