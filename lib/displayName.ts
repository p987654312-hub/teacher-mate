/**
 * 앱 전체에서 사용자 이름 표시: 실명 대신 성+** 형식 (예: 박**)
 */
export function maskDisplayName(name: string | null | undefined): string {
  if (name == null || typeof name !== "string") return "";
  const t = name.trim();
  if (!t) return "";
  return t[0] + "**";
}

/** 학년반·교과 등 표시용 문자열 (user_metadata / 프로필 오버라이드) */
export function resolveAffiliation(meta: {
  gradeClass?: string | null;
  subject?: string | null;
  schoolLevel?: string | null;
} | null | undefined): string {
  if (!meta) return "";
  return (meta.gradeClass ?? meta.subject ?? meta.schoolLevel ?? "").trim();
}

/** 인쇄·결과 화면: "2-1 박**" 형식 (학년반/교과 + 마스킹된 성명) */
export function formatMaskedNameWithAffiliation(
  affiliation: string | null | undefined,
  name: string | null | undefined
): string {
  const masked = maskDisplayName(name);
  if (!masked) return "";
  const aff = (affiliation ?? "").trim();
  return aff ? `${aff} ${masked}` : masked;
}
