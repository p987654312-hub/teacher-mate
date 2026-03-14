/**
 * 앱 전체에서 사용자 이름 표시: 실명 대신 성+** 형식 (예: 박**)
 */
export function maskDisplayName(name: string | null | undefined): string {
  if (name == null || typeof name !== "string") return "";
  const t = name.trim();
  if (!t) return "";
  return t[0] + "**";
}
