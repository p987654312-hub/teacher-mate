import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** 개발 환경에서만 env 설정·연결 상태를 확인합니다. 키 값은 절대 반환하지 않습니다. */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const envKeys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "GEMINI_API_KEY_1",
    "ADMIN_CODE",
    "NEXT_PUBLIC_ADMIN_CODE",
  ] as const;

  const status: Record<string, "설정됨" | "비어있음"> = {};
  for (const key of envKeys) {
    const val = process.env[key];
    status[key] = val && String(val).trim() ? "설정됨" : "비어있음";
  }

  // Gemini: GEMINI_API_KEY 또는 GEMINI_API_KEY_1~5 중 하나라도 있으면 "설정됨"
  const numberedKeys = Array.from({ length: 5 }, (_, i) => process.env[`GEMINI_API_KEY_${i + 1}`]);
  const countNumbered = numberedKeys.filter((v) => v && String(v).trim()).length;
  const hasGemini =
    status.GEMINI_API_KEY === "설정됨" || countNumbered > 0;
  if (hasGemini) status["GEMINI(사용가능)"] = "설정됨";
  else status["GEMINI(사용가능)"] = "비어있음";
  // 로테이션: GEMINI_API_KEY_1~5 개수 (2개 이상이면 로테이션 가능)
  const rotationKeys = countNumbered > 0 ? countNumbered : (status.GEMINI_API_KEY === "설정됨" ? 1 : 0);
  status["GEMINI_로테이션키수"] = rotationKeys >= 2 ? `${rotationKeys}개 (로테이션 적용)` : rotationKeys === 1 ? "1개" : "0개";

  const connectivity: Record<string, "ok" | "fail" | "skip"> = {};

  // Supabase 연결 테스트 (anon key만 사용, 세션 조회만 시도)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const client = createClient(url.trim(), anon.trim());
      const { error } = await client.auth.getSession();
      connectivity.supabase = error ? "fail" : "ok";
    } catch {
      connectivity.supabase = "fail";
    }
  } else {
    connectivity.supabase = "skip";
  }

  // Gemini 연결 테스트 (최소 호출, 응답 내용은 사용하지 않음)
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY_1?.trim();
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "1" }] }],
            generationConfig: { maxOutputTokens: 8 },
          }),
        }
      );
      connectivity.gemini = res.ok ? "ok" : "fail";
    } catch {
      connectivity.gemini = "fail";
    }
  } else {
    connectivity.gemini = "skip";
  }

  return NextResponse.json({
    env: status,
    connectivity,
    note: "키 값은 반환되지 않으며, 개발 환경에서만 동작합니다.",
  });
}
