import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateVertexGeminiText, getVertexGeminiSetupError } from "@/lib/vertexGemini";

/** 개발 환경에서만 env 설정·연결 상태를 확인합니다. 키 값은 절대 반환하지 않습니다. */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const envKeys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_LOCATION",
    "GOOGLE_CLOUD_VERTEX_MODEL",
    "ADMIN_CODE",
  ] as const;

  const status: Record<string, string> = {};
  for (const key of envKeys) {
    const val = process.env[key];
    if (key === "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON") {
      status[key] = val && String(val).trim() ? "설정됨" : "비어있음";
    } else {
      status[key] = val && String(val).trim() ? "설정됨" : "비어있음";
    }
  }

  const vertexSetup = getVertexGeminiSetupError();
  status["VERTEX_AI(사용가능)"] = vertexSetup ? "비어있음" : "설정됨";

  const connectivity: Record<string, "ok" | "fail" | "skip"> = {};
  let vertexError: string | null = null;

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

  // Vertex AI 최소 호출 (응답 내용은 사용하지 않음)
  if (!vertexSetup) {
    try {
      await generateVertexGeminiText("ping");
      connectivity.vertex_ai = "ok";
    } catch (err) {
      connectivity.vertex_ai = "fail";
      vertexError = err instanceof Error ? err.message : String(err);
    }
  } else {
    connectivity.vertex_ai = "skip";
    vertexError = vertexSetup;
  }

  return NextResponse.json({
    env: status,
    connectivity,
    vertexError,
    note: "키 값은 반환되지 않으며, 개발 환경에서만 동작합니다.",
  });
}
