/**
 * 마일리지 실행 난이도: 5단계(직무연수·수업공개) / 3단계(상대·같은 학교).
 * 표기: 난이도 ★☆☆☆☆ (1~5 별)
 */

/** 직무연수(시간) 기준 1~5단계: 30h→1, 60→2, 80→3, 120→4, 150→5 */
export function getTrainingDifficultyLevel(goalHours: number): 1 | 2 | 3 | 4 | 5 {
  if (goalHours <= 30) return 1;
  if (goalHours <= 60) return 2;
  if (goalHours <= 80) return 3;
  if (goalHours <= 120) return 4;
  return 5;
}

/** 수업공개(회) 기준 1~5단계: 2회→1, 3→2, 5→3, 7→4, 10→5 */
export function getClassOpenDifficultyLevel(goalCount: number): 1 | 2 | 3 | 4 | 5 {
  if (goalCount <= 2) return 1;
  if (goalCount <= 3) return 2;
  if (goalCount <= 5) return 3;
  if (goalCount <= 7) return 4;
  return 5;
}

/** 1~5단계 → 별 문자열 (난이도 ★☆☆☆☆ 형식) */
export function getDifficultyStars(level: 1 | 2 | 3 | 4 | 5): string {
  const filled = "★".repeat(level);
  const empty = "☆".repeat(5 - level);
  return `${filled}${empty}`;
}

/** 상대 난이도 1=쉬움, 2=보통, 3=어려움 → 3단계 별 (쉬움=★☆☆☆☆, 보통=★★★☆☆, 어려움=★★★★★) */
export function getRelativeDifficultyStars(relativeLevel: 1 | 2 | 3): string {
  const map: Record<1 | 2 | 3, string> = {
    1: "★☆☆☆☆",
    2: "★★★☆☆",
    3: "★★★★★",
  };
  return map[relativeLevel];
}
