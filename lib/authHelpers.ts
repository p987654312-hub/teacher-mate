/**
 * 사용자 역할 확인 헬퍼 함수
 * 관리자는 교원 권한도 자동으로 가집니다.
 */

export type UserRole = "teacher" | "admin";

export interface UserMetadata {
  role?: UserRole | UserRole[];
  schoolName?: string;
  name?: string;
  gradeClass?: string;
}

/**
 * 사용자가 교원 역할을 가지고 있는지 확인
 * 관리자는 자동으로 교원 권한도 가집니다.
 */
export function isTeacher(metadata?: UserMetadata | null): boolean {
  if (!metadata?.role) return false;
  
  // role이 배열인 경우
  if (Array.isArray(metadata.role)) {
    return metadata.role.includes("teacher") || metadata.role.includes("admin");
  }
  
  // role이 문자열인 경우
  return metadata.role === "teacher" || metadata.role === "admin";
}

/**
 * 사용자가 관리자 역할을 가지고 있는지 확인
 */
export function isAdmin(metadata?: UserMetadata | null): boolean {
  if (!metadata?.role) return false;
  
  // role이 배열인 경우
  if (Array.isArray(metadata.role)) {
    return metadata.role.includes("admin");
  }
  
  // role이 문자열인 경우
  return metadata.role === "admin";
}

/**
 * 사용자가 특정 역할을 가지고 있는지 확인
 */
export function hasRole(metadata?: UserMetadata | null, role: UserRole): boolean {
  if (!metadata?.role) return false;
  
  // role이 배열인 경우
  if (Array.isArray(metadata.role)) {
    return metadata.role.includes(role);
  }
  
  // role이 문자열인 경우
  return metadata.role === role;
}
