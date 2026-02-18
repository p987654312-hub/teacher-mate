# 성능·가벼운 구동을 위한 정리

## 적용한 정리
- **auth/callback**: 디버그용 `console.log`/`console.error` 제거, 500ms 대기 3회 → **100ms**로 단축 (총 1.5초 → 0.3초)
- **diagnosis/result**: 세션 갱신 전 대기 600ms → **100ms** 단축
- **diagnosis**: 저장 시 디버그 로그 제거, AI 분석 실패 시 콘솔 노이즈 제거
- **Recharts lazy**: 대시보드(진단 Radar), 진단결과, 계획, 성찰 결과보고서에서 `next/dynamic(..., { ssr: false })`로 차트 분리 → 초기 번들·실행 시간 감소
- **대시보드 관리자**: 교원 목록 **더 보기** 페이징 적용 (teacherDisplayLimit 20명씩, slice + 버튼)

## 속도 저하 요인 (개선 후보) — 최종 확인

### 1. 번들·초기 로드 (TTI/LCP 영향) — 완료

| 위치 | 내용 | 상태 |
|------|------|------|
| **app/dashboard/page.tsx** | 진단 Radar → `DashboardDiagnosisRadar` dynamic | ✅ |
| **app/diagnosis/result/page.tsx** | 전체 차트 → `DiagnosisResultCharts` dynamic | ✅ |
| **app/plan/page.tsx** | Radar → `PlanRadarChart` dynamic | ✅ |
| **app/reflection/result-report/page.tsx** | Radar → `ReflectionRadarCharts` dynamic | ✅ |

### 2. 인위적 지연 — 완료

| 위치 | 변경 | 상태 |
|------|------|------|
| **app/auth/callback/page.tsx** | 500ms 3회 → 100ms 3회 | ✅ |
| **app/diagnosis/result/page.tsx** | 600ms → 100ms | ✅ |

### 3. 렌더·DOM

| 위치 | 내용 | 영향 |
|------|------|------|
| **대시보드 초기 로드** | 응답 후 setState 다수 → re-render 가능성 (useReducer/단일 state로 추가 개선 가능) | **중** |
| **대시보드 관리자** | 교원 목록 20명씩 "더 보기" 페이징 적용됨 | 완료 |

### 4. 기타

| 구분 | 위치 | 내용 | 영향 |
|------|------|------|------|
| **폴링** | app/dashboard/page.tsx | loadSchoolCategories: 15초 후 1회 + 60초 간격 setInterval | 낮음 |
| **폴링** | app/dashboard/mileage/page.tsx | setTick 60초, reloadSchoolCategories 60초 | 낮음 |
| **콘솔** | 클라이언트 여러 페이지 | console.error (diagnosis/result, dashboard, plan, reflection 등) — 개발 시 유용, 프로덕션에서 과다 시 I/O 부담 | 매우 낮음 |
| **API** | 서버 route.ts 다수 | console.error — 서버 로깅용으로 유지 권장 | 무시 가능 |

### 권장 개선 순서 (남은 항목)
1. **대시보드 setState**: 한 번에 묶을 수 있는 상태는 useReducer 또는 단일 setState(object)로 re-render 횟수 감소 검토 (선택)

## 화면에서 부담될 수 있는 요소 (무거우면 참고)

| 위치 | 내용 | 부담도 | 비고 |
|------|------|--------|------|
| **대시보드** | Recharts (RadarChart, PieChart, ResponsiveContainer) | 중 | 차트 라이브러리. 카드·진단 요약 등 여러 개 동시 렌더 시 부담 |
| **대시보드** | `bg-gradient`, `shadow-*` 다수 | 낮음 | CSS만 사용, 보통 가벼움 |
| **대시보드** | `transition-all duration-500` 등 | 낮음 | 애니메이션 짧아서 부담 적음 |
| **진단 결과 페이지** | Recharts 방사형 차트 등 | 중 | 차트 1~2개면 보통 무리 없음 |
| **계획/성찰** | 그라데이션·섀도우 다수 | 낮음 | CSS 위주 |

### 이미 완화된 부분
- auth/callback·diagnosis/result 인위적 지연 100ms 단축
- Recharts 4개 페이지 모두 next/dynamic lazy 적용
- 대시보드 관리자: 교원 목록 20명씩 "더 보기" 페이징
- 대시보드 초기 로드: API 병렬 요청, 영역 설정 폴링 60초
- 마일리지: `setTick` 60초, 영역 설정 60초 폴링
- 콘솔 로그 제거로 불필요한 I/O 감소
