"use client";

import { useEffect, useState, useRef, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { maskDisplayName } from "@/lib/displayName";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { computeMileageProgress } from "@/lib/mileageProgress";
// mileageDifficulty 관련 별표 표기는 더 이상 사용하지 않음
import { DEFAULT_DIAGNOSIS_DOMAINS, type DiagnosisDomainConfig } from "@/lib/diagnosisQuestions";
import { DIAGNOSIS_SAMPLE_CSV } from "@/lib/diagnosisSampleCsv";
import { AI_PROMPT_DEFAULTS, AI_PROMPT_KEYS, type AiPromptKey } from "@/lib/aiPromptDefaults";
import {
  ClipboardCheck,
  Flag,
  NotebookPen,
  Printer,
  Compass,
  Plane,
  KeyRound,
  Settings,
  Maximize2,
  Minimize2,
  X,
  Trash2,
  MessageSquare,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Progress } from "@/components/ui/progress";

const DashboardDiagnosisRadar = dynamic(
  () => import("@/components/charts/DashboardDiagnosisRadar"),
  { ssr: false }
);

type PlanRow = {
  development_goal?: string | null;
  expected_outcome?: string | null;
  annual_goal?: string | null;
  expense_annual_goal?: string | null;
  community_annual_goal?: string | null;
  book_annual_goal?: string | null;
  education_annual_goal?: string | null;
  other_annual_goal?: string | null;
  training_plans?: Array<{ name?: string; period?: string; duration?: string; remarks?: string }> | null;
  education_plans?: Array<{ area?: string; period?: string; duration?: string; remarks?: string }> | null;
  book_plans?: Array<{ title?: string; period?: string; method?: string; remarks?: string }> | null;
  expense_requests?: Array<{ activity?: string; period?: string; method?: string; remarks?: string }> | null;
  community_plans?: Array<{ activity?: string; period?: string; method?: string; remarks?: string }> | null;
  other_plans?: Array<{ text?: string; content?: string; period?: string; method?: string; remarks?: string }> | null;
};

function getPlanFillRatio(row: PlanRow): number {
  let total = 0;
  let filled = 0;
  const count = (v: string | null | undefined) => {
    total += 1;
    if ((v ?? "").trim() !== "") filled += 1;
  };
  count(row.development_goal ?? "");
  count(row.expected_outcome ?? "");
  count(row.annual_goal ?? "");
  count(row.expense_annual_goal ?? "");
  count(row.community_annual_goal ?? "");
  count(row.book_annual_goal ?? "");
  count(row.education_annual_goal ?? "");
  count(row.other_annual_goal ?? "");
  (row.training_plans ?? []).forEach((r) => {
    count(r.name); count(r.period); count(r.duration); count(r.remarks);
  });
  (row.education_plans ?? []).forEach((r) => {
    count(r.area); count(r.period); count(r.duration); count(r.remarks);
  });
  (row.book_plans ?? []).forEach((r) => {
    count(r.title); count(r.period); count(r.method); count(r.remarks);
  });
  (row.expense_requests ?? []).forEach((r) => {
    count(r.activity); count(r.period); count(r.method); count(r.remarks);
  });
  (row.community_plans ?? []).forEach((r) => {
    count(r.activity); count(r.period); count(r.method); count(r.remarks);
  });
  (row.other_plans ?? []).forEach((r) => {
    count(r.text ?? r.content);
    count(r.period);
    count(r.method);
    count(r.remarks);
  });
  return total > 0 ? filled / total : 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [userSchool, setUserSchool] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userGradeClass, setUserGradeClass] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"teacher" | "admin" | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [viewMode, setViewMode] = useState<"admin" | "teacher">(() => {
    // localStorage에서 저장된 모드 불러오기
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("teacher_mate_admin_view_mode");
      if (saved === "teacher" || saved === "admin") {
        return saved;
      }
    }
    return "admin";
  }); // 관리자일 때 보기 모드
  
  // 역할 및 뷰 모드 계산 (useEffect보다 먼저 정의)
  const isTeacher = userRole === "teacher";
  const isAdmin = userRole === "admin";
  const showTeacherView = isTeacher || (isAdmin && viewMode === "teacher");
  const showAdminView = isAdmin && viewMode === "admin";
  const [teachers, setTeachers] = useState<
    { id: string; name: string; email: string; createdAt: string }[]
  >([]);
  const [teacherSummaries, setTeacherSummaries] = useState<
    {
      id: string;
      email: string;
      name: string;
      schoolName: string;
      createdAt: string;
      gradeClass?: string;
      hasPreDiagnosis: boolean;
      hasPostDiagnosis: boolean;
      planCompleted: boolean;
      reflectionDone: boolean;
      totalPoints?: number;
      mileageSummary: { overallProgress: number; categories: { key: string; label: string; progress: number }[] };
      isGoogleOnly?: boolean; // 구글 로그인만 사용하는 경우
    }[]
  >([]);
  const [expandedTeacherCards, setExpandedTeacherCards] = useState<Record<string, boolean>>({});
  const [adminSortBy, setAdminSortBy] = useState<"createdAt" | "name" | "gradeClass">("createdAt");
  const [teacherDisplayLimit, setTeacherDisplayLimit] = useState(20);
  const TEACHER_PAGE_SIZE = 20;
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
  const [teachersError, setTeachersError] = useState<string | null>(null);
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null);
  const [diagnosisSummary, setDiagnosisSummary] = useState<{
    domain1: number;
    domain2: number;
    domain3: number;
    domain4: number;
    domain5: number;
    domain6: number;
    totalScore: number;
  } | null>(null);
  const [hasPostDiagnosis, setHasPostDiagnosis] = useState(false);
  const [isLoadingDiagnosis, setIsLoadingDiagnosis] = useState(false);
  const [planCompleted, setPlanCompleted] = useState(false);
  const [mileageStarted, setMileageStarted] = useState(false);
  const [mileageSummary, setMileageSummary] = useState<{
    overallProgress: number;
    categories: { key: string; label: string; progress: number; sum?: number; goal?: number; unit?: string }[];
  } | null>(null);
  const [relativeDifficulty, setRelativeDifficulty] = useState<Record<string, 1 | 2 | 3> | null>(null);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [pointsDetail, setPointsDetail] = useState<{ base: number; login: number; mileage: number; total: number } | null>(null);
  const [mileagePointItems, setMileagePointItems] = useState<
    Array<{ key: string; label: string; unit: string; sum: number; pointPerUnit: number; points: number }>
  >([]);
  const [showMileageDetail, setShowMileageDetail] = useState(false);
  const [reflectionDone, setReflectionDone] = useState(false);
  const [showPointSettings, setShowPointSettings] = useState(false);
  const [showDiagnosisSettings, setShowDiagnosisSettings] = useState(false);
  const [showAiPromptSettings, setShowAiPromptSettings] = useState(false);
  const [aiPromptSettings, setAiPromptSettings] = useState<Record<string, { value: string; description: string; label: string }>>({});
  const [aiPromptSettingsLoading, setAiPromptSettingsLoading] = useState(false);
  const [aiPromptSettingsSaving, setAiPromptSettingsSaving] = useState(false);
  const [aiPromptSavingKey, setAiPromptSavingKey] = useState<string | null>(null);
  const [diagnosisTitle, setDiagnosisTitle] = useState("");
  const [diagnosisTitleSaved, setDiagnosisTitleSaved] = useState("");
  const [diagnosisDomains, setDiagnosisDomains] = useState<DiagnosisDomainConfig[]>(() => [...DEFAULT_DIAGNOSIS_DOMAINS]);
  const [diagnosisDomainsSaved, setDiagnosisDomainsSaved] = useState<DiagnosisDomainConfig[]>(() => [...DEFAULT_DIAGNOSIS_DOMAINS]);
  const [diagnosisRadarLabels, setDiagnosisRadarLabels] = useState<string[]>(() => DEFAULT_DIAGNOSIS_DOMAINS.map((d) => d.name));
  const [savingDiagnosisSettings, setSavingDiagnosisSettings] = useState(false);
  const [diagnosisExcelFile, setDiagnosisExcelFile] = useState<File | null>(null);
  const [diagnosisUploadTitle, setDiagnosisUploadTitle] = useState("");
  const [diagnosisUploading, setDiagnosisUploading] = useState(false);
  const [diagnosisSurveyCurrent, setDiagnosisSurveyCurrent] = useState<{ questionCount: number; domains: string[]; title: string } | null>(null);
  const [diagnosisSurveyTitle, setDiagnosisSurveyTitle] = useState("");
  const [diagnosisUploadFileName, setDiagnosisUploadFileName] = useState("");
  const [resettingAllData, setResettingAllData] = useState(false);
  const [planMissingGoals, setPlanMissingGoals] = useState<string[]>([]); // 계획서 누락된 연간 목표
  const [pointSettings, setPointSettings] = useState<Record<string, number>>({
    training: 1,
    class_open: 1,
    community: 1,
    book_edutech: 1,
    health: 1,
    other: 1,
    login_points: 2, // 1일 로그인 점수
  });
  type CategoryConfigItem = { key: string; label: string; unit: string };
  const DEFAULT_CATEGORIES: CategoryConfigItem[] = [
    { key: "training", label: "마일리지카드1", unit: "시간" },
    { key: "class_open", label: "마일리지카드2", unit: "회" },
    { key: "community", label: "마일리지카드3", unit: "회" },
    { key: "book_edutech", label: "마일리지카드4", unit: "회" },
    { key: "health", label: "마일리지카드5", unit: "시간" },
    { key: "other", label: "마일리지카드6", unit: "건" },
  ];
  const UNIT_OPTIONS = ["시간", "분", "회", "건", "권", "km"];
  const [categoryConfig, setCategoryConfig] = useState<CategoryConfigItem[]>(() => [...DEFAULT_CATEGORIES]);
  const [categoryConfigSaved, setCategoryConfigSaved] = useState<CategoryConfigItem[]>(() => [...DEFAULT_CATEGORIES]);
  const [savingCategoryConfig, setSavingCategoryConfig] = useState(false);
  const [schoolCategories, setSchoolCategories] = useState<CategoryConfigItem[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [pointSettingsSaved, setPointSettingsSaved] = useState<Record<string, number>>({
    training: 1,
    class_open: 1,
    community: 1,
    book_edutech: 1,
    health: 1,
    other: 1,
    login_points: 2,
  });
  const [savingPointSettings, setSavingPointSettings] = useState(false);
  const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);

  const MILEAGE_CATEGORIES = [
    { key: "training", label: "마일리지카드1" },
    { key: "class_open", label: "마일리지카드2" },
    { key: "community", label: "마일리지카드3" },
    { key: "book_edutech", label: "마일리지카드4" },
    { key: "health", label: "마일리지카드5" },
    { key: "other", label: "마일리지카드6" },
  ] as const;
  const PLAN_GOAL_KEYS: Record<string, string> = {
    training: "annual_goal",
    class_open: "expense_annual_goal",
    community: "community_annual_goal",
    book_edutech: "book_annual_goal",
    health: "education_annual_goal",
    other: "other_annual_goal",
  };
  const POINT_SETTING_UNITS: Record<string, string> = {
    training: "시간",
    class_open: "회",
    community: "회",
    book_edutech: "회",
    health: "시간",
    other: "건",
  };
  const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#c084fc", "#d8b4fe", "#e9d5ff"];
  const [pointsDetailOwner, setPointsDetailOwner] = useState<{ name: string; isAdminSelf: boolean } | null>(null);
  const [isLoadingPointsDetail, setIsLoadingPointsDetail] = useState(false);
  const [adminMileageDetail, setAdminMileageDetail] = useState<{
    teacherName: string;
    categoryLabel: string;
    entries: { id: string; content: string; created_at: string }[];
  } | null>(null);
  const [showAdminMileageDetail, setShowAdminMileageDetail] = useState(false);

  // 보호된 라우트: 로그인하지 않은 사용자는 / 로 리다이렉트
  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const metadata = user.user_metadata as
        | {
            name?: string;
            schoolName?: string;
            schoolLevel?: string;
            gradeClass?: string;
            role?: "teacher" | "admin";
          }
        | undefined;

      const role = metadata?.role ?? null;
      const name = metadata?.name ?? user.email ?? null;
      let schoolName = metadata?.schoolName ?? null;
      let gradeClass = metadata?.gradeClass ?? metadata?.schoolLevel ?? null;

      // 세션 1회만 조회 후 토큰 재사용 (중복 getSession 제거로 체감 속도 개선)
      const { data: { session: initSession } } = await supabase.auth.getSession();
      const token = initSession?.access_token ?? null;
      if (token) {
        try {
          const res = await fetch("/api/account/profile-overrides", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (res.ok) {
            const overrides = (await res.json()) as { schoolName?: string | null; gradeClass?: string | null };
            if (overrides.schoolName != null && overrides.schoolName !== "") schoolName = overrides.schoolName;
            if (overrides.gradeClass != null) gradeClass = overrides.gradeClass;
          }
        } catch {
          // ignore
        }
      }

      setUserName(name);
      setUserSchool(schoolName);
      setUserGradeClass(gradeClass);
      setUserRole(role);
      setCurrentUserEmail(user.email ?? null);
      setIsChecking(false);

      // 관리자: 교원 목록 — 위에서 쓴 token 재사용 (getSession 재호출 제거)
      const adminTeachersPromise =
        role === "admin" && schoolName && token
          ? (async () => {
              const res = await fetch("/api/admin/teacher-summaries", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ schoolName }),
              });
              return { ok: res.ok, json: await res.json() };
            })()
          : null;

      // 교사용: 단일 API 1회 호출 + 재진입 시 캐시로 즉시 표시
      if ((role === "teacher" || role === "admin") && user.email) {
        try {
          const CACHE_KEY = "teacher_mate_dashboard_cache";
          const CACHE_TTL_MS = 60_000; // 60초
          let hadCacheHit = false;
          if (typeof window !== "undefined") {
            try {
              const raw = sessionStorage.getItem(CACHE_KEY);
              if (raw) {
                const { ts, email: cacheEmail, ...cached } = JSON.parse(raw) as {
                  ts: number;
                  email: string;
                  diagnosisSummary?: typeof diagnosisSummary;
                  hasPostDiagnosis?: boolean;
                  planCompleted?: boolean;
                  mileageStarted?: boolean;
                  mileageSummary?: typeof mileageSummary;
                  relativeDifficulty?: Record<string, 1 | 2 | 3> | null;
                  totalPoints?: number | null;
                  pointsDetail?: typeof pointsDetail;
                  mileagePointItems?: typeof mileagePointItems;
                  diagnosisRadarLabels?: string[];
                  schoolCategories?: CategoryConfigItem[];
                  planMissingGoals?: string[];
                };
                if (cacheEmail === user.email && Date.now() - ts < CACHE_TTL_MS) {
                  hadCacheHit = true;
                  if (cached.diagnosisSummary != null) setDiagnosisSummary(cached.diagnosisSummary);
                  if (cached.hasPostDiagnosis != null) setHasPostDiagnosis(cached.hasPostDiagnosis);
                  if (cached.planCompleted != null) setPlanCompleted(cached.planCompleted);
                  if (cached.mileageStarted != null) setMileageStarted(cached.mileageStarted);
                  if (cached.mileageSummary != null) setMileageSummary(cached.mileageSummary);
                  if (cached.relativeDifficulty !== undefined) setRelativeDifficulty(cached.relativeDifficulty);
                  if (cached.totalPoints !== undefined) setTotalPoints(cached.totalPoints);
                  if (cached.pointsDetail != null) setPointsDetail(cached.pointsDetail);
                  if (cached.mileagePointItems != null) setMileagePointItems(cached.mileagePointItems);
                  if (cached.diagnosisRadarLabels != null) setDiagnosisRadarLabels(cached.diagnosisRadarLabels);
                  if (cached.schoolCategories != null) setSchoolCategories(cached.schoolCategories);
                  if (cached.planMissingGoals != null) setPlanMissingGoals(cached.planMissingGoals);
                }
              }
            } catch {
              // ignore cache parse error
            }
          }

          if (!hadCacheHit) setIsLoadingDiagnosis(true);
          const res = token
            ? await fetch("/api/dashboard-data", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
            : null;
          const payload = res?.ok ? await res.json() : null;
          if (!payload) {
            setIsLoadingDiagnosis(false);
            return;
          }

          const preRes = { data: payload.preRes?.data, error: payload.preRes?.error };
          const postRes = { data: payload.postRes?.data };
          const planRes = { data: payload.planRes?.data };
          const mileageRes = { data: payload.mileageRes?.data ?? [] };
          const catJson = { categories: payload.categories ?? null } as { categories?: CategoryConfigItem[] };
          const diagnosisSettingsRes = payload.diagnosisSettings ?? {};
          const diffRes = payload.relativeDifficulty != null ? { ok: true, json: () => Promise.resolve(payload.relativeDifficulty) } : null;
          const pointsRes = payload.points != null ? { ok: true, json: () => Promise.resolve(payload.points) } : null;

          const data = preRes.data;
          const { data: planRow } = planRes;
          const mileageRows = mileageRes.data ?? [];
          const diagSettings = diagnosisSettingsRes as { domains?: { name?: string }[]; useSurvey?: boolean };
          const domainCount = Math.min(6, Math.max(2, Array.isArray(diagSettings?.domains) ? diagSettings.domains.length : 6));

          startTransition(() => {
            const cat = data?.category_scores as Record<string, { count?: number }> | undefined;
            const getCount = (key: string) => (cat?.[key]?.count ?? 5);
            const avg = (key: string, val: number) => (domainCount <= 6 && cat ? val / (getCount(key) || 1) : val / 5);
            if (!preRes.error && data) {
              setDiagnosisSummary({
                domain1: avg("domain1", (data.domain1 as number) ?? 0),
                domain2: avg("domain2", (data.domain2 as number) ?? 0),
                domain3: avg("domain3", (data.domain3 as number) ?? 0),
                domain4: avg("domain4", (data.domain4 as number) ?? 0),
                domain5: domainCount >= 5 ? avg("domain5", (data.domain5 as number) ?? 0) : 0,
                domain6: domainCount >= 6 ? avg("domain6", (data.domain6 as number) ?? 0) : 0,
                totalScore: (data.total_score as number) ?? 0,
              });
            }
            setHasPostDiagnosis(!!postRes.data);

            if (Array.isArray(diagSettings?.domains) && diagSettings.domains.length >= 2 && diagSettings.domains.length <= 6) {
              const labels = diagSettings.domains.map((d, i) => (d?.name ?? "").trim() || (DEFAULT_DIAGNOSIS_DOMAINS[i]?.name ?? ""));
              setDiagnosisRadarLabels(labels);
            } else {
              setDiagnosisRadarLabels(DEFAULT_DIAGNOSIS_DOMAINS.map((d) => d.name));
            }

            const planFilledRatio = planRow ? getPlanFillRatio(planRow) : 0;
            setPlanCompleted(planFilledRatio >= 0.7);
            const planGoalsRowInit = planRow as Record<string, string | null | undefined> | null | undefined;
            const PLAN_CATEGORY_LABELS_INIT: Record<string, string> = { training: "마일리지카드1", class_open: "마일리지카드2", community: "마일리지카드3", book_edutech: "마일리지카드4", health: "마일리지카드5", other: "마일리지카드6" };
            const goalsInit = [
              { value: String(planGoalsRowInit?.annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.training },
              { value: String(planGoalsRowInit?.expense_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.class_open },
              { value: String(planGoalsRowInit?.community_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.community },
              { value: String(planGoalsRowInit?.book_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.book_edutech },
              { value: String(planGoalsRowInit?.education_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.health },
              { value: String(planGoalsRowInit?.other_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.other },
            ];
            setPlanMissingGoals(goalsInit.filter((g) => !g.value).map((g) => g.label));
            if (mileageRows.length > 0) setMileageStarted(true);

            let categoriesForMileage: CategoryConfigItem[] | undefined;
            if (Array.isArray(catJson.categories) && catJson.categories.length === 6) {
              categoriesForMileage = catJson.categories;
              setSchoolCategories(catJson.categories);
              if (schoolName) localStorage.setItem(`teacher_mate_category_settings_${schoolName}`, JSON.stringify(catJson.categories));
            }

            const planGoals: Record<string, number> = {};
            MILEAGE_CATEGORIES.forEach((c) => {
              const key = PLAN_GOAL_KEYS[c.key];
              const raw = String(planGoalsRowInit?.[key] ?? "").trim();
              planGoals[c.key] = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
            });
            let healthGoalUnit: "시간" | "거리" = (planGoalsRowInit?.education_annual_goal_unit === "거리" ? "거리" : "시간") as "시간" | "거리";
            if (categoriesForMileage?.length === 6) {
              const healthCat = categoriesForMileage.find((c) => c.key === "health");
              if (healthCat?.unit === "km") healthGoalUnit = "거리";
              else if (healthCat?.unit === "시간") healthGoalUnit = "시간";
            }
            const { categories, overallProgress } = computeMileageProgress(
              mileageRows as { content: string; category: string }[],
              planGoals,
              healthGoalUnit,
              categoriesForMileage
            );
            setMileageSummary({ overallProgress, categories });
          });

          if (token && diffRes) {
            try {
              if (diffRes.ok) setRelativeDifficulty(await diffRes.json());
              else setRelativeDifficulty(null);
            } catch {
              setRelativeDifficulty(null);
            }
          }
          if (token && pointsRes) {
            try {
              if (pointsRes.ok) {
                const pointsJ = await pointsRes.json();
                if (typeof pointsJ.total === "number") {
                  setTotalPoints(pointsJ.total);
                  setPointsDetail({ base: pointsJ.base ?? 100, login: pointsJ.login ?? 0, mileage: pointsJ.mileage ?? 0, total: pointsJ.total });
                  setMileagePointItems(Array.isArray(pointsJ.mileageBreakdown) ? pointsJ.mileageBreakdown : []);
                }
              }
            } catch {
              // ignore
            }
          }

          // 재진입 시 즉시 표시용 캐시 저장 (60초 TTL)
          if (typeof window !== "undefined" && user.email && token) {
            try {
              const cat = data?.category_scores as Record<string, { count?: number }> | undefined;
              const getCount = (key: string) => (cat?.[key]?.count ?? 5);
              const avg = (key: string, val: number) => (domainCount <= 6 && cat ? val / (getCount(key) || 1) : val / 5);
              const diagnosisSummaryCache = !preRes.error && data
                ? {
                    domain1: avg("domain1", (data.domain1 as number) ?? 0),
                    domain2: avg("domain2", (data.domain2 as number) ?? 0),
                    domain3: avg("domain3", (data.domain3 as number) ?? 0),
                    domain4: avg("domain4", (data.domain4 as number) ?? 0),
                    domain5: domainCount >= 5 ? avg("domain5", (data.domain5 as number) ?? 0) : 0,
                    domain6: domainCount >= 6 ? avg("domain6", (data.domain6 as number) ?? 0) : 0,
                    totalScore: (data.total_score as number) ?? 0,
                  }
                : undefined;
              const planGoalsRowInit = planRow as Record<string, string | null | undefined> | null | undefined;
              const PLAN_CATEGORY_LABELS_INIT: Record<string, string> = { training: "마일리지카드1", class_open: "마일리지카드2", community: "마일리지카드3", book_edutech: "마일리지카드4", health: "마일리지카드5", other: "마일리지카드6" };
              const goalsInit = [
                { value: String(planGoalsRowInit?.annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.training },
                { value: String(planGoalsRowInit?.expense_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.class_open },
                { value: String(planGoalsRowInit?.community_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.community },
                { value: String(planGoalsRowInit?.book_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.book_edutech },
                { value: String(planGoalsRowInit?.education_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.health },
                { value: String(planGoalsRowInit?.other_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS_INIT.other },
              ];
              const planFilledRatio = planRow ? getPlanFillRatio(planRow) : 0;
              let categoriesForMileage: CategoryConfigItem[] | undefined;
              if (Array.isArray(catJson.categories) && catJson.categories.length === 6) categoriesForMileage = catJson.categories;
              const planGoals: Record<string, number> = {};
              MILEAGE_CATEGORIES.forEach((c) => {
                const key = PLAN_GOAL_KEYS[c.key];
                const raw = String(planGoalsRowInit?.[key] ?? "").trim();
                planGoals[c.key] = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
              });
              let healthGoalUnit: "시간" | "거리" = (planGoalsRowInit?.education_annual_goal_unit === "거리" ? "거리" : "시간") as "시간" | "거리";
              if (categoriesForMileage?.length === 6) {
                const healthCat = categoriesForMileage.find((c) => c.key === "health");
                if (healthCat?.unit === "km") healthGoalUnit = "거리";
                else if (healthCat?.unit === "시간") healthGoalUnit = "시간";
              }
              const { categories, overallProgress } = computeMileageProgress(
                mileageRows as { content: string; category: string }[],
                planGoals,
                healthGoalUnit,
                categoriesForMileage
              );
              const diagnosisRadarLabelsCache = Array.isArray(diagSettings?.domains) && diagSettings.domains.length >= 2 && diagSettings.domains.length <= 6
                ? diagSettings.domains.map((d, i) => (d?.name ?? "").trim() || (DEFAULT_DIAGNOSIS_DOMAINS[i]?.name ?? ""))
                : DEFAULT_DIAGNOSIS_DOMAINS.map((d) => d.name);
              const pointsJ = payload.points;
              sessionStorage.setItem(
                CACHE_KEY,
                JSON.stringify({
                  ts: Date.now(),
                  email: user.email,
                  diagnosisSummary: diagnosisSummaryCache,
                  hasPostDiagnosis: !!postRes.data,
                  planCompleted: planFilledRatio >= 0.7,
                  mileageStarted: mileageRows.length > 0,
                  mileageSummary: { overallProgress, categories },
                  relativeDifficulty: payload.relativeDifficulty ?? null,
                  totalPoints: typeof pointsJ?.total === "number" ? pointsJ.total : null,
                  pointsDetail: typeof pointsJ?.total === "number" ? { base: pointsJ.base ?? 100, login: pointsJ.login ?? 0, mileage: pointsJ.mileage ?? 0, total: pointsJ.total } : null,
                  mileagePointItems: Array.isArray(pointsJ?.mileageBreakdown) ? pointsJ.mileageBreakdown : [],
                  diagnosisRadarLabels: diagnosisRadarLabelsCache,
                  schoolCategories: categoriesForMileage ?? null,
                  planMissingGoals: goalsInit.filter((g) => !g.value).map((g) => g.label),
                })
              );
            } catch {
              // ignore
            }
          }
        } finally {
          setIsLoadingDiagnosis(false);
        }
      }

      if (adminTeachersPromise) {
        setIsLoadingTeachers(true);
        setTeachersError(null);
        adminTeachersPromise
          .then(({ ok, json }: { ok: boolean; json: { error?: string; teachers?: typeof teacherSummaries } }) => {
            if (!ok) throw new Error(json.error || "교원 목록을 불러오지 못했습니다.");
            setTeacherSummaries(Array.isArray(json.teachers) ? json.teachers : []);
          })
          .catch((error) => {
            console.error(error);
            setTeachersError(
              error instanceof Error
                ? error.message
                : "교원 목록을 불러오지 못했습니다."
            );
            setTeacherSummaries([]);
          })
          .finally(() => setIsLoadingTeachers(false));
      }
    };

    checkSession();
  }, [router]);

  // 개인정보(이름 등) 수정 후 우측 상단 표시 갱신: 포커스 시·auth 업데이트 시 사용자 재조회
  useEffect(() => {
    if (isChecking) return;
    const refreshUserMetadata = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const meta = (u.user_metadata as { name?: string; schoolName?: string; gradeClass?: string; schoolLevel?: string; role?: string }) ?? {};
      let schoolName = meta.schoolName ?? null;
      let gradeClass = meta.gradeClass ?? meta.schoolLevel ?? null;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const res = await fetch("/api/account/profile-overrides", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          });
          if (res.ok) {
            const overrides = (await res.json()) as { schoolName?: string | null; gradeClass?: string | null };
            if (overrides.schoolName != null && overrides.schoolName !== "") schoolName = overrides.schoolName;
            if (overrides.gradeClass != null) gradeClass = overrides.gradeClass;
          }
        } catch {
          // ignore
        }
      }
      setUserName(meta.name ?? u.email ?? null);
      setUserSchool(schoolName);
      setUserGradeClass(gradeClass);
      setUserRole(meta.role === "admin" || meta.role === "teacher" ? meta.role : null);
    };
    const onFocus = () => { refreshUserMetadata(); };
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "USER_UPDATED") refreshUserMetadata();
    });
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
      subscription?.unsubscribe();
    };
  }, [isChecking]);

  // 관리자 설정 단위 로드 (항상 로드하여 마일리지 카드에 반영)
  useEffect(() => {
    if (!userSchool) return;
    const loadSchoolCategories = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      
      try {
        const res = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j.categories) && j.categories.length === 6) {
            setSchoolCategories(j.categories);
            // localStorage에도 저장
            localStorage.setItem(`teacher_mate_category_settings_${userSchool}`, JSON.stringify(j.categories));
            // 마일리지 요약 다시 계산
            if (currentUserEmail) {
              const { data: mileageRows } = await supabase
                .from("mileage_entries")
                .select("id, content, category")
                .eq("user_email", currentUserEmail);
              const { data: planRow } = await supabase
                .from("development_plans")
                .select("annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, education_annual_goal_unit, other_annual_goal")
                .eq("user_email", currentUserEmail)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              const planGoalsRowRefresh = planRow as Record<string, string | null | undefined> | null | undefined;
              const planGoals: Record<string, number> = {};
              MILEAGE_CATEGORIES.forEach((c) => {
                const key = PLAN_GOAL_KEYS[c.key];
                const raw = String(planGoalsRowRefresh?.[key] ?? "").trim();
                planGoals[c.key] = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
              });
              let healthGoalUnitForRefresh: "시간" | "거리" = (planGoalsRowRefresh?.education_annual_goal_unit === "거리" ? "거리" : "시간") as "시간" | "거리";
              const healthCat = j.categories.find((c: CategoryConfigItem) => c.key === "health");
              if (healthCat?.unit === "km") {
                healthGoalUnitForRefresh = "거리";
              } else if (healthCat?.unit === "시간") {
                healthGoalUnitForRefresh = "시간";
              }
              const { categories: refreshedCategories, overallProgress: refreshedProgress } = computeMileageProgress(
                (mileageRows ?? []) as { content: string; category: string }[],
                planGoals,
                healthGoalUnitForRefresh,
                j.categories
              );
              setMileageSummary({ overallProgress: refreshedProgress, categories: refreshedCategories });
            }
          }
        }
      } catch {
        // API 실패 시 localStorage 확인
        try {
          const cached = localStorage.getItem(`teacher_mate_category_settings_${userSchool}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length === 6) {
              setSchoolCategories(parsed);
            }
          }
        } catch {
          // ignore
        }
      }
    };

    // 초기 데이터는 checkSession에서 이미 로드하므로, 즉시 재요청 대신 15초 후·이후 60초마다 재조회 (가벼운 폴링)
    const timeout = setTimeout(loadSchoolCategories, 15000);
    const interval = setInterval(loadSchoolCategories, 60000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [userSchool, currentUserEmail]);

  // 관리자: 포인트·영역 설정 열었을 때 API에서 로드 (없으면 localStorage fallback)
  useEffect(() => {
    if (!showPointSettings || !showAdminView || !userSchool) return;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        try {
          const res = await fetch("/api/points/school-settings", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const j = await res.json();
            if (j.settings && typeof j.settings === "object") {
              const defaultSettings = {
                training: 1,
                class_open: 1,
                community: 1,
                book_edutech: 1,
                health: 1,
                other: 1,
                login_points: 2,
              };
              const settings = { ...defaultSettings, ...j.settings };
              setPointSettings(settings);
              setPointSettingsSaved(settings);
            }
            if (Array.isArray(j.categories) && j.categories.length > 0) {
              const merged = DEFAULT_CATEGORIES.map((d) => {
                const c = j.categories.find((x: CategoryConfigItem) => x && x.key === d.key);
                return c ? { key: d.key, label: String(c.label ?? d.label).trim() || d.label, unit: UNIT_OPTIONS.includes(c.unit) ? c.unit : d.unit } : d;
              });
              setCategoryConfig(merged);
              setCategoryConfigSaved(merged);
              setSchoolCategories(merged); // 마일리지 카드에도 즉시 반영
              // localStorage에도 저장
              localStorage.setItem(`teacher_mate_category_settings_${userSchool}`, JSON.stringify(merged));
            }
            return;
          }
        } catch {
          // fallback
        }
      }
      try {
        const raw = localStorage.getItem(`teacher_mate_point_settings_${userSchool}`);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, number>;
          const defaultSettings = {
            training: 1,
            class_open: 1,
            community: 1,
            book_edutech: 1,
            health: 1,
            other: 1,
            login_points: 2,
          };
          const settings = { ...defaultSettings, ...parsed };
          setPointSettings(settings);
          setPointSettingsSaved(settings);
        }
      } catch {
        // ignore
      }
    };
    load();
  }, [showPointSettings, userRole, userSchool]);

  // 관리자: 사전/사후검사 설정 열었을 때 API에서 로드 (설문 제목 포함)
  useEffect(() => {
    if (!showDiagnosisSettings || !showAdminView || !userSchool) return;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (j.useSurvey && j.survey?.domains?.length >= 2 && j.survey?.domains?.length <= 6) {
            const title = typeof j.title === "string" ? j.title : "";
            setDiagnosisSurveyCurrent({
              questionCount: j.survey.questions?.length ?? 0,
              domains: j.survey.domains.map((d: { name: string }) => d.name),
              title,
            });
            setDiagnosisSurveyTitle(title);
            setDiagnosisUploadFileName(typeof j.uploadFileName === "string" ? j.uploadFileName : "");
          } else {
            setDiagnosisSurveyCurrent(null);
            setDiagnosisUploadFileName("");
          }
          const resAdmin = await fetch("/api/admin/diagnosis-settings", { headers: { Authorization: `Bearer ${token}` } });
          if (resAdmin.ok) {
            const a = await resAdmin.json();
            if (Array.isArray(a.domains) && a.domains.length === 6) {
              setDiagnosisDomains(a.domains);
              setDiagnosisDomainsSaved(a.domains);
            }
            setDiagnosisTitle(typeof a.title === "string" ? a.title : "");
            setDiagnosisTitleSaved(typeof a.title === "string" ? a.title : "");
          }
          const titleRes = await fetch("/api/admin/diagnosis-title", { headers: { Authorization: `Bearer ${token}` } });
          if (titleRes.ok) {
            const titleJson = await titleRes.json();
            if (typeof titleJson.title === "string") setDiagnosisSurveyTitle(titleJson.title);
          }
        }
      } catch {
        // ignore
      }
    };
    load();
  }, [showDiagnosisSettings, showAdminView, userSchool]);

  // AI 프롬프트 설정 열 때 로드
  useEffect(() => {
    if (!showAiPromptSettings || !showAdminView) return;
    const load = async () => {
      setAiPromptSettingsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch("/api/ai-prompt-settings", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (j.prompts && typeof j.prompts === "object") {
            setAiPromptSettings(j.prompts);
          }
        }
      } catch {
        // ignore
      } finally {
        setAiPromptSettingsLoading(false);
      }
    };
    load();
  }, [showAiPromptSettings, showAdminView]);

  // AI 프롬프트 입력칸: {{변수명}} 빨간색 하이라이트용 ref
  const promptMirrorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const promptTaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const highlightPlaceholders = (str: string) => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    const re = /\{\{\w+\}\}/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      parts.push(str.slice(last, m.index));
      parts.push(<span key={`ph-${m.index}`} className="text-red-600 font-medium">{m[0]}</span>);
      last = m.index + m[0].length;
    }
    parts.push(str.slice(last));
    return parts;
  };
  // 외부 클릭 시 설정 닫기
  const settingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if ((showPointSettings || showDiagnosisSettings || showAiPromptSettings) && settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowPointSettings(false);
        setShowDiagnosisSettings(false);
        setShowAiPromptSettings(false);
      }
    };
    if (showPointSettings || showDiagnosisSettings || showAiPromptSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPointSettings, showDiagnosisSettings, showAiPromptSettings]);

  const savePointAndCategorySettings = async (overrides?: { settings?: Record<string, number>; categories?: CategoryConfigItem[] }) => {
    const settings = overrides?.settings ?? pointSettings;
    const categories = overrides?.categories ?? categoryConfigSaved;
    if (!userSchool) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    try {
      localStorage.setItem(`teacher_mate_point_settings_${userSchool}`, JSON.stringify(settings));
      await fetch("/api/points/school-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings, categories }),
      });
    } catch {
      // ignore
    }
  };

  // 계획서 저장 후 대시보드 돌아왔을 때 카드 활성화 반영 (포커스/가시성 시 재조회)
  useEffect(() => {
    if (!showTeacherView) return;
    const MILEAGE_CATS = [
      { key: "training", label: "마일리지카드1" },
      { key: "class_open", label: "마일리지카드2" },
      { key: "community", label: "마일리지카드3" },
      { key: "book_edutech", label: "마일리지카드4" },
      { key: "health", label: "마일리지카드5" },
      { key: "other", label: "마일리지카드6" },
    ];
    const PLAN_KEYS: Record<string, string> = {
      training: "annual_goal", class_open: "expense_annual_goal", community: "community_annual_goal",
      book_edutech: "book_annual_goal", health: "education_annual_goal", other: "other_annual_goal",
    };
    // 학교 설정 영역명을 재조회하여 사용할 카테고리 배열 (필요 시 나중에 채움)
    let categoriesForRefetch: CategoryConfigItem[] | undefined;
    const refetchPlan = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data: planRow } = await supabase
        .from("development_plans")
        .select("development_goal, expected_outcome, training_plans, education_plans, book_plans, expense_requests, community_plans, other_plans, annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, education_annual_goal_unit, other_annual_goal")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ratio = planRow ? getPlanFillRatio(planRow as PlanRow) : 0;
      setPlanCompleted(ratio >= 0.7);
      const missingItems: string[] = [];
      const planGoalsRow = planRow as Record<string, string | null | undefined> | null | undefined;
      // 연간 목표량 검증 (학교에서 설정한 영역명 우선 사용)
      const getPlanLabelForKey = (key: string, cats?: CategoryConfigItem[]): string => {
        const fromCategory = cats?.find((c) => c.key === key)?.label;
        if (fromCategory && fromCategory.trim()) return fromCategory.trim();
        const defaults: Record<string, string> = {
          training: "마일리지카드1",
          class_open: "마일리지카드2",
          community: "마일리지카드3",
          book_edutech: "마일리지카드4",
          health: "마일리지카드5",
          other: "마일리지카드6",
        };
        return defaults[key] ?? key;
      };
      const PLAN_CATEGORY_LABELS: Record<string, string> = {
        training: getPlanLabelForKey("training", categoriesForRefetch),
        class_open: getPlanLabelForKey("class_open", categoriesForRefetch),
        community: getPlanLabelForKey("community", categoriesForRefetch),
        book_edutech: getPlanLabelForKey("book_edutech", categoriesForRefetch),
        health: getPlanLabelForKey("health", categoriesForRefetch),
        other: getPlanLabelForKey("other", categoriesForRefetch),
      };
      const goals = [
        { key: "training", value: String(planGoalsRow?.annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS.training },
        { key: "class_open", value: String(planGoalsRow?.expense_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS.class_open },
        { key: "community", value: String(planGoalsRow?.community_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS.community },
        { key: "book_edutech", value: String(planGoalsRow?.book_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS.book_edutech },
        { key: "health", value: String(planGoalsRow?.education_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS.health },
        { key: "other", value: String(planGoalsRow?.other_annual_goal ?? "").trim(), label: PLAN_CATEGORY_LABELS.other },
      ];
      goals.forEach((goal) => {
        if (!goal.value) {
          missingItems.push(goal.label);
        }
      });
      setPlanMissingGoals(missingItems);
      
      const { data: mileageRows } = await supabase
        .from("mileage_entries")
        .select("id, content, category")
        .eq("user_email", user.email);
      // 마일리지 데이터가 있으면 무조건 실시중으로 표시
      const hasMileageData = (mileageRows ?? []).length > 0;
      if (hasMileageData) {
        setMileageStarted(true);
      }
      // 포커스/재조회 시에도 관리자 설정 영역명 사용 (기본 영역명이 잠깐 보이는 현상 방지)
      const { data: { session: sessionRefetch } } = await supabase.auth.getSession();
      if (sessionRefetch?.access_token) {
        try {
          const catRes = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${sessionRefetch.access_token}` } });
          if (catRes.ok) {
            const catJson = await catRes.json();
            if (Array.isArray(catJson.categories) && catJson.categories.length === 6) {
              categoriesForRefetch = catJson.categories as CategoryConfigItem[];
              setSchoolCategories(categoriesForRefetch);
              if (userSchool) {
                localStorage.setItem(`teacher_mate_category_settings_${userSchool}`, JSON.stringify(categoriesForRefetch));
              }
            }
          }
        } catch {
          // ignore
        }
      }
      if (!categoriesForRefetch && schoolCategories.length === 6) {
        categoriesForRefetch = schoolCategories;
      }
      // planGoalsRow는 위에서 이미 정의됨 (523번 줄)
      const planGoals: Record<string, number> = {};
      MILEAGE_CATS.forEach((c) => {
        const key = PLAN_KEYS[c.key];
        const raw = String(planGoalsRow?.[key] ?? "").trim();
        planGoals[c.key] = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
      });
      const healthGoalUnit = (planGoalsRow?.education_annual_goal_unit === "거리" ? "거리" : "시간") as "시간" | "거리";
      // healthGoalUnit은 관리자 설정 단위를 우선 사용, 없으면 plan에서 가져옴
      let healthGoalUnitForCompute: "시간" | "거리" = healthGoalUnit;
      if (categoriesForRefetch?.length === 6) {
        const healthCat = categoriesForRefetch.find(c => c.key === "health");
        if (healthCat?.unit === "km") {
          healthGoalUnitForCompute = "거리";
        } else if (healthCat?.unit === "시간") {
          healthGoalUnitForCompute = "시간";
        }
      }
      const catsToUse = categoriesForRefetch ?? (schoolCategories.length === 6 ? schoolCategories : undefined);
      const { categories, overallProgress } = computeMileageProgress(
        (mileageRows ?? []) as { content: string; category: string }[],
        planGoals,
        healthGoalUnitForCompute,
        catsToUse
      );
      // 관리자 설정 영역이 있을 때만 반영 (기본 영역명이 잠깐 보이는 현상 방지)
      if (catsToUse?.length === 6) {
        setMileageSummary({ overallProgress, categories });
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        try {
          const diffRes = await fetch("/api/mileage-relative-difficulty", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          });
          if (diffRes.ok) setRelativeDifficulty(await diffRes.json());
        } catch {
          setRelativeDifficulty(null);
        }
        try {
          const pointsRes = await fetch("/api/points/me", { headers: { Authorization: `Bearer ${token}` } });
          if (pointsRes.ok) {
            const pointsJ = await pointsRes.json();
            if (typeof pointsJ.total === "number") {
              setTotalPoints(pointsJ.total);
              setPointsDetail({
                base: pointsJ.base ?? 100,
                login: pointsJ.login ?? 0,
                mileage: pointsJ.mileage ?? 0,
                total: pointsJ.total,
              });
              setMileagePointItems(Array.isArray(pointsJ.mileageBreakdown) ? pointsJ.mileageBreakdown : []);
            }
          }
        } catch {
          // ignore
        }
      }
      const { data: draftRow } = await supabase
        .from("reflection_drafts")
        .select("goal_achievement_text, reflection_text")
        .eq("user_email", user.email)
        .maybeSingle();
      const emailKey = user.email ?? "";
      const goalFromDb = String(draftRow?.goal_achievement_text ?? "").trim();
      const reflectionFromDb = String(draftRow?.reflection_text ?? "").trim();
      const goalFromLocal = typeof window !== "undefined" ? (localStorage.getItem("teacher_mate_goal_achievement_" + emailKey) ?? "").trim() : "";
      const reflectionFromLocal = typeof window !== "undefined" ? (localStorage.getItem("teacher_mate_reflection_text_" + emailKey) ?? "").trim() : "";
      const goalAchievementFilled = (goalFromDb || goalFromLocal) !== "";
      const reflectionFilled = (reflectionFromDb || reflectionFromLocal) !== "";
      const { data: nextYearRow } = await supabase
        .from("user_preferences")
        .select("pref_value")
        .eq("user_email", user.email)
        .eq("pref_key", "reflection_next_year_goal")
        .maybeSingle();
      const nextYearFilled = String(nextYearRow?.pref_value ?? "").trim() !== "";
      // 증빙자료를 제외한 다른 자료(목표 달성도, 성찰, 내년 목표) 중 하나라도 있으면 실시완료
      setReflectionDone(goalAchievementFilled || reflectionFilled || nextYearFilled);
    };
    const onFocus = () => {
      refetchPlan();
      if (typeof window !== "undefined") {
        setMileageStarted(localStorage.getItem("teacher_mate_mileage_started") === "1");
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refetchPlan();
        if (typeof window !== "undefined") {
          setMileageStarted(localStorage.getItem("teacher_mate_mileage_started") === "1");
        }
      }
    };
    refetchPlan();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userRole]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMileageStarted(localStorage.getItem("teacher_mate_mileage_started") === "1");
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(error.message);
      return;
    }

    alert("로그아웃 되었습니다.");
    router.push("/");
  };

  const handleAdminResetPassword = async (userId: string, teacherName: string) => {
    if (!confirm(`해당 회원의 비밀번호를 123456으로 초기화할까요?\n(${teacherName || "회원"})`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      alert("로그인 세션이 없습니다. 다시 로그인해 주세요.");
      return;
    }
    setResettingPasswordId(userId);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j?.error ?? "비밀번호 초기화에 실패했습니다.");
        return;
      }
      alert("비밀번호가 123456으로 초기화되었습니다.");
    } catch (e) {
      console.error(e);
      alert("요청 중 오류가 발생했습니다.");
    } finally {
      setResettingPasswordId(null);
    }
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">
          사용자 정보를 확인하는 중입니다...
        </p>
      </div>
    );
  }


  return (
    <div className="min-h-[calc(100vh-40px)] bg-white px-4 py-6 md:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              <span className="text-sm font-semibold tracking-tight text-slate-800">
                <span className="text-orange-500">N</span>
                <span className="mx-0.5 inline-block h-0.5 w-0.5 shrink-0 rounded-sm bg-slate-400 align-middle" aria-hidden />
                <span className="text-amber-800">A</span>
                <span className="mx-0.5 inline-block h-0.5 w-0.5 shrink-0 rounded-sm bg-slate-400 align-middle" aria-hidden />
                <span className="text-rose-500">V</span>
                <span className="mx-0.5 inline-block h-0.5 w-0.5 shrink-0 rounded-sm bg-slate-400 align-middle" aria-hidden />
                <span className="text-blue-800">i</span>
                <span className="text-slate-700">로 찾아가는 목적지</span>
              </span>
            </div>
            <p className="text-xs text-slate-600">
              참여와 협력을 바탕으로 하는 교원 역량개발지원
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3 text-xs text-slate-600">
            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-lg border-violet-300 bg-violet-50 px-3 text-xs font-medium text-violet-700 hover:bg-violet-100"
                onClick={() => {
                  const newMode = viewMode === "admin" ? "teacher" : "admin";
                  setViewMode(newMode);
                  // localStorage에 저장하여 페이지 새로고침 후에도 유지
                  if (typeof window !== "undefined") {
                    localStorage.setItem("teacher_mate_admin_view_mode", newMode);
                  }
                }}
              >
                {viewMode === "admin" ? "교원 모드로 전환" : "관리자 모드로 전환"}
              </Button>
            )}
            <button
              type="button"
              onClick={() => router.push("/account")}
              title="회원 정보 보기 / 변경"
              className="text-left hover:text-slate-900"
            >
              {userSchool && <span>{userSchool}</span>}
              {userSchool && userName && <span className="mx-1">|</span>}
              {userName && <span className="font-medium text-blue-600">{maskDisplayName(userName)}</span>}
              {userName && <span> 님</span>}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-slate-600 hover:text-slate-800"
            >
              로그아웃
            </button>
          </div>
        </header>

        <div className="-mt-[6mm] mb-2 w-full border-b-2 border-slate-300/80" aria-hidden />

        <main className="flex flex-col gap-6 md:flex-row md:items-stretch">
          {/* 교원 대시보드 (교원이거나 관리자가 교원 모드로 전환한 경우) */}
          {showTeacherView && (
            <>
              {/* 왼쪽: 사용자 정보 + 진단 + 계획 (가로는 오른쪽보다 짧게) */}
              <div className="flex w-full flex-col gap-4 md:w-[38%] md:min-w-0 md:flex-shrink-0">
                <Card className="overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-violet-200/85 via-violet-300/60 to-indigo-300/70 p-4 shadow-md ring-1 ring-violet-300/50">
                  <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes dashboard-car-float {
                      0%, 100% { transform: translateY(0); }
                      50% { transform: translateY(-3px); }
                    }
                    @keyframes dashboard-road-scroll {
                      0% { background-position: 0 0; }
                      100% { background-position: -12px 0; }
                    }
                  `}} />
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md">
                      <span className="text-lg font-bold leading-none">
                        {(userName ?? "?")[0]}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-violet-800">
                        {userSchool ?? "소속"}
                      </p>
                      <p className="mt-0.5 truncate text-lg font-extrabold text-violet-900 drop-shadow-sm">
                        {[userGradeClass, maskDisplayName(userName)].filter(Boolean).join(" ")}{userName ? " 선생님" : "선생님"}
                      </p>
                    </div>
                    <div className="relative hidden h-14 flex-shrink-0 overflow-hidden sm:block sm:w-28">
                      <div
                        className="absolute left-0 right-0 h-[2px] rounded-full bg-slate-200/90"
                        style={{
                          bottom: "calc(4px - 1mm)",
                          backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 4px, rgb(148 163 184 / 0.85) 4px, rgb(148 163 184 / 0.85) 10px)",
                          backgroundSize: "12px 100%",
                          animation: "dashboard-road-scroll 2.24s linear infinite",
                        }}
                      />
                      <div
                        className="absolute left-[calc(50%-0.5rem)] flex -translate-x-1/2 items-center justify-center"
                        style={{ bottom: "-1mm", animation: "dashboard-car-float 1.5s ease-in-out infinite" }}
                      >
                        <svg width="50" height="29" viewBox="0 0 28 16" fill="none" className="drop-shadow-sm" style={{ transform: "scaleX(-1) scale(0.8)", transformOrigin: "center" }} aria-hidden>
                          <rect x="2" y="6" width="20" height="6" rx="2" fill="#6366f1" />
                          <path d="M6 6 L8 2 L18 2 L20 6" fill="#818cf8" />
                          <circle cx="7" cy="12" r="2.5" fill="#334155" />
                          <circle cx="17" cy="12" r="2.5" fill="#334155" />
                          <circle cx="7" cy="12" r="1" fill="#94a3b8" />
                          <circle cx="17" cy="12" r="1" fill="#94a3b8" />
                          <circle cx="14" cy="8" r="1.2" fill="#c7d2fe" />
                        </svg>
                      </div>
                      {showTeacherView && (
                        <button
                          type="button"
                          onClick={() => {
                            setPointsDetailOwner({ name: maskDisplayName(userName) ?? "", isAdminSelf: userRole === "admin" });
                            setShowMileageDetail(true);
                          }}
                          className="absolute right-0 flex items-baseline justify-end gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ bottom: "calc(32px - 1mm)", animation: "dashboard-car-float 1.5s ease-in-out infinite" }}
                        >
                          <span className="text-[calc(1.8em*0.75)] font-semibold text-violet-900 whitespace-nowrap leading-none">
                            {(totalPoints ?? 0).toLocaleString()}
                          </span>
                          <span className="text-[calc(0.9em*0.75)] font-semibold text-violet-900 whitespace-nowrap leading-none">
                            P
                          </span>
                        </button>
                      )}
                      <div className="absolute right-0 flex flex-col items-center" style={{ bottom: "calc(0.5rem - 1mm)" }} aria-hidden>
                        <svg width="12" height="18" viewBox="0 0 12 18" fill="none" className="drop-shadow-sm">
                          <rect x="5" y="4" width="2" height="14" fill="#78716c" />
                          <path d="M7 4 L7 11 L12 7.5 Z" fill="#dc2626" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Card>

              <Card className="group min-h-[210px] rounded-2xl border-0 ring-1 ring-violet-200/50 bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-indigo-50/70 p-4 shadow-sm backdrop-blur-sm flex flex-col justify-between transition-all hover:shadow-md hover:-translate-y-0.25 hover:from-violet-100/80 hover:via-violet-50/60 hover:to-indigo-100/70">
                <div className="relative flex flex-col gap-3">
                  <span className="absolute left-1 -top-2 text-[43px] font-extrabold text-white/40 select-none pointer-events-none leading-none drop-shadow-sm [text-shadow:0_1px_2px_rgba(255,255,255,0.8)]" aria-hidden>1</span>
                  <div className="flex w-full justify-end">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          diagnosisSummary
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                            : "bg-slate-50 text-slate-500 border border-slate-100"
                        }`}
                      >
                        {diagnosisSummary ? "실시완료" : "미실시"}
                      </span>
                      <div className="rounded-2xl bg-indigo-50 p-2 text-indigo-500 group-hover:bg-indigo-100">
                        <ClipboardCheck className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
                      (사전) 교원 역량 진단
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      나의 전문성과 역량을 진단합니다.
                    </p>
                  </div>
                </div>

                <div className="mt-3 h-[220px] w-full">
                  {isLoadingDiagnosis ? (
                    <p className="text-[11px] text-slate-400">
                      진단 결과를 불러오는 중입니다...
                    </p>
                  ) : !diagnosisSummary ? (
                    <p className="text-[11px] text-slate-400">
                      아직 진단 결과가 없습니다. 아래 버튼을 눌러 첫 진단을
                      시작해 보세요.
                    </p>
                  ) : (
                    <DashboardDiagnosisRadar
                      data={diagnosisRadarLabels.slice(0, 6).map((name, i) => ({
                        name,
                        score: [
                          diagnosisSummary.domain1,
                          diagnosisSummary.domain2,
                          diagnosisSummary.domain3,
                          diagnosisSummary.domain4,
                          diagnosisSummary.domain5,
                          diagnosisSummary.domain6,
                        ][i] ?? 0,
                      }))}
                    />
                  )}
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  <div className="relative group">
                    <Link href="/diagnosis/result">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!diagnosisSummary}
                        title={!diagnosisSummary ? "먼저 실시완료 하세요" : undefined}
                        className="rounded-full border-slate-300 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        결과 보기
                      </Button>
                    </Link>
                  </div>
                  <Link href="/diagnosis">
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] px-4 text-[11px] font-semibold text-white shadow-sm hover:shadow-md hover:opacity-95"
                    >
                      {diagnosisSummary ? "다시 실시하기" : "실시하기"}
                    </Button>
                  </Link>
                </div>
              </Card>

              <div className="relative h-[180px] isolate">
                {!diagnosisSummary && (
                  <div className="absolute inset-0 z-[50] rounded-2xl bg-slate-200/50 backdrop-blur-[0.5px]" aria-hidden role="presentation" />
                )}
                <Card
                  className={`group h-full rounded-2xl p-4 shadow-sm backdrop-blur-sm flex flex-col justify-between transition-all ${
                    diagnosisSummary
                      ? "relative border-0 ring-1 ring-violet-200/50 bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-indigo-50/70 hover:shadow-md hover:-translate-y-0.25 hover:from-violet-100/80 hover:via-violet-50/60 hover:to-indigo-100/70"
                      : "relative z-0 pointer-events-none border-slate-300 bg-slate-200/70 text-slate-500 saturate-0"
                  }`}
                >
                  <div className="relative flex min-h-0 flex-1 flex-col gap-3">
                    <span className="absolute left-1 -top-2 text-[43px] font-extrabold text-white/40 select-none pointer-events-none leading-none drop-shadow-sm [text-shadow:0_1px_2px_rgba(255,255,255,0.8)]" aria-hidden>2</span>
                    <div className="flex w-full justify-end">
                      <div className="flex items-center gap-2">
