"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useReactToPrint } from "react-to-print";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { maskDisplayName } from "@/lib/displayName";
import type { DiagnosisSurvey } from "@/lib/diagnosisSurvey";
import { computeSubDomainScores } from "@/lib/diagnosisSurvey";
import { ArrowLeft, Printer, FileDown, RefreshCw } from "lucide-react";

const DiagnosisResultCharts = dynamic(
  () => import("@/components/charts/DiagnosisResultCharts"),
  { ssr: false }
);
const DiagnosisResultRadarWithSub = dynamic(
  () => import("@/components/charts/DiagnosisResultRadarWithSub"),
  { ssr: false }
);

type DiagnosisResult = {
  id: string;
  user_email: string;
  school_name: string | null;
  domain1: number;
  domain2: number;
  domain3: number;
  domain4: number;
  domain5: number;
  domain6: number;
  total_score: number;
  raw_answers: Record<string, number> & { _schema?: string };
  created_at: string;
  ai_analysis?: string | null;
  category_scores?: {
    domain1?: { score: number; count: number };
    domain2?: { score: number; count: number };
    domain3?: { score: number; count: number };
    domain4?: { score: number; count: number };
    domain5?: { score: number; count: number };
    domain6?: { score: number; count: number };
  };
};

/** 설정 로드 전 임시 표시용 (실제 역량명은 diagnosis-settings에서 로드) */
const FALLBACK_DOMAIN_LABELS: Record<string, string> = {
  domain1: "영역1",
  domain2: "영역2",
  domain3: "영역3",
  domain4: "영역4",
  domain5: "영역5",
  domain6: "영역6",
};

const DEFAULT_6_DOMAIN_QUESTION_COUNT = 30;

function DiagnosisResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPost = searchParams.get("type") === "post";
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [preResult, setPreResult] = useState<DiagnosisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [domainLabels, setDomainLabels] = useState<Record<string, string>>(FALLBACK_DOMAIN_LABELS);
  const [domainLabelsReady, setDomainLabelsReady] = useState(false);
  const [diagnosisTitle, setDiagnosisTitle] = useState<string | null>(null);
  const [survey, setSurvey] = useState<DiagnosisSurvey | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: isPost ? "나의 교원 역량 사후 진단 결과" : "나의 교원 역량 사전 진단 결과",
    pageStyle: `
      @page { size: A4; margin: 12mm; }
      @media print {
        html, body {
          width: 186mm !important;
          min-width: 186mm !important;
          max-width: 186mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #f8fafc !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          box-sizing: border-box;
        }
        .print-content-area {
          width: 186mm !important;
          min-width: 186mm !important;
          max-width: 186mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #f8fafc !important;
          box-sizing: border-box;
        }
        .print-content-area * { box-sizing: border-box; }
      }
    `,
  });

  // 보호된 라우트 및 진단 결과 가져오기 (관리자는 ?email= 로 다른 교원 결과 조회)
  useEffect(() => {
    const fetchData = async () => {
      await supabase.auth.refreshSession();
      const viewEmailParam = searchParams.get("email")?.trim();

      // 관리자 링크(?email=)로 들어온 경우: 세션 토큰만으로 먼저 검증 (새 탭에서 세션 지연 대비)
      if (viewEmailParam) {
        let token: string | null = null;
        let { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token ?? null;
        if (!token) {
          await new Promise((r) => setTimeout(r, 50));
          await supabase.auth.refreshSession();
          const next = await supabase.auth.getSession();
          session = next.data.session;
          token = session?.access_token ?? null;
        }
        if (token) {
          const res = await fetch("/api/admin/verify-teacher-email", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email: viewEmailParam }),
          });
          if (res.ok) {
            const j = await res.json();
            const targetEmail = j.email ?? viewEmailParam;
            const displayName = j.name || targetEmail || "교사";
            setUserEmail(targetEmail);
            setUserName(displayName);
            setIsChecking(false);
            try {
              setIsLoading(true);
              if (isPost) {
                const [postRes, preRes] = await Promise.all([
                  supabase.from("diagnosis_results").select("*").eq("user_email", targetEmail).eq("diagnosis_type", "post").order("created_at", { ascending: false }).limit(1).maybeSingle(),
                  supabase.from("diagnosis_results").select("*").eq("user_email", targetEmail).or("diagnosis_type.is.null,diagnosis_type.eq.pre").order("created_at", { ascending: false }).limit(1).maybeSingle(),
                ]);
                if (postRes.error) {
                  console.error("Error fetching diagnosis result:", postRes.error);
                  alert("진단 결과를 불러오는 중 오류가 발생했습니다.");
                  router.push("/dashboard");
                  return;
                }
                if (!postRes.data) {
                  alert("진단 결과가 없습니다.");
                  router.push("/dashboard");
                  return;
                }
                setDiagnosisResult(postRes.data as DiagnosisResult);
                const reportAnalysis = (postRes.data as { ai_analysis_report?: string | null; ai_analysis?: string | null }).ai_analysis_report
                  ?? (postRes.data as { ai_analysis?: string | null }).ai_analysis;
                if (reportAnalysis) setAiAnalysis(reportAnalysis as string);
                if (preRes.data) setPreResult(preRes.data as DiagnosisResult);
              } else {
                const { data, error } = await supabase.from("diagnosis_results").select("*").eq("user_email", targetEmail).or("diagnosis_type.is.null,diagnosis_type.eq.pre").order("created_at", { ascending: false }).limit(1).maybeSingle();
                if (error) {
                  console.error("Error fetching diagnosis result:", error);
                  alert("진단 결과를 불러오는 중 오류가 발생했습니다.");
                  router.push("/dashboard");
                  return;
                }
                if (!data) {
                  alert("진단 결과가 없습니다.");
                  router.push("/dashboard");
                  return;
                }
                setDiagnosisResult(data as DiagnosisResult);
                const reportAnalysis = (data as { ai_analysis_report?: string | null; ai_analysis?: string | null }).ai_analysis_report ?? (data as { ai_analysis?: string | null }).ai_analysis;
                if (reportAnalysis) setAiAnalysis(reportAnalysis as string);
              }
            } catch (err) {
              console.error(err);
              alert("진단 결과를 불러오는 중 오류가 발생했습니다.");
              router.push("/dashboard");
            } finally {
              setIsLoading(false);
            }
            return;
          }
          const j = await res.json().catch(() => ({}));
          alert(j?.error ?? "해당 교원 결과를 볼 수 없습니다.");
          router.push("/dashboard");
          return;
        }
        // ?email= 로 들어왔지만 세션 없음 → 로그인 화면으로 보내지 않고 대시보드로
        alert("로그인 세션이 인식되지 않았습니다. 같은 창에서 링크를 열거나, 대시보드에서 다시 시도해 주세요.");
        router.push("/dashboard");
        return;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.replace("/");
        return;
      }

      const metadata = user.user_metadata as
        | { role?: string; name?: string; full_name?: string }
        | undefined;
      const role = metadata?.role;

      let targetEmail: string;
      let displayName: string;

      // 관리자도 교원 권한을 가지므로 자신의 데이터를 볼 수 있음
      if (role === "teacher" || role === "admin") {
        targetEmail = user.email!;
        const raw = user.user_metadata as Record<string, unknown> | undefined;
        displayName =
          (typeof raw?.name === "string" ? raw.name : null) ??
          metadata?.name ??
          metadata?.full_name ??
          (typeof (raw?.full_name) === "string" ? raw.full_name : null) ??
          user.email ??
          "교사";
      } else {
        router.replace("/");
        return;
      }

      setUserEmail(targetEmail);
      setUserName(displayName);
      setIsChecking(false);

      try {
        setIsLoading(true);
        if (isPost) {
          const [postRes, preRes] = await Promise.all([
            supabase
              .from("diagnosis_results")
              .select("*")
              .eq("user_email", targetEmail)
              .eq("diagnosis_type", "post")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("diagnosis_results")
              .select("*")
              .eq("user_email", targetEmail)
              .or("diagnosis_type.is.null,diagnosis_type.eq.pre")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
          if (postRes.error) {
            console.error("Error fetching diagnosis result:", postRes.error);
            alert("진단 결과를 불러오는 중 오류가 발생했습니다.");
            router.push("/dashboard");
            return;
          }
          if (!postRes.data) {
            alert("진단 결과가 없습니다.");
            router.push("/dashboard");
            return;
          }
          setDiagnosisResult(postRes.data as DiagnosisResult);
          const reportAnalysis = (postRes.data as { ai_analysis_report?: string | null; ai_analysis?: string | null }).ai_analysis_report
                  ?? (postRes.data as { ai_analysis?: string | null }).ai_analysis;
                if (reportAnalysis) setAiAnalysis(reportAnalysis as string);
          if (preRes.data) setPreResult(preRes.data as DiagnosisResult);
        } else {
          const { data, error } = await supabase
            .from("diagnosis_results")
            .select("*")
            .eq("user_email", targetEmail)
            .or("diagnosis_type.is.null,diagnosis_type.eq.pre")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) {
            console.error("Error fetching diagnosis result:", error);
            alert("진단 결과를 불러오는 중 오류가 발생했습니다.");
            router.push("/dashboard");
            return;
          }
          if (!data) {
            alert("진단 결과가 없습니다.");
            router.push("/dashboard");
            return;
          }
          setDiagnosisResult(data as DiagnosisResult);
          const reportAnalysis = (data as { ai_analysis_report?: string | null; ai_analysis?: string | null }).ai_analysis_report ?? (data as { ai_analysis?: string | null }).ai_analysis;
                if (reportAnalysis) setAiAnalysis(reportAnalysis as string);
        }
      } catch (error) {
        console.error(error);
        alert("진단 결과를 불러오는 중 오류가 발생했습니다.");
        router.push("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [router, isPost, searchParams]);

  // 관리자가 변경한 검사 설정(역량명·제목) 반영 — 결과 화면에서 항상 현재 학교 설정 사용
  useEffect(() => {
    if (isChecking) return;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDomainLabelsReady(true);
        return;
      }
      try {
        const res = await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (typeof j.title === "string" && j.title.trim()) setDiagnosisTitle(j.title.trim());
          if (j.useSurvey && j.survey?.domains?.length >= 2 && j.survey?.domains?.length <= 6 && Array.isArray(j.survey?.questions)) {
            setSurvey(j.survey as DiagnosisSurvey);
          } else {
            setSurvey(null);
          }
          if (Array.isArray(j.domains)) {
            const labels: Record<string, string> = { ...FALLBACK_DOMAIN_LABELS };
            const defKeys = ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const;
            for (let i = 0; i < j.domains.length; i++) {
              const key = defKeys[i];
              const raw = (j.domains[i]?.name ?? FALLBACK_DOMAIN_LABELS[key]).trim();
              const name = raw || FALLBACK_DOMAIN_LABELS[key] || `영역${i + 1}`;
              if (key) labels[key] = name;
            }
            setDomainLabels(labels);
          }
        }
      } catch {
        // 실패 시 FALLBACK_DOMAIN_LABELS 유지
      } finally {
        setDomainLabelsReady(true);
      }
    };
    load();
  }, [isChecking]);

  // 사후 결과 전용: 사전·사후 비교 분석 요청 (저장된 ai_analysis 없을 때만, 역량명 로드 후)
  useEffect(() => {
    if (!isPost || !diagnosisResult || !preResult || !domainLabelsReady || aiAnalysis || aiAnalysisLoading) return;
    const run = async () => {
      setAiAnalysisLoading(true);
      try {
        const cat = diagnosisResult.category_scores as Record<string, { count?: number }> | undefined;
        const getCount = (key: string) => (cat?.[key]?.count ?? 5);
        const keys = survey?.domains?.length
          ? (survey.domains.map((_, i) => `domain${i + 1}`) as string[])
          : ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"];
        const preScoresAvg: Record<string, number> = {};
        const postScoresAvg: Record<string, number> = {};
        type DomainKey = keyof Pick<DiagnosisResult, "domain1" | "domain2" | "domain3" | "domain4" | "domain5" | "domain6">;
        keys.forEach((k) => {
          const key = k as DomainKey;
          preScoresAvg[k] = preResult[key] != null ? (preResult[key] as number) / (getCount(k) || 1) : 0;
          postScoresAvg[k] = diagnosisResult[key] != null ? (diagnosisResult[key] as number) / (getCount(k) || 1) : 0;
        });
        const totalQ = keys.reduce((s, k) => s + (getCount(k) || 5), 0);
        const maxTotal = totalQ * 5;
        const preTotalNorm = maxTotal > 0 ? Math.round((preResult.total_score / maxTotal) * 100) : 0;
        const postTotalNorm = maxTotal > 0 ? Math.round((diagnosisResult.total_score / maxTotal) * 100) : 0;
        const labelsOnly: Record<string, string> = {};
        keys.forEach((k) => {
          labelsOnly[k] = domainLabels[k] ?? k;
        });
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          alert("로그인이 필요합니다.");
          return;
        }
        const res = await fetch("/api/ai-recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: "analysis_post",
            preScores: preScoresAvg,
            postScores: postScoresAvg,
            preTotal: preTotalNorm,
            postTotal: postTotalNorm,
            domainLabels: labelsOnly,
            domainKeys: keys,
          }),
        });
        const json = await res.json();
        if (res.ok && json.recommendation) {
          setAiAnalysis(json.recommendation);
          const analysisText = json.recommendation;
          await supabase
            .from("diagnosis_results")
            .update({ ai_analysis: analysisText, ai_analysis_report: analysisText })
            .eq("id", diagnosisResult.id);
        } else if (json?.code === "QUOTA_EXCEEDED") {
          alert(json.error);
        }
      } catch (e) {
        console.error("사후 비교 분석 요청 실패:", e);
      } finally {
        setAiAnalysisLoading(false);
      }
    };
    run();
  }, [isPost, diagnosisResult?.id, preResult?.id, domainLabelsReady, domainLabels, aiAnalysis, aiAnalysisLoading]);

  if (isChecking || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">
          {isChecking ? "사용자 정보를 확인하는 중입니다..." : "진단 결과를 불러오는 중입니다..."}
        </p>
      </div>
    );
  }

  if (!diagnosisResult) {
    return null;
  }

  // 역량명(설정) 로드 전까지 대기 → 개발초기 기본 역량명이 0.1초간 보이는 깜빡임 제거
  if (!domainLabelsReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">결과를 불러오는 중...</p>
      </div>
    );
  }

  const is4Domain = diagnosisResult.raw_answers?._schema === "v4";
  const domainKeys =
    survey && survey.domains?.length
      ? (survey.domains.map((_, i) => `domain${i + 1}`) as readonly string[])
      : (["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const);
  const cat = diagnosisResult.category_scores;
  type CatKey = keyof NonNullable<typeof cat>;
  type DomainKey = keyof Pick<DiagnosisResult, "domain1" | "domain2" | "domain3" | "domain4" | "domain5" | "domain6">;
  const getCount = (key: string) => (cat?.[key as CatKey]?.count ?? 5);
  const getAvg = (key: (typeof domainKeys)[number], score: number) =>
    score / (getCount(key) || 1);

  // 영역별 평균 점수 — 4영역(v4)이면 4개만, 역량명(domainLabels) 반영
  const domainAverages = domainKeys.map((key) => {
    const dk = key as DomainKey;
    return {
      domain: key,
      label: domainLabels[key],
      avg: getAvg(key, diagnosisResult[dk]),
      score: diagnosisResult[dk],
    };
  });

  const preAverages = preResult
    ? domainKeys.map((key) => {
        const dk = key as DomainKey;
        return {
          domain: key,
          label: domainLabels[key],
          avg: getAvg(key, preResult[dk]),
        };
      })
    : [];
  const radarCompareData =
    preResult && isPost
      ? domainAverages.map((d, i) => ({
          name: d.label,
          사전: preAverages[i]?.avg ?? 0,
          사후: d.avg,
        }))
      : null;
  // CSV 설문(4/6영역) 있으면 소영역 점수 계산 (막대그래프·기타에서 사용)
  const rawFromDb = (diagnosisResult.raw_answers ?? {}) as Record<string, unknown>;
  const rawAnswersForSub: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawFromDb)) {
    if (k === "_schema") continue;
    const num = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(num) && num >= 1 && num <= 5) rawAnswersForSub[String(k)] = num;
  }
  const subDomainScoresByDomain =
    survey?.domains?.length && Array.isArray(survey.questions)
      ? computeSubDomainScores(survey, rawAnswersForSub)
      : null;

  // 총점 100점 환산 (실제 역량 수·문항 수 반영)
  const totalQuestionCount = domainKeys.reduce((s, k) => s + (getCount(k) || 5), 0);
  const maxTotal = totalQuestionCount * 5;
  const totalNorm = maxTotal > 0 ? (diagnosisResult.total_score / maxTotal) * 100 : 0;
  const preTotalNorm = preResult && maxTotal > 0 ? (preResult.total_score / maxTotal) * 100 : 0;

  // 사후 보고서: 대영역별 막대그래프 데이터 (카드당 1개 대영역 + 해당 소영역들)
  const to100 = (avg1to5: number) => Math.round(Math.max(0, Math.min(100, avg1to5 * 20)));
  type BarRow = { name: string; 사전: number; 사후: number };
  let barChartDataByDomain: { label: string; rows: BarRow[] }[] = [];
  if (isPost && preResult) {
    let preSubByDomain: Record<string, { name: string; sum: number; count: number; avg: number }[]> | null = null;
    if (survey?.domains?.length && Array.isArray(survey.questions) && subDomainScoresByDomain) {
      const preRaw = (preResult.raw_answers ?? {}) as Record<string, unknown>;
      const preRawForSub: Record<string, number> = {};
      for (const [k, v] of Object.entries(preRaw)) {
        if (k === "_schema") continue;
        const num = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(num) && num >= 1 && num <= 5) preRawForSub[String(k)] = num;
      }
      preSubByDomain = computeSubDomainScores(survey, preRawForSub);
    }
    domainKeys.forEach((key, i) => {
      const label = domainLabels[key] || `역량${i + 1}`;
      const preAvg = preAverages[i]?.avg ?? 0;
      const postAvg = domainAverages[i]?.avg ?? 0;
      const rows: BarRow[] = [];
      if (preSubByDomain && subDomainScoresByDomain) {
        const postSubs = subDomainScoresByDomain[key] ?? [];
        const preSubs = preSubByDomain[key] ?? [];
        postSubs.forEach((postSub) => {
          const preSub = preSubs.find((s) => s.name === postSub.name);
          const preAvgSub = preSub ? preSub.avg : 0;
          rows.push({
            name: postSub.name.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(),
            사전: to100(preAvgSub),
            사후: to100(postSub.avg),
          });
        });
      }
      // 소영역이 없으면 대영역 평균 1개라도 표시해서 빈칸 방지
      if (rows.length === 0) {
        rows.push({ name: "평균", 사전: to100(preAvg), 사후: to100(postAvg) });
      }
      barChartDataByDomain.push({ label, rows });
    });
  }

  // 방사형 범례용 검사일 (사전·사후)
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const y = String(d.getFullYear()).slice(-2);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  };
  const preDateStr = preResult ? formatDate(preResult.created_at) : "";
  const postDateStr = diagnosisResult ? formatDate(diagnosisResult.created_at) : "";

  // 강점/개발 우선 영역 (홀수 대영역이면 강점 3개·개발 2개, 짝수면 반반)
  const sorted = [...domainAverages].sort((a, b) => b.avg - a.avg);
  const domainCount = domainKeys.length;
  const strengthN = Math.ceil(domainCount / 2);
  const weaknessN = domainCount - strengthN;
  const strengths = sorted.slice(0, strengthN);
  const weaknesses = weaknessN > 0 ? [...sorted.slice(-weaknessN)].reverse() : [];

  // 날짜 포맷팅 (24.06.03 형태)
  const date = new Date(diagnosisResult.created_at);
  const formattedDate = `${String(date.getFullYear()).slice(-2)}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;

  // 사전검사 전용: 결과 분석 다시 생성
  const handleRedoAnalysis = async () => {
    setAiAnalysisLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }
      const domainScoresText = domainAverages.map((d) => `${d.label}: ${d.avg.toFixed(1)}점`).join(", ");
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "analysis",
          strongDomains: strengths.map((s) => s.label),
          weakDomains: weaknesses.map((w) => w.label),
          domainScores: domainScoresText,
          totalScore: Math.round(totalNorm),
          domainCount: domainKeys.length,
        }),
      });
      const json = await res.json();
      if (res.ok && json.recommendation) {
        setAiAnalysis(json.recommendation);
        const analysisText = json.recommendation;
        await supabase.from("diagnosis_results").update({ ai_analysis: analysisText, ai_analysis_report: analysisText }).eq("id", diagnosisResult.id);
      } else {
        alert(json?.code === "QUOTA_EXCEEDED" ? json.error : "분석 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch (e) {
      console.error(e);
      alert("분석 생성에 실패했습니다.");
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* 출력/PDF 대상: 헤더 + 본문 (우상단 버튼은 인쇄 시 숨김) */}
        <div ref={contentRef} className="print-content-area flex flex-col gap-6 rounded-none print:bg-[#f8fafc]">
          {/* 헤더: 왼쪽 돌아가기, 가운데 제목, 오른쪽 출력·PDF·날짜 */}
          <header className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
            <div className="flex items-center print:hidden">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                돌아가기
              </Link>
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
                {diagnosisTitle
                  ? (isPost ? `(사후) ${diagnosisTitle} 결과` : `(사전) ${diagnosisTitle} 결과`)
                  : (isPost ? "(사후) 나의 교원 역량 진단 결과" : "나의 교원 역량 사전 진단 결과")}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2 print:hidden">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrint()}
                  className="rounded-full border-slate-300"
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5" />
                  출력
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrint()}
                  title="인쇄 대화상자에서 대상을 'PDF로 저장'으로 선택하면 PDF 파일로 저장됩니다."
                  className="rounded-full border-slate-300"
                >
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                  PDF 저장
                </Button>
              </div>
              <p className="text-sm text-slate-600 mt-[0.5cm]">
                {userName ? maskDisplayName(userName) : ""} 님 / 진단 일시 : {formattedDate}
              </p>
            </div>
          </header>

        {/* 방사형 그래프 및 점수 (Recharts lazy) */}
        <div className="-mt-3 flex flex-col gap-4">
          {isPost && radarCompareData && barChartDataByDomain.length > 0 ? (
            <DiagnosisResultCharts
              isPost
              radarCompareData={radarCompareData}
              barChartDataByDomain={barChartDataByDomain}
              domainAverages={[]}
              preDateStr={preDateStr}
              postDateStr={postDateStr}
            />
          ) : (
            <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 px-4 py-1 shadow-sm">
              <h2 className="text-base font-semibold text-slate-800 mb-0">역량 진단 결과</h2>
              {subDomainScoresByDomain ? (
                <DiagnosisResultRadarWithSub
                  domainAverages={domainAverages.map((d) => ({ name: d.label, score: d.avg }))}
                  subDomainScoresByDomain={subDomainScoresByDomain}
                  domainLabels={domainLabels}
                  domainOrder={domainKeys}
                />
              ) : (
                <DiagnosisResultCharts
                  isPost={false}
                  radarCompareData={null}
                  barChartDataByDomain={null}
                  domainAverages={domainAverages.map((d) => ({ name: d.label, score: d.avg }))}
                  preDateStr=""
                  postDateStr=""
                />
              )}
            </Card>
          )}

          {/* 강점 영역(좌) / 개발 우선 영역(우) — 사전만 표시 */}
          {!isPost && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="rounded-2xl border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 p-3 shadow-sm">
              <h3 className="text-xs font-bold text-blue-700 mb-2">
                강점 영역
              </h3>
              <div className="space-y-2">
                {strengths.map((item, index) => {
                  const subList = subDomainScoresByDomain?.[item.domain]
                    ? [...subDomainScoresByDomain[item.domain]].sort((a, b) => b.avg - a.avg)
                    : [];
                  return (
                    <div key={item.domain} className="flex gap-2 items-center">
                      <div className="flex items-center gap-1.5 shrink-0 rounded-lg bg-white/80 px-2 py-1.5 shadow-sm min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                          {index + 1}
                        </span>
                        <span className="text-xs font-medium text-slate-700 truncate">{item.label}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">({item.avg.toFixed(1)})</span>
                      </div>
                      {subList.length > 0 ? (
                        <ul className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-800">
                          {subList.map((s) => (
                            <li key={s.name}>{s.name} ({s.avg.toFixed(1)})</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="rounded-2xl border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-50 to-red-50 p-3 shadow-sm">
              <h3 className="text-xs font-bold text-orange-700 mb-2">
                개발 우선 영역
              </h3>
              <div className="space-y-2">
                {weaknesses.map((item, index) => {
                  const subList = subDomainScoresByDomain?.[item.domain]
                    ? [...subDomainScoresByDomain[item.domain]].sort((a, b) => a.avg - b.avg)
                    : [];
                  return (
                    <div key={item.domain} className="flex gap-2 items-center">
                      <div className="flex items-center gap-1.5 shrink-0 rounded-lg bg-white/80 px-2 py-1.5 shadow-sm min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                          {index + 1}
                        </span>
                        <span className="text-xs font-medium text-slate-700 truncate">{item.label}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">({item.avg.toFixed(1)})</span>
                      </div>
                      {subList.length > 0 ? (
                        <ul className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-800">
                          {subList.map((s) => (
                            <li key={s.name}>{s.name} ({s.avg.toFixed(1)})</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
          )}
        </div>

        {/* 사전·사후 진단 비교 분석 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              사전·사후 진단 비교 분석
            </h2>
            {!isPost && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="print:hidden shrink-0 rounded-lg border-slate-300 text-slate-600 hover:bg-slate-50"
                onClick={handleRedoAnalysis}
                disabled={aiAnalysisLoading}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${aiAnalysisLoading ? "animate-spin" : ""}`} />
                결과 분석 다시하기
              </Button>
            )}
          </div>
          {aiAnalysisLoading ? (
            <p className="text-sm text-slate-500">{isPost ? "사전·사후 비교 분석을 생성하는 중입니다..." : "결과 분석을 생성하는 중입니다..."}</p>
          ) : aiAnalysis ? (
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                {aiAnalysis}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {isPost ? "사전·사후 비교 분석을 불러오는 중이거나, 분석 생성에 실패했을 수 있습니다." : "이 진단에 대한 결과 분석이 아직 없습니다. 위 버튼을 눌러 생성하거나, 진단을 다시 실시하면 제출 시 자동으로 생성됩니다."}
            </p>
          )}
        </Card>
        </div>

        {/* 본문 우측 하단 돌아가기 버튼 */}
        <div className="flex justify-end pt-4">
          <Link href="/dashboard">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-slate-300"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              돌아가기
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DiagnosisResultPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white"><p className="text-sm text-slate-500">불러오는 중...</p></div>}>
      <DiagnosisResultContent />
    </Suspense>
  );
}
