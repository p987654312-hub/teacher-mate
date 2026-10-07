/**
 * 상설 관리자(슈퍼관리자 코드로 등록, 만료 시각 없음)와
 * 임시 관리자(adminExpiresAt가 있는 관리자)를 구분한다.
 */
export type AdminStanding = "none" | "permanent" | "temporary" | "expired";

export function adminStanding(
  meta: { role?: string | null; adminExpiresAt?: string | null } | null | undefined
): AdminStanding {
  if (!meta || meta.role !== "admin") return "none";
  const raw = meta.adminExpiresAt;
  if (raw == null || String(raw).trim() === "") return "permanent";
  const t = new Date(String(raw)).getTime();
  if (!Number.isFinite(t)) return "expired";
  return t > Date.now() ? "temporary" : "expired";
}

export function isPermanentAdmin(
  meta: { role?: string | null; adminExpiresAt?: string | null } | null | undefined
): boolean {
  return adminStanding(meta) === "permanent";
}
