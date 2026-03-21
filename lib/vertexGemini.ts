import { VertexAI } from "@google-cloud/vertexai";
import type { GenerateContentResponse } from "@google-cloud/vertexai";
import type { JWTInput } from "google-auth-library";

type ServiceAccountJson = Record<string, unknown>;

let vertexClient: VertexAI | null = null;

function parseServiceAccountFromEnv(): ServiceAccountJson {
  const raw = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error(
      "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON 환경 변수에 서비스 계정 JSON 전체를 설정해주세요."
    );
  }
  try {
    return JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new Error("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON이 올바른 JSON이 아닙니다.");
  }
}

function resolveProjectId(credentials: ServiceAccountJson): string {
  const fromEnv = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (fromEnv) return fromEnv;
  const pid = credentials.project_id;
  if (typeof pid === "string" && pid) return pid;
  throw new Error("JSON에 project_id가 없습니다. GOOGLE_CLOUD_PROJECT를 설정하세요.");
}

function extractText(response: GenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts;
  if (parts?.length) {
    const text = parts
      .map((p) => ("text" in p && typeof (p as { text?: string }).text === "string" ? (p as { text: string }).text : ""))
      .join("")
      .trim();
    if (text) return text;
  }
  const block = response.promptFeedback?.blockReason;
  if (block) {
    throw new Error(`Vertex AI 프롬프트 차단: ${String(block)}`);
  }
  throw new Error("Vertex AI 응답에 텍스트가 없습니다.");
}

function getVertexClient(): VertexAI {
  if (vertexClient) return vertexClient;
  const credentials = parseServiceAccountFromEnv();
  const project = resolveProjectId(credentials);
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1";
  vertexClient = new VertexAI({
    project,
    location,
    googleAuthOptions: {
      credentials: credentials as JWTInput,
    },
  });
  return vertexClient;
}

/** 모델 미설정 시 AI Studio와 동일하게 gemini-2.5-flash 사용 */
export function getVertexGeminiModelId(): string {
  return process.env.GOOGLE_CLOUD_VERTEX_MODEL?.trim() || "gemini-2.5-flash";
}

/** 라우트 진입 시 사전 검증용 (실제 호출 없음) */
export function getVertexGeminiSetupError(): string | null {
  const raw = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    return "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON 환경 변수를 설정해주세요.";
  }
  let credentials: ServiceAccountJson;
  try {
    credentials = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    return "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON이 올바른 JSON이 아닙니다.";
  }
  try {
    resolveProjectId(credentials);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}

export async function generateVertexGeminiText(
  prompt: string,
  opts?: { maxOutputTokens?: number }
): Promise<string> {
  const vertex = getVertexClient();
  const model = vertex.getGenerativeModel({ model: getVertexGeminiModelId() });
  const result =
    opts?.maxOutputTokens != null
      ? await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: opts.maxOutputTokens },
        })
      : await model.generateContent(prompt);
  return extractText(result.response);
}