<span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              planCompleted
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                              : "bg-slate-50 text-slate-500 border border-slate-100"
                          }`}
                        >
                          {planCompleted ? "실시완료" : "미실시"}
                        </span>
                        <div className="rounded-2xl bg-sky-50 p-2 text-sky-500 group-hover:bg-sky-100">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            <circle cx="12" cy="12" r="2" />
                            <line x1="12" y1="12" x2="21" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            <path d="M21 3 L17 7 L21 6 L22 3 Z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
                        목적지 플래너(자기역량 개발계획서)
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        연간 역량 개발 목표를 세우고 실행 계획을 관리합니다.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <div className="relative group">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={planMissingGoals.length > 0}
                        onClick={() => {
                          if (planMissingGoals.length === 0) {
                            router.push("/plan/print");
                          }
                        }}
                        className="rounded-full border-slate-300 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                        title={planMissingGoals.length > 0 ? "미작성 된 계획이 있어 출력이 불가합니다." : undefined}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        계획서 보기
                      </Button>
                      {planMissingGoals.length > 0 && (
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
                          <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs whitespace-normal">
                            미작성 된 계획이 있어 출력이 불가합니다.
                            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
                          </div>
                        </div>
                      )}
                    </div>
                    <Link href="/plan">
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] px-4 text-[11px] font-semibold text-white shadow-sm hover:shadow-md hover:opacity-95"
                      >
                        계획 작성
                      </Button>
                    </Link>
                  </div>
                </Card>
              </div>

              </div>

              {/* 오른쪽: 목적지 마일리지 + (사후) 교원 역량 진단 + 교사 성찰 기록장 — 2번 완료 시에만 활성화 */}
              <div className="flex w-full flex-1 flex-col gap-4 md:min-w-0 md:w-[60%]">
                <div className="relative flex min-h-0 flex-1 flex-col isolate">
                  {!planCompleted && (
                    <div className="absolute inset-0 z-[50] rounded-2xl bg-slate-200/50 backdrop-blur-[0.5px]" aria-hidden role="presentation" />
                  )}
                  <Card
                    className={`flex min-h-0 flex-1 flex-col rounded-2xl p-3 shadow-sm backdrop-blur-sm transition-all relative ${
                      planCompleted
                        ? "border-0 ring-1 ring-violet-200/50 bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-indigo-50/70 hover:shadow-md hover:-translate-y-0.25 hover:from-violet-100/80 hover:via-violet-50/60 hover:to-indigo-100/70"
                        : "z-0 pointer-events-none border-slate-300 bg-slate-200/70 text-slate-500 saturate-0"
                    }`}
                  >
                    <div className="relative flex flex-col gap-2">
                      <span className="absolute left-1 -top-2 text-[43px] font-extrabold text-white/40 select-none pointer-events-none leading-none drop-shadow-sm [text-shadow:0_1px_2px_rgba(255,255,255,0.8)]" aria-hidden>3</span>
                      <div className="flex w-full justify-end">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              mileageStarted
                                ? "bg-amber-50 text-amber-700 border border-amber-100"
                                : "bg-slate-50 text-slate-500 border border-slate-100"
                            }`}
                          >
                            {mileageStarted ? "실시중" : "미실시"}
                          </span>
                          <div className={`rounded-2xl p-2 ${mileageStarted ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-600"}`}>
                            <Flag className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-4">
                          <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
                            목적지 마일리지
                          </h2>
                        </div>
                        <p className="mt-1 mb-[23px] text-xs text-slate-500">
                          실천한 활동을 마일리지로 적립하며 성장 여정을 기록합니다.
                        </p>
                      </div>
                      {mileageSummary && schoolCategories.length === 6 && (
                        <div className="mt-2 flex flex-col gap-3">
                          {/* 전체 진행률: 나의 마일리지 — 막대 — % (관리자 설정 영역 로드 후에만 표시) */}
                          <div className="flex items-center gap-3 overflow-visible">
                            <span className="shrink-0 text-sm font-medium text-[#333]">성장 여정</span>
                            <div className="relative h-[4.8px] min-w-0 flex-1 overflow-visible rounded-full bg-[#e0e2e7]">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-[#6366f1] transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(0, mileageSummary.overallProgress))}%`, minWidth: mileageSummary.overallProgress > 0 ? 2 : 0 }}
                              />
                              <div
                                className="absolute bottom-full left-0 mb-0.5 flex items-center gap-1 transition-all duration-500"
                                style={{
                                  left: `${Math.min(100, Math.max(0, mileageSummary.overallProgress))}%`,
                                  transform: "translate(-50%, 0)",
                                }}
                              >
                                <div className="rotate-[20deg]">
                                  <Plane className="h-[27px] w-[27px] text-[#6366f1]" strokeWidth={2} />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowMileageDetail(true)}
                                  className="flex items-baseline gap-0.5 cursor-pointer hover:opacity-80 transition-opacity leading-none"
                                  style={{ transform: "translateY(-3mm)" }}
                                >
                                  <span className="text-[calc(1.8em*0.9*0.75*1.2*0.8)] font-semibold text-slate-700 whitespace-nowrap">
                                    {(totalPoints ?? 0).toLocaleString()}
                                  </span>
                                  <span className="text-[calc(1.8em*0.9*0.75*1.2*0.8*2/3)] font-semibold text-slate-700 whitespace-nowrap">
                                    P
                                  </span>
                                </button>
                              </div>
                            </div>
                            <span className="shrink-0 text-sm text-slate-400">{Math.round(mileageSummary.overallProgress)}%</span>
                          </div>
                          {/* 6개 분야별 원그래프 (항목당 1개) */}
                          <div className="mt-[8px]">
                            <div className="grid grid-cols-3 gap-4">
                              {mileageSummary.categories.map((c, i) => {
                                const completed = Math.min(100, Math.max(0, c.progress));
                                const remaining = 100 - completed;
                                const pieData = [
                                  { name: "진행", value: completed, fill: PIE_COLORS[i % PIE_COLORS.length] },
                                  { name: "남음", value: remaining, fill: "var(--tw-slate-200, #e2e8f0)" },
                                ].filter((d) => d.value > 0);
                                const goal = c.goal ?? 0;
                                const sum = c.sum ?? 0;
                                const unit = c.unit ?? "";
                                const progressText = goal > 0 || sum > 0
                                  ? `${Number(sum).toFixed(sum % 1 === 0 ? 0 : 1)}/${goal}${unit ? ` ${unit}` : ""}`
                                  : "";
                                return (
                                  <div key={c.key} className="flex flex-col items-center gap-1">
                                    <div className="relative h-20 w-20 sm:h-24 sm:w-24">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                          <Pie
                                            data={pieData.length ? pieData : [{ name: "진행", value: 0, fill: PIE_COLORS[i % PIE_COLORS.length] }]}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="55%"
                                            outerRadius="95%"
                                            dataKey="value"
                                            strokeWidth={0}
                                            cursor="pointer"
                                          >
                                            {pieData.length ? pieData.map((d, j) => <Cell key={j} fill={d.fill} />) : <Cell fill={PIE_COLORS[i % PIE_COLORS.length]} />}
                                          </Pie>
                                        </PieChart>
                                      </ResponsiveContainer>
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="text-[10px] font-semibold text-slate-600 sm:text-xs">{Math.round(c.progress)}%</span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-medium text-slate-600 leading-tight sm:text-xs">{c.label}</span>
                                    {progressText && (
                                      <span className="text-[10px] text-slate-500 sm:text-xs">
                                        {progressText}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        <Button
                          asChild
                          size="sm"
                          className="shrink-0 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] px-4 text-[11px] font-semibold text-white shadow-sm hover:opacity-95"
                        >
                          <Link href="/dashboard/mileage">
                            {mileageStarted ? "마일리지 관리" : "마일리지 시작하기"}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="relative flex flex-col md:flex-row min-h-[180px] md:h-[180px] shrink-0 gap-3 isolate">
                  {!planCompleted && (
                    <div className="absolute inset-0 z-[50] rounded-2xl bg-slate-200/50 backdrop-blur-[0.5px]" aria-hidden role="presentation" />
                  )}
                  <Card
                    className={`relative z-0 group w-full md:min-w-0 md:flex-1 rounded-2xl p-4 shadow-sm backdrop-blur-sm flex flex-col justify-between transition-all min-h-[160px] md:min-h-0 ${
                      planCompleted
                        ? "border-0 ring-1 ring-violet-200/50 bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-indigo-50/70 hover:shadow-md hover:-translate-y-0.25 hover:from-violet-100/80 hover:via-violet-50/60 hover:to-indigo-100/70"
                        : "pointer-events-none border-slate-300 bg-slate-200/70 text-slate-500 saturate-0"
                    }`}
                  >
                    <div className="relative flex flex-col gap-3 min-w-0">
                      <span className="absolute left-1 -top-2 text-[43px] font-extrabold text-white/40 select-none pointer-events-none leading-none drop-shadow-sm [text-shadow:0_1px_2px_rgba(255,255,255,0.8)]" aria-hidden>4</span>
                      <div className="flex w-full justify-end">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              hasPostDiagnosis
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                : "bg-slate-50 text-slate-500 border border-slate-100"
                            }`}
                          >
                            {hasPostDiagnosis ? "실시완료" : "미실시"}
                          </span>
                          <div className={`rounded-2xl p-2 ${planCompleted ? "bg-indigo-50 text-indigo-500 group-hover:bg-indigo-100" : "bg-indigo-50 text-indigo-500"}`}>
                            <ClipboardCheck className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">(사후) 교원 역량 진단</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          향상된 나의 역량을 진단합니다.
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2 min-w-0">
                        {planCompleted ? (
                          <Link href="/diagnosis/result?type=post" className="shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!hasPostDiagnosis}
                              title={!hasPostDiagnosis ? "먼저 실시완료 하세요" : undefined}
                              className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                            >
                              <Printer className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              결과 보기
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled
                            title="먼저 자기역량개발계획을 실시완료 하세요"
                            className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-700 shadow-sm inline-flex items-center gap-1 opacity-50 cursor-not-allowed"
                          >
                            <Printer className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            결과 보기
                          </Button>
                        )}
                        <Button
                          asChild
                          size="sm"
                          className="shrink-0 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold text-white shadow-sm hover:opacity-95"
                        >
                          <Link href="/diagnosis?type=post">{hasPostDiagnosis ? "다시 실시하기" : "실시하기"}</Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                  <Card
                    className={`relative z-0 group w-full md:min-w-0 md:flex-1 rounded-2xl p-4 shadow-sm backdrop-blur-sm flex flex-col justify-between transition-all min-h-[160px] md:min-h-0 ${
                      planCompleted
                        ? "border-0 ring-1 ring-violet-200/50 bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-indigo-50/70 hover:shadow-md hover:-translate-y-0.25 hover:from-violet-100/80 hover:via-violet-50/60 hover:to-indigo-100/70"
                        : "pointer-events-none border-slate-300 bg-slate-200/70 text-slate-500 saturate-0"
                    }`}
                  >
                    <div className="relative flex flex-col gap-3 min-w-0">
                      <span className="absolute left-1 -top-2 text-[43px] font-extrabold text-white/40 select-none pointer-events-none leading-none drop-shadow-sm [text-shadow:0_1px_2px_rgba(255,255,255,0.8)]" aria-hidden>5</span>
                      <div className="flex w-full justify-end">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              reflectionDone ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-50 text-slate-500 border border-slate-100"
                            }`}
                          >
                            {reflectionDone ? "실시완료" : "미실시"}
                          </span>
                          <div className={`rounded-2xl p-2 ${planCompleted ? "bg-violet-50 text-violet-500 group-hover:bg-violet-100" : "bg-violet-50 text-violet-500"}`}>
                            <NotebookPen className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">목적지 Report(교사 성찰 기록)</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          자기역량 개발 결과 보고서를 완성합니다.
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2 min-w-0">
                        {planCompleted ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!reflectionDone}
                            title={!reflectionDone ? "먼저 실시완료 하세요" : undefined}
                            className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                            onClick={() => reflectionDone && (window.location.href = "/reflection/result-report")}
                          >
                            <Printer className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            결과 보기
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled
                            title="먼저 자기역량개발계획을 실시완료 하세요"
                            className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-700 shadow-sm inline-flex items-center gap-1 opacity-50 cursor-not-allowed"
                          >
                            <Printer className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            결과 보기
                          </Button>
                        )}
                        <Button
                          asChild
                          size="sm"
                          className="shrink-0 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold text-white shadow-sm hover:opacity-95"
                        >
                          <Link href="/reflection">관리하기</Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </>
          )}

          {showAdminView && (
            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-base font-semibold text-slate-800">{userSchool ? `${userSchool} 관리자 페이지` : "관리자 페이지"}</p>
                  {showAdminView && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit rounded-lg border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          if (!showPointSettings && !window.confirm("기존 데이터에 심각한 오류가 발생될 수 있습니다. 계속 하시겠습니까?")) return;
                          setShowDiagnosisSettings(false);
                          setShowPointSettings((v) => !v);
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Settings className="h-3.5 w-3.5" />
                          설정 (영역 / 포인트&마일리지)
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit rounded-lg border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          if (!showDiagnosisSettings && !window.confirm("기존 데이터에 심각한 오류가 발생될 수 있습니다. 계속 하시겠습니까?")) return;
                          setShowPointSettings(false);
                          setShowDiagnosisSettings((v) => !v);
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          사전/사후검사 설정
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit rounded-lg border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          setShowPointSettings(false);
                          setShowDiagnosisSettings(false);
                          setShowAiPromptSettings((v) => !v);
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5" />
                          AI 프롬프트 설정
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit rounded-lg border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                        disabled={resettingAllData}
                        onClick={async () => {
                          if (!userSchool) return;
                          const msg = "해당 학교 모든 구성원의 데이터(진단·계획·마일리지·성찰·포인트 등)가 삭제됩니다. 복구할 수 없습니다. 정말 초기화하시겠습니까?";
                          if (!confirm(msg)) return;
                          setResettingAllData(true);
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            const token = session?.access_token;
                            if (!token) {
                              alert("로그인 세션이 없습니다.");
                              return;
                            }
                            const res = await fetch("/api/admin/reset-all-data", {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            const j = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              alert(j?.error ?? "초기화에 실패했습니다.");
                              return;
                            }
                            alert(`초기화 완료. ${j.memberCount ?? 0}명의 데이터를 삭제했습니다.`);
                            window.location.reload();
                          } finally {
                            setResettingAllData(false);
                          }
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Trash2 className="h-3.5 w-3.5" />
                          {resettingAllData ? "처리 중..." : "모든 구성원 데이터 초기화"}
                        </span>
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">정렬</span>
                <select
                  value={adminSortBy}
                  onChange={(e) => setAdminSortBy(e.target.value as "createdAt" | "name" | "gradeClass")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="createdAt">가입일 순</option>
                  <option value="name">성명순</option>
                  <option value="gradeClass">학년 반</option>
                </select>
                </div>
              </div>

              {showAdminView && (showPointSettings || showDiagnosisSettings || showAiPromptSettings) && (
                <div ref={settingsRef} className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                  {showAiPromptSettings && (
                  <Card className="rounded-xl border-slate-200/80 bg-slate-50/50 p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">AI 프롬프트 설정</p>
                        <p className="mt-0.5 text-xs text-slate-500">각 항목별 AI 프롬프트를 수정할 수 있습니다. <span className="font-medium text-red-600">{"{{변수명}}"} 형태의 플레이스홀더는 삭제하지 마세요.</span></p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                          disabled={aiPromptSettingsLoading || aiPromptSettingsSaving}
                          onClick={async () => {
                            const { data: { session } } = await supabase.auth.getSession();
                            const token = session?.access_token;
                            if (!token) return;
                            setAiPromptSettingsSaving(true);
                            try {
                              const res = await fetch("/api/ai-prompt-settings", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ loadDefaults: true }),
                              });
                              if (res.ok) {
                                const next: Record<string, { value: string; description: string; label: string }> = {};
                                AI_PROMPT_KEYS.forEach((key) => {
                                  const def = AI_PROMPT_DEFAULTS[key];
                                  next[key] = { value: def.template, description: def.description, label: def.label };
                                });
                                setAiPromptSettings(next);
                                alert("모든 프롬프트를 기본값으로 복원하여 저장했습니다.");
                              } else {
                                const j = await res.json().catch(() => ({}));
                                alert(j?.error ?? "기본값 불러오기 실패");
                              }
                            } finally {
                              setAiPromptSettingsSaving(false);
                            }
                          }}
                        >
                          모두 기본값으로 불러오기
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
                          disabled={aiPromptSettingsLoading || aiPromptSettingsSaving}
                          onClick={async () => {
                            const { data: { session } } = await supabase.auth.getSession();
                            const token = session?.access_token;
                            if (!token) return;
                            setAiPromptSettingsSaving(true);
                            try {
                              const prompts: Record<string, string> = {};
                              AI_PROMPT_KEYS.forEach((key) => {
                                const cur = aiPromptSettings[key];
                                if (cur?.value != null) prompts[key] = cur.value;
                              });
                              const res = await fetch("/api/ai-prompt-settings", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ prompts }),
                              });
                              if (res.ok) {
                                alert("저장되었습니다.");
                              } else {
                                const j = await res.json().catch(() => ({}));
                                alert(j?.error ?? "저장 실패");
                              }
                            } finally {
                              setAiPromptSettingsSaving(false);
                            }
                          }}
                        >
                          {aiPromptSettingsSaving ? "저장 중..." : "저장"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowAiPromptSettings(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {AI_PROMPT_KEYS.map((key) => {
                        const meta = aiPromptSettings[key] ?? AI_PROMPT_DEFAULTS[key];
                        const label = meta?.label ?? key;
                        const description = meta?.description ?? "";
                        const value = (aiPromptSettings[key]?.value ?? AI_PROMPT_DEFAULTS[key]?.template) ?? "";
                        return (
                          <div key={key} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-slate-800">{label}</span>
                              <div className="flex shrink-0 items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-violet-600 hover:bg-violet-50"
                                  onClick={() => {
                                    const def = AI_PROMPT_DEFAULTS[key as AiPromptKey];
                                    if (def) {
                                      setAiPromptSettings((prev) => ({
                                        ...prev,
                                        [key]: { ...prev[key], value: def.template, description: def.description, label: def.label },
                                      }));
                                    }
                                  }}
                                >
                                  기본값 불러오기
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 rounded-full bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                                disabled={aiPromptSettingsLoading || aiPromptSavingKey !== null}
                                onClick={async () => {
                                  const { data: { session } } = await supabase.auth.getSession();
                                  const token = session?.access_token;
                                  if (!token) return;
                                  setAiPromptSavingKey(key);
                                  try {
                                    const res = await fetch("/api/ai-prompt-settings", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                      body: JSON.stringify({
                                      prompts: AI_PROMPT_KEYS.reduce((acc, k) => {
                                        const v = k === key ? value : (aiPromptSettings[k]?.value ?? AI_PROMPT_DEFAULTS[k]?.template);
                                        if (v != null) acc[k] = v;
                                        return acc;
                                      }, {} as Record<string, string>),
                                    }),
                                    });
                                    if (res.ok) {
                                      alert("저장되었습니다.");
                                    } else {
                                      const j = await res.json().catch(() => ({}));
                                      alert(j?.error ?? "저장 실패");
                                    }
                                  } finally {
                                    setAiPromptSavingKey(null);
                                  }
                                }}
                              >
                                {aiPromptSavingKey === key ? "저장 중..." : "저장"}
                              </Button>
                              </div>
                            </div>
                            <p className="mb-2 text-xs text-slate-500">{description}</p>
                            <div className="relative min-h-[360px] w-full rounded border border-slate-200 bg-slate-50/50 overflow-hidden">
                              <div
                                ref={(el) => { promptMirrorRefs.current[key] = el; }}
                                className="absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-2 text-xs font-mono text-slate-800 pointer-events-none select-none"
                                aria-hidden
                              >
                                {highlightPlaceholders(value)}
                              </div>
                              <textarea
                                ref={(el) => { promptTaRefs.current[key] = el; }}
                                onScroll={() => {
                                  const m = promptMirrorRefs.current[key];
                                  const t = promptTaRefs.current[key];
                                  if (m && t) { m.scrollTop = t.scrollTop; m.scrollLeft = t.scrollLeft; }
                                }}
                                className="relative block w-full min-h-[360px] p-2 text-xs font-mono bg-transparent text-transparent caret-slate-800 resize-none border-0 rounded focus:outline-none focus:ring-0"
                                style={{ zIndex: 1 }}
                                value={value}
                                onChange={(e) => {
                                  setAiPromptSettings((prev) => ({
                                    ...prev,
                                    [key]: { ...(prev[key] ?? { label: meta?.label ?? key, description: meta?.description ?? "" }), value: e.target.value },
                                  }));
                                }}
                                spellCheck={false}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                  )}
                  {showPointSettings && (
                  <>
                  {/* 1) 교사 활동 영역(6가지) 설정: 영역명/단위 */}
                  <Card className="rounded-xl border-slate-200/80 bg-slate-50/50 p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">교사 활동 영역(6가지) 설정</p>
                        <p className="mt-0.5 text-xs text-slate-500">영역명·활동기준(단위)을 설정합니다. (저장 버튼을 눌러 반영)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                          disabled={savingCategoryConfig || JSON.stringify(categoryConfig) === JSON.stringify(categoryConfigSaved)}
                          onClick={async () => {
                            const changed = JSON.stringify(categoryConfig) !== JSON.stringify(categoryConfigSaved);
                            if (!changed) return;
                            const ok = confirm("영역명과 단위를 바꾸면 기존의 데이터가 뒤섞일 수 있습니다. 영역명을 바꾸시겠습니까?");
                            if (!ok) return;
                            setSavingCategoryConfig(true);
                            try {
                              await savePointAndCategorySettings({ categories: categoryConfig });
                              setCategoryConfigSaved(categoryConfig);
                              setSchoolCategories(categoryConfig); // 마일리지 카드에 즉시 반영
                              setShowPointSettings(false);
                              // 설정 저장 후 localStorage에 저장하여 다른 페이지에서도 즉시 반영
                              if (userSchool) {
                                localStorage.setItem(`teacher_mate_category_settings_${userSchool}`, JSON.stringify(categoryConfig));
                              }
                              // 마일리지 요약 다시 계산하여 반영
                              if (currentUserEmail) {
                                const { data: mileageRows } = await supabase
                                  .from("mileage_entries")
                                  .select("id, content, category")
                                  .eq("user_email", currentUserEmail);
                                const { data: planRow } = await supabase
                                  .from("development_plans")
                                  .select("annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, education_annual_goal_unit, other_annual_goal")
                                  .eq("user_email", currentUserEmail)
                                  .order("created_at", { ascending: false })
                                  .limit(1)
                                  .maybeSingle();
                                const planGoalsRowRefresh = planRow as Record<string, string | null | undefined> | null | undefined;
                                const planGoals: Record<string, number> = {};
                                MILEAGE_CATEGORIES.forEach((c) => {
                                  const key = PLAN_GOAL_KEYS[c.key];
                                  const raw = String(planGoalsRowRefresh?.[key] ?? "").trim();
                                  planGoals[c.key] = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
                                });
                                let healthGoalUnitForRefresh: "시간" | "거리" = (planGoalsRowRefresh?.education_annual_goal_unit === "거리" ? "거리" : "시간") as "시간" | "거리";
                                const healthCat = categoryConfig.find(c => c.key === "health");
                                if (healthCat?.unit === "km") {
                                  healthGoalUnitForRefresh = "거리";
                                } else if (healthCat?.unit === "시간") {
                                  healthGoalUnitForRefresh = "시간";
                                }
                                const { categories: refreshedCategories, overallProgress: refreshedProgress } = computeMileageProgress(
                                  (mileageRows ?? []) as { content: string; category: string }[],
                                  planGoals,
                                  healthGoalUnitForRefresh,
                                  categoryConfig
                                );
                                setMileageSummary({ overallProgress: refreshedProgress, categories: refreshedCategories });
                              }
                            } finally {
                              setSavingCategoryConfig(false);
                            }
                          }}
                        >
                          {savingCategoryConfig ? "저장 중..." : "저장"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                          onClick={() => setShowPointSettings(false)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {categoryConfig.map((c) => (
                        <div key={c.key} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-center gap-2">
                            {editingLabelKey === c.key ? (
                              <Input
                                autoFocus
                                className="h-8 flex-1 rounded-lg border-slate-200 text-xs"
                                placeholder="새 영역명"
                                value={categoryConfig.find((x) => x.key === c.key)?.label ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setCategoryConfig((prev) => prev.map((x) => (x.key === c.key ? { ...x, label: v } : x)));
                                }}
                                onBlur={() => {
                                  setEditingLabelKey(null);
                                }}
                              />
                            ) : (
                              <>
                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                                  {categoryConfig.find((x) => x.key === c.key)?.label || c.label || "(영역명)"}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0 px-1.5 text-[11px] text-slate-500 hover:text-slate-700"
                                  onClick={() => {
                                    setEditingLabelKey(c.key);
                                    setCategoryConfig((prev) => prev.map((x) => (x.key === c.key ? { ...x, label: "" } : x)));
                                  }}
                                >
                                  수정
                                </Button>
                              </>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <select
                              className="h-8 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                              value={categoryConfig.find((x) => x.key === c.key)?.unit ?? c.unit}
                              onChange={(e) => {
                                const u = e.target.value;
                                const nextCat = categoryConfig.map((x) => (x.key === c.key ? { ...x, unit: u } : x));
                                setCategoryConfig(nextCat);
                              }}
                            >
                              {UNIT_OPTIONS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* 2) 포인트 설정: 점수만 (영역명/단위 고정) */}
                  <Card className="rounded-xl border-slate-200/80 bg-slate-50/50 p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">포인트 설정</p>
                        <p className="mt-0.5 text-xs text-slate-500">위에서 설정된 영역명·단위는 고정이며, 단위당 점수만 입력합니다.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                          disabled={savingPointSettings || JSON.stringify(pointSettings) === JSON.stringify(pointSettingsSaved)}
                          onClick={async () => {
                            const changed = JSON.stringify(pointSettings) !== JSON.stringify(pointSettingsSaved);
                            if (!changed) return;
                            setSavingPointSettings(true);
                            try {
                              await savePointAndCategorySettings({ settings: pointSettings });
                              setPointSettingsSaved(pointSettings);
                              if (userSchool && typeof window !== "undefined") {
                                try {
                                  localStorage.setItem(`teacher_mate_point_settings_${userSchool}`, JSON.stringify(pointSettings));
                                } catch {
                                  // ignore
                                }
                              }
                              setShowPointSettings(false);
                            } finally {
                              setSavingPointSettings(false);
                            }
                          }}
                        >
                          {savingPointSettings ? "저장 중..." : "저장"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                          onClick={() => setShowPointSettings(false)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {categoryConfigSaved.map((c) => (
                        <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-slate-700">{c.label}</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">단위: {c.unit}</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              className="h-8 w-24 rounded-lg border-slate-200 text-right text-xs"
                              value={pointSettings[c.key] ?? ""}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                const next = { ...pointSettings, [c.key]: Number.isNaN(v) ? 0 : Math.max(0, v) };
                                setPointSettings(next);
                              }}
                            />
                            <span className="text-[11px] text-slate-500">점</span>
                          </div>
                        </div>
                      ))}
                      {/* 1일 로그인 점수 설정 */}
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-slate-700">1일 로그인</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">하루 1회 로그인 시</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            step={0.5}
                            className="h-8 w-24 rounded-lg border-slate-200 text-right text-xs"
                            value={pointSettings.login_points ?? 2}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              const next = { ...pointSettings, login_points: Number.isNaN(v) ? 2 : Math.max(0, v) };
                              setPointSettings(next);
                            }}
                          />
                          <span className="text-[11px] text-slate-500">점</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                  </>
                  )}
                  {showDiagnosisSettings && (
                  <Card className="rounded-xl border-slate-200/80 bg-slate-50/50 p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">역량진단 설문 설정</p>
                        <p className="mt-0.5 text-xs text-slate-500">CSV 파일을 업로드하면 2~6개 대영역·문항이 해당 학교에 적용됩니다. (열: 번호, 대영역, 소영역, 방향, 설문내용)</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        onClick={() => setShowDiagnosisSettings(false)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* 설문 제목 (관리자 입력) */}
                    <div className="mb-4 rounded-lg border border-violet-200/80 bg-violet-50/40 p-3">
                      <Label className="text-xs font-semibold text-slate-700">설문 제목</Label>
                      <p className="mt-0.5 mb-2 text-[11px] text-slate-500">진단 화면 상단에 표시됩니다. 업로드 시 입력하거나 여기서 수정 후 저장하세요.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="max-w-md h-9 text-sm"
                          placeholder="예: 자기역량진단, 임의로 만든 검사지"
                          value={diagnosisSurveyTitle}
                          onChange={(e) => setDiagnosisSurveyTitle(e.target.value)}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"
                          onClick={async () => {
                            const titleToSave = diagnosisSurveyTitle.trim();
                            const { data: { session } } = await supabase.auth.getSession();
                            const token = session?.access_token;
                            if (!token) return;
                            const res = await fetch("/api/admin/diagnosis-title", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ title: titleToSave }),
                            });
                            const j = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              alert(j?.error ?? "제목 저장에 실패했습니다.");
                              return;
                            }
                            setDiagnosisSurveyCurrent((prev) => (prev ? { ...prev, title: titleToSave } : { questionCount: 0, domains: [], title: titleToSave }));
                            alert("설문 제목이 저장되었습니다.");
                          }}
                        >
                          제목 저장
                        </Button>
                      </div>
                    </div>

                    {/* CSV 업로드 (2~6대영역 설문) */}
                    <div className="mb-4 rounded-lg border border-blue-200/80 bg-blue-50/40 p-3">
                      <p className="mb-2 text-xs font-semibold text-slate-700">CSV로 설문 업로드</p>
                      <p className="mb-2 text-[11px] text-slate-500">
                        대영역 2~6개, 소영역은 영역당 4개 이하. 열 순서: 번호, 대영역, 소영역, 방향, 설문내용 (1번 행은 설명이면 자동 제외)
                      </p>
                      <p className="mb-2 text-[11px] text-amber-700">
                        주의: 한글이 깨지지 않도록 엑셀에서 저장 시 <strong>파일 형식을 &quot;CSV UTF-8(쉼표로 분리)&quot;</strong>로 선택해 주세요.
                      </p>
                      {diagnosisSurveyCurrent && diagnosisSurveyCurrent.questionCount > 0 && (
                        <p className="mb-2 text-[11px] text-slate-600">
                          현재 적용: {diagnosisSurveyCurrent.questionCount}문항, {diagnosisSurveyCurrent.domains.length}영역 ({diagnosisSurveyCurrent.domains.join(", ")})
                        </p>
                      )}
                      {diagnosisUploadFileName && (
                        <p className="mb-2 text-[11px] font-medium text-slate-700">
                          업로드된 파일: <span className="font-normal text-slate-600">{diagnosisUploadFileName}</span>
                        </p>
                      )}
                      <div className="mb-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-lg border-blue-300 bg-white px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                          onClick={() => {
                            const blob = new Blob(["\uFEFF" + DIAGNOSIS_SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = "자기역량진단_샘플양식.csv";
                            a.click();
                            URL.revokeObjectURL(a.href);
                          }}
                        >
                          샘플 양식 파일 다운로드
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <Label className="text-[11px] text-slate-500">업로드 시 제목 (선택)</Label>
                          <Input
                            className="mt-0.5 h-8 text-xs"
                            placeholder="예: 자기역량진단"
                            value={diagnosisUploadTitle}
                            onChange={(e) => setDiagnosisUploadTitle(e.target.value)}
                          />
                        </div>
                        <div className="min-w-0">
                          <Label className="text-[11px] text-slate-500">CSV 파일</Label>
                          <input
                            type="file"
                            accept=".csv"
                            className="mt-0.5 block w-full max-w-[200px] text-[11px] text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-blue-100 file:px-2 file:py-1 file:text-xs file:font-medium file:text-blue-700"
                            onChange={(e) => setDiagnosisExcelFile(e.target.files?.[0] ?? null)}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 rounded-lg bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                          disabled={!diagnosisExcelFile || diagnosisUploading}
                          onClick={async () => {
                            if (!diagnosisExcelFile) return;
                            setDiagnosisUploading(true);
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              const token = session?.access_token;
                              if (!token) return;
                              const form = new FormData();
                              form.append("file", diagnosisExcelFile);
                              if (diagnosisUploadTitle.trim()) form.append("title", diagnosisUploadTitle.trim());
                              const res = await fetch("/api/admin/diagnosis-upload", {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}` },
                                body: form,
                              });
                              const j = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                alert(j.error || "업로드에 실패했습니다.");
                                return;
                              }
                              setDiagnosisSurveyCurrent({
                                questionCount: j.questionCount ?? 0,
                                domains: j.domains ?? [],
                                title: j.title ?? diagnosisUploadTitle.trim(),
                              });
                              setDiagnosisUploadFileName(j.uploadFileName ?? diagnosisExcelFile?.name ?? "");
                              setDiagnosisExcelFile(null);
                              setDiagnosisUploadTitle("");
                              alert("설문이 적용되었습니다.");
                            } finally {
                              setDiagnosisUploading(false);
                            }
                          }}
                        >
                          {diagnosisUploading ? "업로드 중..." : "업로드"}
                        </Button>
                      </div>
                    </div>

                    {/* 기존 6역량 수동 설정 (CSV 미사용 시) */}
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-600 list-none">
                        <span className="inline-flex items-center gap-1">기존 방식: 6개 역량·역량당 5문항 수동 입력</span>
                      </summary>
                      <div className="mt-3 flex flex-col gap-4">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                          disabled={savingDiagnosisSettings || (diagnosisTitle === diagnosisTitleSaved && JSON.stringify(diagnosisDomains) === JSON.stringify(diagnosisDomainsSaved))}
                          onClick={async () => {
                            if (diagnosisTitle === diagnosisTitleSaved && JSON.stringify(diagnosisDomains) === JSON.stringify(diagnosisDomainsSaved)) return;
                            const domainsChanged = JSON.stringify(diagnosisDomains) !== JSON.stringify(diagnosisDomainsSaved);
                            if (domainsChanged && !confirm("구성원들의 기존 검사결과에 심각한 오류가 발생할 수 있습니다. 그래도 저장하시겠습니까?")) return;
                            setSavingDiagnosisSettings(true);
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              const token = session?.access_token;
                              if (!token) return;
                              const res = await fetch("/api/admin/diagnosis-settings", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ title: diagnosisTitle, domains: diagnosisDomains }),
                              });
                              if (!res.ok) {
                                const j = await res.json().catch(() => ({}));
                                alert(j.error || "저장에 실패했습니다.");
                                return;
                              }
                              setDiagnosisTitleSaved(diagnosisTitle);
                              setDiagnosisDomainsSaved(diagnosisDomains);
                              setShowDiagnosisSettings(false);
                            } finally {
                              setSavingDiagnosisSettings(false);
                            }
                          }}
                        >
                          {savingDiagnosisSettings ? "저장 중..." : "저장"}
                        </Button>
                      </div>
                      <div className="rounded-lg border border-violet-200/80 bg-violet-50/40 p-3">
                        <p className="mb-2 text-xs font-semibold text-slate-600">검사 제목 작성</p>
                        <Input
                          className="border-violet-200/60 bg-white text-slate-800 placeholder:text-slate-400 focus-visible:ring-violet-300"
                          value={diagnosisTitle}
                          onChange={(e) => setDiagnosisTitle(e.target.value)}
                          placeholder="예: 나의 교원 역량 진단"
                        />
                      </div>
                      <p className="text-xs font-semibold text-slate-600">6개의 역량 및 하위 문항 5가지 작성</p>
                      {diagnosisDomains.map((domain, di) => (
                        <div key={di} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="shrink-0 text-xs font-semibold text-slate-500 w-14">역량 {di + 1} :</span>
                            <Input
                              className="min-w-0 flex-1 border-amber-200/80 bg-amber-50/50 font-medium text-slate-800 placeholder:text-slate-400 focus-visible:ring-amber-300"
                              value={domain.name}
                              onChange={(e) => {
                                const next = diagnosisDomains.map((d, i) =>
                                  i === di ? { ...d, name: e.target.value } : d
                                );
                                setDiagnosisDomains(next);
                              }}
                              placeholder="역량 영역명"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {(domain.items ?? []).slice(0, 5).map((item, ii) => (
                              <div key={ii} className="flex items-center gap-2">
                                <span className="shrink-0 text-xs font-medium text-slate-400 w-14">문항 {ii + 1} :</span>
                                <Input
                                  className="min-w-0 flex-1 text-xs"
                                  value={item}
                                  onChange={(e) => {
                                    const items = [...(domain.items ?? [])];
                                    while (items.length < 5) items.push("");
                                    items[ii] = e.target.value;
                                    const next = diagnosisDomains.map((d, i) =>
                                      i === di ? { ...d, items } : d
                                    );
                                    setDiagnosisDomains(next);
                                  }}
                                  placeholder={`문항 ${ii + 1} 입력`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      </div>
                    </details>
                  </Card>
                  )}
                </div>
              )}

              {isLoadingTeachers ? (
                <p className="py-8 text-center text-sm text-slate-500">목록을 불러오는 중입니다...</p>
              ) : teachersError ? (
                <p className="py-8 text-center text-sm text-red-500">{teachersError}</p>
              ) : teacherSummaries.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">등록된 교원이 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[...teacherSummaries]
                    .sort((a, b) => {
                      if (adminSortBy === "createdAt") {
                        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                      }
                      if (adminSortBy === "name") {
                        return (a.name || "").localeCompare(b.name || "", "ko");
                      }
                      return (a.gradeClass || "").localeCompare(b.gradeClass || "", "ko");
                    })
                    .slice(0, teacherDisplayLimit)
                    .map((t) => {
                      const expanded = !!expandedTeacherCards[t.id];
                      return (
                      <Card
                        key={t.id}
                        className={`w-full rounded-xl border-0 py-1.5 pl-8 pr-2 ring-1 ring-violet-200/50 shadow-sm ${
                          expanded
                            ? "min-h-[6.33cm] overflow-visible"
                            : "min-h-[2.11cm] overflow-x-auto overflow-y-hidden 2xl:h-[2.11cm] 2xl:max-h-[2.11cm]"
                        }`}
                        style={{ background: "linear-gradient(to bottom right, rgb(245 243 255 / 0.9), rgb(238 242 255 / 0.4), rgb(238 242 255 / 0.5))" }}
                      >
                        <div className={`flex h-full min-w-0 ${expanded ? "flex-col gap-3" : "flex-col 2xl:flex-row 2xl:flex-nowrap items-start 2xl:items-center"} gap-2 sm:gap-3`}>
                          {/* 첫 번째 행: 이름/포인트 + 버튼들 */}
                          <div className={`flex w-full ${expanded ? "flex-row items-center justify-between" : "flex-col 2xl:flex-row 2xl:flex-nowrap items-start 2xl:items-center"}`}>
                            <div className={`flex items-center gap-2 ${expanded ? "" : ""}`}>
                              <button
                                type="button"
                                onClick={() => setExpandedTeacherCards((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                                className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-md border border-violet-200 bg-white/70 text-violet-500 hover:bg-white"
                                title={expanded ? "축소" : "확대"}
                              >
                                {expanded ? <Minimize2 className="h-5.25 w-5.25" /> : <Maximize2 className="h-5.25 w-5.25" />}
                              </button>
                              <div className="flex min-w-0 flex-col justify-center gap-0.5" style={{ width: expanded ? "auto" : "5rem" }}>
                                {t.gradeClass && <span className="truncate text-[10px] leading-tight text-slate-500">{t.gradeClass}</span>}
                                <div className="flex flex-col gap-0.5">
                                  <p className="truncate text-sm font-semibold text-slate-800">{t.name ? maskDisplayName(t.name) : "-"}</p>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        setIsLoadingPointsDetail(true);
                                        setShowMileageDetail(true);
                                        setPointsDetailOwner({ name: t.name ? maskDisplayName(t.name) : (t.email || "교사"), isAdminSelf: false });
                                        const { data: { session } } = await supabase.auth.getSession();
                                        const token = session?.access_token;
                                        if (!token) {
                                          throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
                                        }
                                        const res = await fetch("/api/admin/points-by-email", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                          },
                                          body: JSON.stringify({ email: t.email }),
                                        });
                                        const json = await res.json();
                                        if (!res.ok) {
                                          throw new Error(json?.error || "포인트 정보를 불러오지 못했습니다.");
                                        }
                                        setPointsDetail({
                                          base: json.base ?? 0,
                                          login: json.login ?? 0,
                                          mileage: json.mileage ?? 0,
                                          total: json.total ?? 0,
                                        });
                                        setMileagePointItems(Array.isArray(json.mileageBreakdown) ? json.mileageBreakdown : []);
                                      } catch (err: any) {
                                        console.error(err);
                                        alert(err?.message || "포인트 정보를 불러오는 중 오류가 발생했습니다.");
                                      } finally {
                                        setIsLoadingPointsDetail(false);
                                      }
                                    }}
                                    className="shrink-0 inline-flex items-baseline gap-1 rounded-full px-1.5 py-0.5 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                                    title="포인트 세부 내역 보기"
                                  >
                                    {expanded ? (
                                      <>
                                        <span className="text-[calc(20px*0.75)] font-medium text-slate-600">{(t.totalPoints ?? 0).toLocaleString()}</span>
                                        <span className="text-[calc(10px*0.75*1.5)] font-medium text-slate-600">P</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-[calc(0.875rem*0.75)] font-semibold text-slate-800">{(t.totalPoints ?? 0).toLocaleString()}</span>
                                        <span className="text-[calc(8.4px*0.75*1.5)] font-medium text-slate-600">P</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {!expanded ? (
                              <>
                                <div className="flex min-w-0 flex-row flex-wrap 2xl:flex-nowrap items-center gap-2">
                                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                                    <div className="flex w-20 items-center gap-1 sm:w-28">
                                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                                        <div
                                          className="h-full rounded-full bg-indigo-500"
                                          style={{
                                            width: `${Math.min(100, Math.max(0, t.mileageSummary.overallProgress))}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="w-6 shrink-0 text-[11px] text-slate-400 sm:text-xs">{Math.round(t.mileageSummary.overallProgress)}%</span>
                                    </div>
                                  </div>

                                  <div className="flex min-w-0 flex-row items-center">
                                    {t.mileageSummary.categories.map((c, i) => {
                                      const val = Math.min(100, Math.max(0, c.progress));
                                      const pieData = [
                                        { name: "a", value: val, fill: PIE_COLORS[i % PIE_COLORS.length] },
                                        { name: "b", value: 100 - val, fill: "#e2e8f0" },
                                      ].filter((d) => d.value > 0);
                                      return (
                                        <button
                                          key={c.key}
                                          type="button"
                                          className="flex min-w-[4.25rem] flex-col items-center gap-0.5 sm:min-w-[4.75rem] md:min-w-[5rem]"
                                          style={{ cursor: "pointer" }}
                                          title={`${c.label} ${Math.round(c.progress)}%`}
                                          onClick={async () => {
                                  try {
                                        setAdminMileageDetail(null);
                                        const { data: { session } } = await supabase.auth.getSession();
                                        const token = session?.access_token;
                                        if (!token) throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
                                        const res = await fetch("/api/admin/mileage-by-email", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                          },
                                          body: JSON.stringify({ email: t.email, category: c.key }),
                                        });
                                        const json = await res.json();
                                        if (!res.ok) throw new Error(json?.error || "마일리지 기록을 불러오지 못했습니다.");
                                        setAdminMileageDetail({
                                          teacherName: t.name ? maskDisplayName(t.name) : (t.email || "교사"),
                                          categoryLabel: c.label,
                                          entries: (json.entries ?? []) as { id: string; content: string; created_at: string }[],
                                        });
                                        setShowAdminMileageDetail(true);
                                      } catch (err: any) {
                                        console.error(err);
                                        alert(err?.message || "마일리지 기록을 불러오는 중 오류가 발생했습니다.");
                                      }
                                          }}
                                        >
                                          <ResponsiveContainer width={38} height={38}>
                                            <PieChart>
                                              <Pie
                                                data={pieData.length ? pieData : [{ name: "a", value: 100, fill: "#e2e8f0" }]}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="30%"
                                                outerRadius="95%"
                                                dataKey="value"
                                                strokeWidth={0}
                                                cursor="pointer"
                                              >
                                                {(pieData.length ? pieData : [{ fill: "#e2e8f0" }]).map((d, j) => (
                                                  <Cell key={j} fill={d.fill} />
                                                ))}
                                              </Pie>
                                            </PieChart>
                                          </ResponsiveContainer>
                                          <span className="w-full text-center leading-tight text-slate-500 text-[8px] sm:text-[9px]">
                                            {c.label.length > 7 ? `${c.label.slice(0, 7)}…` : c.label}
                                          </span>
                                          {(() => {
                                            const goal = (c as { goal?: number }).goal ?? 0;
                                            const sum = (c as { sum?: number }).sum ?? 0;
                                            const unit = (c as { unit?: string }).unit ?? "";
                                            return (
                                              <span className="text-[7px] text-slate-400 sm:text-[8px]">
                                                {Number(sum).toFixed(sum % 1 === 0 ? 0 : 1)} / {goal}
                                                {unit ? ` ${unit}` : ""}
                                              </span>
                                            );
                                          })()}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            ) : null}

                            {/* 버튼들: 줄인 상태와 확대 상태 모두에 표시 */}
                            <div className={`${!expanded ? "mt-2 2xl:mt-0 ml-0 2xl:ml-3" : "ml-0"} flex shrink-0 flex-row items-center gap-1 sm:ml-4 sm:gap-1.5 flex-wrap`}>
                            {t.hasPreDiagnosis ? (
                              <Link href={`/diagnosis/result?email=${encodeURIComponent(t.email)}`}>
                                <span className="inline-flex h-[30px] flex-col items-center justify-center rounded-md bg-emerald-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5"><span className="text-[9px] text-emerald-800 sm:text-[10px]">사전</span><span className="text-[9px] text-emerald-800 sm:text-[10px]">진단</span></span>
                              </Link>
                            ) : (
                              <span className="inline-flex h-[30px] cursor-not-allowed flex-col items-center justify-center rounded-md bg-slate-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5" title="미작성"><span className="text-[9px] text-slate-400 sm:text-[10px]">사전</span><span className="text-[9px] text-slate-400 sm:text-[10px]">진단</span></span>
                            )}
                            {t.planCompleted ? (
                              <Link href={`/plan/print?email=${encodeURIComponent(t.email)}`}>
                                <span className="inline-flex h-[30px] flex-col items-center justify-center rounded-md bg-emerald-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5"><span className="text-[9px] text-emerald-800 sm:text-[10px]">개발</span><span className="text-[9px] text-emerald-800 sm:text-[10px]">계획서</span></span>
                              </Link>
                            ) : (
                              <span className="inline-flex h-[30px] cursor-not-allowed flex-col items-center justify-center rounded-md bg-slate-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5" title="미작성"><span className="text-[9px] text-slate-400 sm:text-[10px]">개발</span><span className="text-[9px] text-slate-400 sm:text-[10px]">계획서</span></span>
                            )}
                            {t.hasPostDiagnosis ? (
                              <Link href={`/diagnosis/result?type=post&email=${encodeURIComponent(t.email)}`}>
                                <span className="inline-flex h-[30px] flex-col items-center justify-center rounded-md bg-emerald-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5"><span className="text-[9px] text-emerald-800 sm:text-[10px]">사후</span><span className="text-[9px] text-emerald-800 sm:text-[10px]">진단</span></span>
                              </Link>
                            ) : (
                              <span className="inline-flex h-[30px] cursor-not-allowed flex-col items-center justify-center rounded-md bg-slate-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5" title="미작성"><span className="text-[9px] text-slate-400 sm:text-[10px]">사후</span><span className="text-[9px] text-slate-400 sm:text-[10px]">진단</span></span>
                            )}
                            {t.reflectionDone ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { window.location.href = `/reflection/result-report?email=${encodeURIComponent(t.email)}&type=1`; }}
                                  className="inline-flex h-[30px] flex-col items-center justify-center rounded-md bg-emerald-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5 border-0 cursor-pointer"
                                  title="(구)자기실적평가서"
                                >
                                  <span className="text-[9px] text-emerald-800 sm:text-[10px]">(구)자기실적</span>
                                  <span className="text-[9px] text-emerald-800 sm:text-[10px]">평가서</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { window.location.href = `/reflection/result-report?email=${encodeURIComponent(t.email)}&type=2`; }}
                                  className="inline-flex h-[30px] flex-col items-center justify-center rounded-md bg-emerald-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5 border-0 cursor-pointer"
                                  title="자기역량 개발 결과 보고서"
                                >
                                  <span className="text-[9px] text-emerald-800 sm:text-[10px]">자기역량</span>
                                  <span className="text-[9px] text-emerald-800 sm:text-[10px]">결과보고서</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <span
                                  className="inline-flex h-[30px] cursor-not-allowed flex-col items-center justify-center rounded-md bg-slate-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5"
                                  title="미작성"
                                >
                                  <span className="text-[9px] text-slate-400 sm:text-[10px]">(구)자기실적</span>
                                  <span className="text-[9px] text-slate-400 sm:text-[10px]">평가서</span>
                                </span>
                                <span
                                  className="inline-flex h-[30px] cursor-not-allowed flex-col items-center justify-center rounded-md bg-slate-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5"
                                  title="미작성"
                                >
                                  <span className="text-[9px] text-slate-400 sm:text-[10px]">자기역량</span>
                                  <span className="text-[9px] text-slate-400 sm:text-[10px]">결과보고서</span>
                                </span>
                              </>
                            )}
                            <button
                              type="button"
                              className={`inline-flex h-[30px] shrink-0 flex-col items-center justify-center rounded-md border px-1.5 py-1 leading-tight sm:h-[36px] sm:px-2 ${
                                t.isGoogleOnly
                                  ? "border-slate-200 bg-slate-100 cursor-not-allowed opacity-60"
                                  : "border-amber-200 bg-[#fffbeb]"
                              }`}
                              style={{ color: t.isGoogleOnly ? "#6b7280" : "#92400e" }}
                              disabled={resettingPasswordId === t.id || t.isGoogleOnly}
                              title={t.isGoogleOnly ? "구글 로그인의 경우 초기화가 불가합니다." : undefined}
                              onClick={() => {
                                if (!t.isGoogleOnly) {
                                  handleAdminResetPassword(t.id, t.name ? maskDisplayName(t.name) : t.email || "회원");
                                }
                              }}
                            >
                              <span className="text-[9px] sm:text-[10px]">{resettingPasswordId === t.id ? "처리 중" : "비밀번호"}</span>
                              <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px]">
                                <KeyRound className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                초기화
                              </span>
                            </button>
                            </div>
                          </div>

                          {/* 확대 상태: 두 번째 행 - 성장 여정 상태바 (독립적인 행) */}
                          {expanded && (
                            <div className="w-full flex items-center gap-3 overflow-visible mt-[5mm]">
                              <span className="shrink-0 text-sm font-medium text-[#333]">성장 여정</span>
                              <div className="relative h-[4.8px] min-w-0 flex-1 overflow-visible rounded-full bg-[#e0e2e7]">
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full bg-[#6366f1] transition-all duration-500"
                                  style={{ width: `${Math.min(100, Math.max(0, t.mileageSummary.overallProgress))}%`, minWidth: t.mileageSummary.overallProgress > 0 ? 2 : 0 }}
                                />
                                <div
                                  className="absolute bottom-full left-0 mb-0.5 transition-all duration-500"
                                  style={{
                                    left: `${Math.min(100, Math.max(0, t.mileageSummary.overallProgress))}%`,
                                    transform: "translate(-50%, 0) rotate(20deg)",
                                  }}
                                >
                                  <Plane className="h-[27px] w-[27px] text-[#6366f1]" strokeWidth={2} />
                                </div>
                              </div>
                              <span className="shrink-0 text-sm text-slate-400">{Math.round(t.mileageSummary.overallProgress)}%</span>
                            </div>
                          )}

                          {/* 확대 상태: 세 번째 행 - 그래프들 (독립적인 행) */}
                          {expanded && (
                            <div className="w-full grid grid-cols-6 gap-2 mt-[5mm]">
                              {t.mileageSummary.categories.map((c, i) => {
                                const val = Math.min(100, Math.max(0, c.progress));
                                const completed = val;
                                const remaining = 100 - val;
                                const pieData = [
                                  { name: "진행", value: completed, fill: PIE_COLORS[i % PIE_COLORS.length] },
                                  { name: "남음", value: remaining, fill: "#e2e8f0" },
                                ].filter((d) => d.value > 0);
                                const goal = (c as { goal?: number }).goal ?? 0;
                                const sum = (c as { sum?: number }).sum ?? 0;
                                const unit = (c as { unit?: string }).unit ?? "";
                                const progressText = `${Number(sum).toFixed(sum % 1 === 0 ? 0 : 1)}/${goal}${unit ? ` ${unit}` : ""}`;
                                return (
                                  <button
                                    key={c.key}
                                    type="button"
                                    className="flex flex-col items-center gap-1"
                                    style={{ cursor: "pointer" }}
                                    title={`${c.label} ${Math.round(c.progress)}%`}
                                    onClick={async () => {
                                      try {
                                        setAdminMileageDetail(null);
                                        const { data: { session } } = await supabase.auth.getSession();
                                        const token = session?.access_token;
                                        if (!token) throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
                                        const res = await fetch("/api/admin/mileage-by-email", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${token}`,
                                          },
                                          body: JSON.stringify({ email: t.email, category: c.key }),
                                        });
                                        const json = await res.json();
                                        if (!res.ok) throw new Error(json?.error || "마일리지 기록을 불러오지 못했습니다.");
                                        setAdminMileageDetail({
                                          teacherName: t.name ? maskDisplayName(t.name) : (t.email || "교사"),
                                          categoryLabel: c.label,
                                          entries: (json.entries ?? []) as { id: string; content: string; created_at: string }[],
                                        });
                                        setShowAdminMileageDetail(true);
                                      } catch (err: any) {
                                        console.error(err);
                                        alert(err?.message || "마일리지 기록을 불러오는 중 오류가 발생했습니다.");
                                      }
                                    }}
                                  >
                                    <div className="relative h-24 w-24">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                          <Pie
                                            data={pieData.length ? pieData : [{ name: "진행", value: 0, fill: PIE_COLORS[i % PIE_COLORS.length] }]}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="55%"
                                            outerRadius="95%"
                                            dataKey="value"
                                            strokeWidth={0}
                                            cursor="pointer"
                                          >
                                            {pieData.length ? pieData.map((d, j) => <Cell key={j} fill={d.fill} />) : <Cell fill={PIE_COLORS[i % PIE_COLORS.length]} />}
                                          </Pie>
                                        </PieChart>
                                      </ResponsiveContainer>
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="text-[15px] font-semibold text-slate-600">{Math.round(c.progress)}%</span>
                                      </div>
                                    </div>
                                    <span className="w-full text-center text-[13px] font-medium text-slate-700 break-words whitespace-normal">
                                      {c.label}
                                    </span>
                                    {progressText && <span className="text-[11px] text-slate-600">{progressText}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                    })}
                  {teacherSummaries.length > teacherDisplayLimit && (
                    <div className="py-3 text-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setTeacherDisplayLimit((prev) => prev + TEACHER_PAGE_SIZE)}
                      >
                        더 보기 ({Math.min(TEACHER_PAGE_SIZE, teacherSummaries.length - teacherDisplayLimit)}명)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 열정 포인트 상세 내역 모달 (교사 본인 또는 관리자에서 선택한 교사) */}
      <Dialog open={showMileageDetail} onOpenChange={setShowMileageDetail}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pointsDetailOwner?.name
                ? pointsDetailOwner.isAdminSelf
                  ? `${pointsDetailOwner.name} 선생님 마일리지 현황`
                  : `${pointsDetailOwner.name} 선생님 마일리지 현황`
                : "마일리지 현황"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isLoadingPointsDetail && (
              <p className="text-xs text-slate-500">포인트 세부 내역을 불러오는 중입니다...</p>
            )}
            {/* 기본 포인트 */}
            {pointsDetail && (
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-700">기본 포인트</div>
                  <div className="text-xs text-slate-500 mt-0.5">가입 시 지급</div>
                </div>
                <div className="text-sm font-semibold text-slate-800 ml-4">
                  +{pointsDetail.base.toLocaleString()}점
                </div>
              </div>
            )}

            {/* 로그인 포인트 */}
            {pointsDetail && pointsDetail.login > 0 && (
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-700">로그인 포인트</div>
                  <div className="text-xs text-slate-500 mt-0.5">하루 1회 로그인 시 +{pointSettings?.login_points ?? 2}점 (누계)</div>
                </div>
                <div className="text-sm font-semibold text-slate-800 ml-4">
                  {pointsDetail.login.toLocaleString()}점
                </div>
              </div>
            )}

            {/* 마일리지 포인트 */}
            {pointsDetail && pointsDetail.mileage > 0 && mileagePointItems.length > 0 && (
              <>
                <div className="text-xs font-medium text-slate-600 mt-2 mb-1">마일리지 포인트</div>
                {mileagePointItems.map((cat) => {
                  const sum = cat.sum ?? 0;
                  const unit = cat.unit ?? "";
                  const pointPerUnit = cat.pointPerUnit ?? 0;
                  const points = cat.points ?? 0;
                  return (
                    <div key={cat.key} className="flex items-center justify-between border-b border-slate-200 pb-2 last:border-0">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-700">{cat.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {sum > 0 ? `${Number(sum).toFixed(sum % 1 === 0 ? 0 : 1)} ${unit} × ${pointPerUnit}점` : "기록 없음"}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-800 ml-4">
                        {points > 0 ? `+${points.toLocaleString()}점` : "0점"}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-1 mt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">마일리지 포인트 합계</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {pointsDetail.mileage.toLocaleString()}점
                    </span>
                  </div>
                </div>
              </>
            )}
            {pointsDetail && pointsDetail.mileage === 0 && (
              <div className="text-xs text-slate-500 text-center py-2">마일리지 기록이 없습니다.</div>
            )}

            {/* 총합 */}
            {pointsDetail && (
              <div className="pt-2 mt-3 border-t-2 border-slate-300 flex justify-end">
                <span className="text-lg font-bold text-violet-600">
                  {pointsDetail.total.toLocaleString()}점
                </span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 관리자: 개별 교사의 특정 영역 마일리지 기록 모달 */}
      <Dialog open={showAdminMileageDetail} onOpenChange={setShowAdminMileageDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {adminMileageDetail
                ? `${adminMileageDetail.teacherName} 선생님 실천 기록`
                : "마일리지 실천 기록"}
            </DialogTitle>
            {adminMileageDetail && (
              <p className="mt-1 text-xs text-slate-500">
                영역: {adminMileageDetail.categoryLabel}
              </p>
            )}
          </DialogHeader>
          <div className="max-h-[420px] overflow-y-auto space-y-2">
            {!adminMileageDetail ? (
              <p className="text-sm text-slate-500">해당 영역의 마일리지 기록을 불러오는 중입니다...</p>
            ) : adminMileageDetail.entries.length === 0 ? (
              <p className="text-sm text-slate-500">해당 영역의 마일리지 기록이 없습니다.</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-slate-700">
                {adminMileageDetail.entries.map((e) => (
                  <li key={e.id} className="rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
                    <div className="text-[11px] text-slate-400 mb-0.5">
                      {new Date(e.created_at).toLocaleString("ko-KR", {
                        year: "2-digit",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{e.content}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

