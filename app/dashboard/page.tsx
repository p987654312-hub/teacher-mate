"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import {
  ClipboardCheck,
  Flag,
  NotebookPen,
  Printer,
  Compass,
  Plane,
  KeyRound,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Progress } from "@/components/ui/progress";

type PlanRow = {
  development_goal?: string | null;
  expected_outcome?: string | null;
  training_plans?: Array<{ name?: string; period?: string; duration?: string; remarks?: string }> | null;
  education_plans?: Array<{ area?: string; period?: string; duration?: string; remarks?: string }> | null;
  book_plans?: Array<{ title?: string; period?: string; method?: string }> | null;
  expense_requests?: Array<{ activity?: string; period?: string; method?: string; remarks?: string }> | null;
  community_plans?: Array<{ activity?: string; period?: string; method?: string; remarks?: string }> | null;
  other_plans?: Array<{ text?: string }> | null;
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
  (row.training_plans ?? []).forEach((r) => {
    count(r.name); count(r.period); count(r.duration); count(r.remarks);
  });
  (row.education_plans ?? []).forEach((r) => {
    count(r.area); count(r.period); count(r.duration); count(r.remarks);
  });
  (row.book_plans ?? []).forEach((r) => {
    count(r.title); count(r.period); count(r.method);
  });
  (row.expense_requests ?? []).forEach((r) => {
    count(r.activity); count(r.period); count(r.method); count(r.remarks);
  });
  (row.community_plans ?? []).forEach((r) => {
    count(r.activity); count(r.period); count(r.method); count(r.remarks);
  });
  (row.other_plans ?? []).forEach((r) => count(r.text));
  return total > 0 ? filled / total : 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [userSchool, setUserSchool] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userGradeClass, setUserGradeClass] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"teacher" | "admin" | null>(null);
  const [isChecking, setIsChecking] = useState(true);
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
      mileageSummary: { overallProgress: number; categories: { key: string; label: string; progress: number }[] };
    }[]
  >([]);
  const [adminSortBy, setAdminSortBy] = useState<"createdAt" | "name" | "gradeClass">("createdAt");
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
    categories: { key: string; label: string; progress: number }[];
  } | null>(null);
  const [reflectionDone, setReflectionDone] = useState(false);

  const MILEAGE_CATEGORIES = [
    { key: "training", label: "연수(직무·자율)" },
    { key: "class_open", label: "수업 공개" },
    { key: "community", label: "교원학습 공동체" },
    { key: "book_edutech", label: "전문 서적/에듀테크" },
    { key: "health", label: "건강/체력" },
    { key: "other", label: "기타 계획" },
  ] as const;
  const PLAN_GOAL_KEYS: Record<string, string> = {
    training: "annual_goal",
    class_open: "expense_annual_goal",
    community: "community_annual_goal",
    book_edutech: "book_annual_goal",
    health: "education_annual_goal",
    other: "other_annual_goal",
  };
  const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#c084fc", "#d8b4fe", "#e9d5ff"];

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

      const name = metadata?.name ?? user.email ?? null;
      const schoolName = metadata?.schoolName ?? null;
      const role = metadata?.role ?? null;
      const gradeClass = metadata?.gradeClass ?? metadata?.schoolLevel ?? null;

      setUserName(name);
      setUserSchool(schoolName);
      setUserGradeClass(gradeClass);
      setUserRole(role);
      setIsChecking(false);

      // 교사용 진단 결과 요약 불러오기
      if (role === "teacher" && user.email) {
        try {
          setIsLoadingDiagnosis(true);
          const { data, error } = await supabase
            .from("diagnosis_results")
            .select("domain1,domain2,domain3,domain4,domain5,domain6,total_score")
            .eq("user_email", user.email)
            .or("diagnosis_type.is.null,diagnosis_type.eq.pre")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            console.error("Error fetching diagnosis summary:", error);
          } else if (data) {
            // 각 영역의 평균 점수 계산 (각 영역당 5문항, 10점 척도이므로 5로 나눔)
            const domain1Avg = ((data.domain1 as number) ?? 0) / 5;
            const domain2Avg = ((data.domain2 as number) ?? 0) / 5;
            const domain3Avg = ((data.domain3 as number) ?? 0) / 5;
            const domain4Avg = ((data.domain4 as number) ?? 0) / 5;
            const domain5Avg = ((data.domain5 as number) ?? 0) / 5;
            const domain6Avg = ((data.domain6 as number) ?? 0) / 5;

            setDiagnosisSummary({
              domain1: domain1Avg,
              domain2: domain2Avg,
              domain3: domain3Avg,
              domain4: domain4Avg,
              domain5: domain5Avg,
              domain6: domain6Avg,
              totalScore: (data.total_score as number) ?? 0,
            });
          }

          // 사후 진단 실시 여부
          const { data: postData } = await supabase
            .from("diagnosis_results")
            .select("id")
            .eq("user_email", user.email)
            .eq("diagnosis_type", "post")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          setHasPostDiagnosis(!!postData);

          // 계획서 저장 여부 확인: 빈칸 70% 이상 채워져야 실시완료
          const { data: planRow } = await supabase
            .from("development_plans")
            .select("development_goal, expected_outcome, training_plans, education_plans, book_plans, expense_requests, community_plans, other_plans, annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, other_annual_goal")
            .eq("user_email", user.email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const planFilledRatio = planRow ? getPlanFillRatio(planRow) : 0;
          setPlanCompleted(planFilledRatio >= 0.7);

          // 목적지 마일리지 요약: 항목별 진행률, 전체 진행률
          const { data: mileageRows } = await supabase
            .from("mileage_entries")
            .select("category")
            .eq("user_email", user.email);
          const planGoals = planRow as (Record<string, string | null | undefined> | null) | undefined;
          const countByCategory: Record<string, number> = {};
          MILEAGE_CATEGORIES.forEach((c) => { countByCategory[c.key] = 0; });
          (mileageRows ?? []).forEach((r: { category?: string }) => {
            const k = r.category;
            if (k && countByCategory[k] !== undefined) countByCategory[k] += 1;
          });
          const categories = MILEAGE_CATEGORIES.map((c) => {
            const goalKey = PLAN_GOAL_KEYS[c.key];
            const goalRaw = String(planGoals?.[goalKey] ?? "").trim();
            const goalNum = parseFloat(goalRaw.replace(/[^\d.]/g, "")) || 0;
            const progress = goalNum > 0 ? Math.min(100, (countByCategory[c.key] / goalNum) * 100) : 0;
            return { key: c.key, label: c.label, progress };
          });
          const overallProgress = categories.length > 0
            ? Math.min(100, Math.round(categories.reduce((a, c) => a + c.progress, 0) / categories.length))
            : 0;
          setMileageSummary({ overallProgress, categories });
        } finally {
          setIsLoadingDiagnosis(false);
        }
      }

      if (role === "admin" && schoolName) {
        try {
          setIsLoadingTeachers(true);
          setTeachersError(null);

          const res = await fetch("/api/admin/teacher-summaries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ schoolName }),
          });

          const json = await res.json();

          if (!res.ok) {
            throw new Error(json.error || "교원 목록을 불러오지 못했습니다.");
          }

          setTeacherSummaries(json.teachers ?? []);
        } catch (error) {
          console.error(error);
          setTeachersError(
            error instanceof Error
              ? error.message
              : "교원 목록을 불러오지 못했습니다."
          );
          setTeacherSummaries([]);
        } finally {
          setIsLoadingTeachers(false);
        }
      }
    };

    checkSession();
  }, [router]);

  // 계획서 저장 후 대시보드 돌아왔을 때 카드 활성화 반영 (포커스/가시성 시 재조회)
  useEffect(() => {
    if (userRole !== "teacher") return;
    const MILEAGE_CATS = [
      { key: "training", label: "연수(직무·자율)" },
      { key: "class_open", label: "수업 공개" },
      { key: "community", label: "교원학습 공동체" },
      { key: "book_edutech", label: "전문 서적/에듀테크" },
      { key: "health", label: "건강/체력" },
      { key: "other", label: "기타 계획" },
    ];
    const PLAN_KEYS: Record<string, string> = {
      training: "annual_goal", class_open: "expense_annual_goal", community: "community_annual_goal",
      book_edutech: "book_annual_goal", health: "education_annual_goal", other: "other_annual_goal",
    };
    const refetchPlan = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data: planRow } = await supabase
        .from("development_plans")
        .select("development_goal, expected_outcome, training_plans, education_plans, book_plans, expense_requests, community_plans, other_plans, annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, other_annual_goal")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ratio = planRow ? getPlanFillRatio(planRow as PlanRow) : 0;
      setPlanCompleted(ratio >= 0.7);
      const { data: mileageRows } = await supabase
        .from("mileage_entries")
        .select("category")
        .eq("user_email", user.email);
      const planGoals = planRow as Record<string, string | null | undefined> | null | undefined;
      const countByCategory: Record<string, number> = {};
      MILEAGE_CATS.forEach((c) => { countByCategory[c.key] = 0; });
      (mileageRows ?? []).forEach((r: { category?: string }) => {
        const k = r.category;
        if (k && countByCategory[k] !== undefined) countByCategory[k] += 1;
      });
      const categories = MILEAGE_CATS.map((c) => {
        const goalKey = PLAN_KEYS[c.key];
        const goalRaw = String(planGoals?.[goalKey] ?? "").trim();
        const goalNum = parseFloat(goalRaw.replace(/[^\d.]/g, "")) || 0;
        const progress = goalNum > 0 ? Math.min(100, (countByCategory[c.key] / goalNum) * 100) : 0;
        return { key: c.key, label: c.label, progress };
      });
      const overallProgress = categories.length > 0
        ? Math.min(100, Math.round(categories.reduce((a, c) => a + c.progress, 0) / categories.length))
        : 0;
      setMileageSummary({ overallProgress, categories });
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
      setReflectionDone(goalAchievementFilled && reflectionFilled && nextYearFilled);
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

  const isTeacher = userRole === "teacher";
  const isAdmin = userRole === "admin";

  return (
    <div className="min-h-screen bg-white px-4 py-10">
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
            <span>
              {userSchool && <span>{userSchool}</span>}
              {userSchool && userName && <span className="mx-1">|</span>}
              {userName && <span className="font-medium text-blue-600">{userName}</span>}
              {userName && <span> 님</span>}
            </span>
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
          {/* 관리자는 교사 대시보드(진단/계획/마일리지 등)를 볼 수 없고, 아래 isAdmin 블록(교원 목록·보고서 링크)만 표시 */}
          {isTeacher && (
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
                        {[userGradeClass, userName].filter(Boolean).join(" ")}{userName ? " 선생님" : "선생님"}
                      </p>
                    </div>
                    <div className="relative hidden h-14 flex-shrink-0 overflow-hidden sm:block sm:w-28">
                      <div
                        className="absolute bottom-[4px] left-0 right-0 h-[2px] rounded-full bg-slate-200/90"
                        style={{
                          backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 4px, rgb(148 163 184 / 0.85) 4px, rgb(148 163 184 / 0.85) 10px)",
                          backgroundSize: "12px 100%",
                          animation: "dashboard-road-scroll 2.24s linear infinite",
                        }}
                      />
                      <div
                        className="absolute bottom-0 left-[calc(50%-0.5rem)] flex -translate-x-1/2 items-center justify-center"
                        style={{ animation: "dashboard-car-float 1.5s ease-in-out infinite" }}
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
                      <div className="absolute bottom-2 right-0 flex flex-col items-center" aria-hidden>
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
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart
                        outerRadius="84%"
                        data={[
                          {
                            name: "수업 설계·운영",
                            score: diagnosisSummary.domain1,
                          },
                          {
                            name: "학생 이해·생활지도",
                            score: diagnosisSummary.domain2,
                          },
                          {
                            name: "평가·피드백",
                            score: diagnosisSummary.domain3,
                          },
                          {
                            name: "학급경영·안전",
                            score: diagnosisSummary.domain4,
                          },
                          {
                            name: "전문성 개발·성찰",
                            score: diagnosisSummary.domain5,
                          },
                          {
                            name: "소통·협력 및 포용",
                            score: diagnosisSummary.domain6,
                          },
                        ]}
                      >
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis
                          dataKey="name"
                          tick={{ fill: "#6b7280", fontSize: 11 }}
                        />
                        <Radar
                          name="역량 진단"
                          dataKey="score"
                          stroke="#6366f1"
                          fill="#6366f1"
                          fillOpacity={0.35}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  {diagnosisSummary && (
                    <Link href="/diagnosis/result">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full border-slate-300 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md inline-flex items-center gap-1.5"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        결과 보기
                      </Button>
                    </Link>
                  )}
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
                        자기역량개발계획
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        연간 역량 개발 목표를 세우고 실행 계획을 관리합니다.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Link href="/plan/print">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full border-slate-300 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md inline-flex items-center gap-1.5"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        계획서 보기
                      </Button>
                    </Link>
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
                    className={`flex min-h-0 flex-1 flex-col rounded-2xl p-4 shadow-sm backdrop-blur-sm transition-all relative ${
                      planCompleted
                        ? "border-0 ring-1 ring-violet-200/50 bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-indigo-50/70 hover:shadow-md hover:-translate-y-0.25 hover:from-violet-100/80 hover:via-violet-50/60 hover:to-indigo-100/70"
                        : "z-0 pointer-events-none border-slate-300 bg-slate-200/70 text-slate-500 saturate-0"
                    }`}
                  >
                    <div className="relative flex flex-col gap-3">
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
                            {mileageStarted ? "실행 중" : "미실시"}
                          </span>
                          <div className="rounded-2xl bg-slate-100 p-2 text-slate-600">
                            <Flag className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
                          목적지 마일리지
                        </h2>
                        <p className="mt-1 mb-[23px] text-xs text-slate-500">
                          실천한 활동을 마일리지로 적립하며 성장 여정을 기록합니다.
                        </p>
                      </div>
                      {mileageSummary && (
                        <div className="mt-2 flex flex-col gap-3">
                          {/* 전체 진행률: 나의 마일리지 — 막대 — % (첨부 스타일) */}
                          <div className="flex items-center gap-3 overflow-visible">
                            <span className="shrink-0 text-sm font-medium text-[#333]">Mileage</span>
                            <div className="relative h-[4.8px] min-w-0 flex-1 overflow-visible rounded-full bg-[#e0e2e7]">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-[#6366f1] transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(0, mileageSummary.overallProgress))}%`, minWidth: mileageSummary.overallProgress > 0 ? 2 : 0 }}
                              />
                              <div
                                className="absolute bottom-full left-0 mb-0.5 transition-all duration-500"
                                style={{
                                  left: `${Math.min(100, Math.max(0, mileageSummary.overallProgress))}%`,
                                  transform: "translate(-50%, 0) rotate(20deg)",
                                }}
                              >
                                <Plane className="h-[27px] w-[27px] text-[#6366f1]" strokeWidth={2} />
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
                                return (
                                  <div key={c.key} className="flex flex-col items-center gap-1">
                                    <div className="h-20 w-20 sm:h-24 sm:w-24">
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
                                          >
                                            {pieData.length ? pieData.map((d, j) => <Cell key={j} fill={d.fill} />) : <Cell fill={PIE_COLORS[i % PIE_COLORS.length]} />}
                                          </Pie>
                                        </PieChart>
                                      </ResponsiveContainer>
                                    </div>
                                    <span className="text-[10px] font-medium text-slate-600 leading-tight sm:text-xs">{c.label}</span>
                                    <span className="text-[10px] text-slate-400 sm:text-xs">{Math.round(c.progress)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Button
                          asChild
                          size="sm"
                          className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] px-4 text-[11px] font-semibold text-white shadow-sm hover:opacity-95"
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
                        <Link href="/diagnosis/result?type=post" className="shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md inline-flex items-center gap-1"
                          >
                            <Printer className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            결과 보기
                          </Button>
                        </Link>
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
                        <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">교사 성찰 기록장</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          성장의 결과를 서식에 맞게 작성합니다.
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2 min-w-0">
                        <Link href="/reflection/result-report" className="shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full border-slate-300 bg-white px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:shadow-md inline-flex items-center gap-1"
                          >
                            <Printer className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            결과 보기
                          </Button>
                        </Link>
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

          {isAdmin && (
            <div className="flex w-full flex-col gap-4">
              <p className="text-base font-semibold text-slate-800">{userSchool ? `${userSchool} 관리자 페이지` : "관리자 페이지"}</p>

              <div className="flex flex-wrap items-center justify-end gap-2">
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
                    .map((t) => (
                      <Card
                        key={t.id}
                        className="h-[1.62cm] max-h-[1.62cm] w-full overflow-x-auto overflow-y-hidden rounded-xl border-0 py-1.5 pl-8 pr-2 ring-1 ring-violet-200/50 shadow-sm"
                        style={{ background: "linear-gradient(to bottom right, rgb(245 243 255 / 0.9), rgb(238 242 255 / 0.4), rgb(238 242 255 / 0.5))" }}
                      >
                        <div className="flex h-full min-w-0 flex-row flex-nowrap items-center gap-2 sm:gap-3">
                          <div className="flex shrink-0 flex-col justify-center gap-0.5" style={{ width: "5rem" }}>
                            {t.gradeClass && <span className="truncate text-[10px] leading-tight text-slate-500">{t.gradeClass}</span>}
                            <p className="truncate text-sm font-semibold text-slate-800">{t.name || "-"}</p>
                          </div>

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
                            <span className="text-[11px] font-medium text-slate-500 sm:text-xs">Mileage</span>
                          </div>

                          <div className="flex shrink-0 flex-row items-center">
                            {t.mileageSummary.categories.map((c, i) => {
                              const val = Math.min(100, Math.max(0, c.progress));
                              const pieData = [
                                { name: "a", value: val, fill: PIE_COLORS[i % PIE_COLORS.length] },
                                { name: "b", value: 100 - val, fill: "#e2e8f0" },
                              ].filter((d) => d.value > 0);
                              return (
                                <div key={c.key} className="flex min-w-[4.25rem] flex-col items-center gap-0.5 sm:min-w-[4.75rem] md:min-w-[5rem]" title={`${c.label} ${Math.round(c.progress)}%`}>
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
                                      >
                                        {(pieData.length ? pieData : [{ fill: "#e2e8f0" }]).map((d, j) => (
                                          <Cell key={j} fill={d.fill} />
                                        ))}
                                      </Pie>
                                    </PieChart>
                                  </ResponsiveContainer>
                                  <span className="w-full truncate text-center text-[8px] text-slate-500 sm:text-[9px]">{c.label}</span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="ml-3 flex shrink-0 flex-row items-center gap-1 sm:ml-4 sm:gap-1.5">
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
                              <Link href={`/reflection/result-report?email=${encodeURIComponent(t.email)}&type=1`}>
                                <span className="inline-flex h-[30px] flex-col items-center justify-center rounded-md bg-emerald-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5"><span className="text-[9px] text-emerald-800 sm:text-[10px]">결과</span><span className="text-[9px] text-emerald-800 sm:text-[10px]">보고서1</span></span>
                              </Link>
                              <Link href={`/reflection/result-report?email=${encodeURIComponent(t.email)}&type=2`}>
                                <span className="inline-flex h-[30px] flex-col items-center justify-center rounded-md bg-emerald-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5"><span className="text-[9px] text-emerald-800 sm:text-[10px]">결과</span><span className="text-[9px] text-emerald-800 sm:text-[10px]">보고서2</span></span>
                              </Link>
                            </>
                          ) : (
                            <>
                              <span className="inline-flex h-[30px] cursor-not-allowed flex-col items-center justify-center rounded-md bg-slate-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5" title="미작성"><span className="text-[9px] text-slate-400 sm:text-[10px]">결과</span><span className="text-[9px] text-slate-400 sm:text-[10px]">보고서1</span></span>
                              <span className="inline-flex h-[30px] cursor-not-allowed flex-col items-center justify-center rounded-md bg-slate-100 px-2 py-1 leading-tight sm:h-[36px] sm:px-2.5" title="미작성"><span className="text-[9px] text-slate-400 sm:text-[10px]">결과</span><span className="text-[9px] text-slate-400 sm:text-[10px]">보고서2</span></span>
                            </>
                          )}
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-5 shrink-0 rounded-full border-amber-200 px-2 text-[10px] sm:h-6 sm:px-2.5 sm:text-xs"
                            style={{ background: "#fffbeb", color: "#92400e" }}
                            disabled={resettingPasswordId === t.id}
                            onClick={() => handleAdminResetPassword(t.id, t.name)}
                          >
                            <KeyRound className="mr-0.5 h-3 w-3 sm:mr-1 sm:h-3.5 sm:w-3.5" />
                            {resettingPasswordId === t.id ? "처리 중" : "비번 초기화"}
                          </Button>
                        </div>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

