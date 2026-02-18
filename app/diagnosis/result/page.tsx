"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useReactToPrint } from "react-to-print";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Printer, FileDown } from "lucide-react";

const DiagnosisResultCharts = dynamic(
  () => import("@/components/charts/DiagnosisResultCharts"),
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
  raw_answers: Record<string, number>;
  created_at: string;
  ai_analysis?: string | null;
};

const DOMAIN_LABELS: Record<string, string> = {
  domain1: "수업 설계·운영",
  domain2: "학생 이해·생활지도",
  domain3: "평가·피드백",
  domain4: "학급경영·안전",
  domain5: "전문성 개발·성찰",
  domain6: "소통·협력 및 포용적 교육",
};

const QUESTIONS: Array<{ id: string; text: string; domain: string }> = [
  { id: "1", text: "학습 목표를 학생 수준에 맞게 구체적 행동 목표로 제시한다.", domain: "domain1" },
  { id: "2", text: "성취기준과 수업 활동이 일관되게 연결되도록 수업을 설계한다.", domain: "domain1" },
  { id: "3", text: "학생 참여를 높이기 위해 질문, 토의, 활동을 균형 있게 운영한다.", domain: "domain1" },
  { id: "4", text: "수업 중 학생 반응에 따라 설명·활동을 조정(즉각적 수정)한다.", domain: "domain1" },
  { id: "5", text: "다양한 교수·학습 자료(교구/매체/실물 등)를 목적에 맞게 선택·활용한다.", domain: "domain1" },
  { id: "6", text: "학생의 발달 특성(인지·정서·사회성)을 고려하여 지도한다.", domain: "domain2" },
  { id: "7", text: "학생의 강점과 어려움을 파악하기 위해 관찰·대화·기록을 지속한다.", domain: "domain2" },
  { id: "8", text: "문제행동을 다룰 때 원인(상황/욕구)을 먼저 파악하고 지도한다.", domain: "domain2" },
  { id: "9", text: "갈등 상황에서 학생이 감정을 조절하고 관계를 회복하도록 돕는다.", domain: "domain2" },
  { id: "10", text: "학생의 다양성(가정·문화·개별차)을 존중하며 차별 없이 지도한다.", domain: "domain2" },
  { id: "11", text: "평가 계획을 수업 목표와 연계하여 사전에 안내한다.", domain: "domain3" },
  { id: "12", text: "수행평가에서 평가기준(루브릭 등)을 명확히 제시한다.", domain: "domain3" },
  { id: "13", text: "학생의 학습 과정을 평가에 반영하기 위해 형성평가를 활용한다.", domain: "domain3" },
  { id: "14", text: "피드백을 \"잘함/보완점/다음 전략\"처럼 구체적으로 제공한다.", domain: "domain3" },
  { id: "15", text: "평가 결과를 다음 수업 개선과 개별 지도에 실제로 반영한다.", domain: "domain3" },
  { id: "16", text: "학급 규칙과 기대 행동을 학생과 함께 정하고 일관되게 적용한다.", domain: "domain4" },
  { id: "17", text: "수업 전환(활동 이동, 정리, 모둠 전환 등)을 효율적으로 운영한다.", domain: "domain4" },
  { id: "18", text: "교실 환경(자리 배치, 자료 동선 등)을 학습에 도움이 되게 구성한다.", domain: "domain4" },
  { id: "19", text: "안전사고 예방을 위해 위험요소를 점검하고 예방지도를 실시한다.", domain: "domain4" },
  { id: "20", text: "위기 상황(사고·응급·폭력·재난 등) 발생 시 절차에 따라 침착하게 대응한다.", domain: "domain4" },
  { id: "21", text: "수업 후 성찰(기록/회고)을 통해 개선점을 구체화한다.", domain: "domain5" },
  { id: "22", text: "학생 학습자료, 평가 결과 등을 근거로 수업을 점검·개선한다.", domain: "domain5" },
  { id: "23", text: "연수·독서·연구회 등으로 새로운 교수법을 지속적으로 학습한다.", domain: "domain5" },
  { id: "24", text: "동료의 수업을 관찰하거나 피드백을 주고받으며 공동 성장한다.", domain: "domain5" },
  { id: "25", text: "교육 정책/지침 변화가 수업과 학급 운영에 미치는 영향을 파악하고 반영한다.", domain: "domain5" },
  { id: "26", text: "학부모와의 소통에서 학생의 강점과 성장 중심으로 신뢰를 형성한다.", domain: "domain6" },
  { id: "27", text: "민감한 사안(생활/평가/갈등)을 전달할 때 사실·근거·대안을 갖추어 설명한다.", domain: "domain6" },
  { id: "28", text: "담임·전담·특수/상담 등과 협력하여 학생 지원을 연계한다.", domain: "domain6" },
  { id: "29", text: "학습에 어려움이 있는 학생을 위해 지원(조정, 보조자료, 추가 지도)을 계획적으로 제공한다.", domain: "domain6" },
  { id: "30", text: "교실에서 모든 학생이 참여할 수 있도록 포용적 활동(역할, 수준, 참여 방식)을 설계한다.", domain: "domain6" },
];

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
  const [domainLabels, setDomainLabels] = useState<Record<string, string>>(DOMAIN_LABELS);
  const [domainLabelsReady, setDomainLabelsReady] = useState(false);
  const [diagnosisTitle, setDiagnosisTitle] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: isPost ? "나의 교원 역량 사후 진단 결과" : "나의 교원 역량 사전 진단 결과",
    pageStyle: `
      @page { size: A4; margin: 12mm; }
      html, body { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-content-area { background: #f8fafc !important; }
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
          await new Promise((r) => setTimeout(r, 100));
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
                if (postRes.data.ai_analysis) setAiAnalysis(postRes.data.ai_analysis as string);
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
                if (data.ai_analysis) setAiAnalysis(data.ai_analysis as string);
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
          if (postRes.data.ai_analysis) setAiAnalysis(postRes.data.ai_analysis as string);
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
          if (data.ai_analysis) setAiAnalysis(data.ai_analysis as string);
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
        const res = await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) {
          const j = await res.json();
          if (typeof j.title === "string" && j.title.trim()) setDiagnosisTitle(j.title.trim());
          if (Array.isArray(j.domains) && j.domains.length === 6) {
            const labels: Record<string, string> = {
              domain1: (j.domains[0]?.name ?? DOMAIN_LABELS.domain1).trim() || DOMAIN_LABELS.domain1,
              domain2: (j.domains[1]?.name ?? DOMAIN_LABELS.domain2).trim() || DOMAIN_LABELS.domain2,
              domain3: (j.domains[2]?.name ?? DOMAIN_LABELS.domain3).trim() || DOMAIN_LABELS.domain3,
              domain4: (j.domains[3]?.name ?? DOMAIN_LABELS.domain4).trim() || DOMAIN_LABELS.domain4,
              domain5: (j.domains[4]?.name ?? DOMAIN_LABELS.domain5).trim() || DOMAIN_LABELS.domain5,
              domain6: (j.domains[5]?.name ?? DOMAIN_LABELS.domain6).trim() || DOMAIN_LABELS.domain6,
            };
            setDomainLabels(labels);
          }
        }
      } catch {
        // 실패 시 기본 DOMAIN_LABELS 유지
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
        const preScores = {
          domain1: preResult.domain1,
          domain2: preResult.domain2,
          domain3: preResult.domain3,
          domain4: preResult.domain4,
          domain5: preResult.domain5,
          domain6: preResult.domain6,
        };
        const postScores = {
          domain1: diagnosisResult.domain1,
          domain2: diagnosisResult.domain2,
          domain3: diagnosisResult.domain3,
          domain4: diagnosisResult.domain4,
          domain5: diagnosisResult.domain5,
          domain6: diagnosisResult.domain6,
        };
        const res = await fetch("/api/ai-recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "analysis_post",
            preScores,
            postScores,
            preTotal: preResult.total_score,
            postTotal: diagnosisResult.total_score,
            domainLabels,
          }),
        });
        const json = await res.json();
        if (res.ok && json.recommendation) {
          setAiAnalysis(json.recommendation);
          await supabase
            .from("diagnosis_results")
            .update({ ai_analysis: json.recommendation })
            .eq("id", diagnosisResult.id);
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

  // 영역별 평균 점수 계산 (각 영역당 5문항) — 관리자 설정 역량명(domainLabels) 반영
  const domainAverages = [
    { domain: "domain1", label: domainLabels.domain1, avg: diagnosisResult.domain1 / 5, score: diagnosisResult.domain1 },
    { domain: "domain2", label: domainLabels.domain2, avg: diagnosisResult.domain2 / 5, score: diagnosisResult.domain2 },
    { domain: "domain3", label: domainLabels.domain3, avg: diagnosisResult.domain3 / 5, score: diagnosisResult.domain3 },
    { domain: "domain4", label: domainLabels.domain4, avg: diagnosisResult.domain4 / 5, score: diagnosisResult.domain4 },
    { domain: "domain5", label: domainLabels.domain5, avg: diagnosisResult.domain5 / 5, score: diagnosisResult.domain5 },
    { domain: "domain6", label: domainLabels.domain6, avg: diagnosisResult.domain6 / 5, score: diagnosisResult.domain6 },
  ];

  // 사후일 때 사전·사후 겹친 방사형용 데이터 및 향상된 영역
  const preAverages = preResult
    ? [
        { domain: "domain1", label: domainLabels.domain1, avg: preResult.domain1 / 5 },
        { domain: "domain2", label: domainLabels.domain2, avg: preResult.domain2 / 5 },
        { domain: "domain3", label: domainLabels.domain3, avg: preResult.domain3 / 5 },
        { domain: "domain4", label: domainLabels.domain4, avg: preResult.domain4 / 5 },
        { domain: "domain5", label: domainLabels.domain5, avg: preResult.domain5 / 5 },
        { domain: "domain6", label: domainLabels.domain6, avg: preResult.domain6 / 5 },
      ]
    : [];
  const radarCompareData =
    preResult && isPost
      ? domainAverages.map((d, i) => ({
          name: d.label,
          사전: preAverages[i]?.avg ?? 0,
          사후: d.avg,
        }))
      : null;
  const improvedDomains =
    isPost && preResult
      ? (["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const)
          .filter((key) => diagnosisResult[key] > preResult[key])
          .map((key) => domainLabels[key])
      : [];

  // 총점 100점 환산 (30문항×100점 = 3000 만점 → /30)
  const totalNorm = (diagnosisResult.total_score / (QUESTIONS.length * 100)) * 100;
  const preTotalNorm = preResult ? (preResult.total_score / (QUESTIONS.length * 100)) * 100 : 0;
  const barChartData = isPost && preResult ? [{ name: "사전", 점수: preTotalNorm }, { name: "사후", 점수: totalNorm }] : null;

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

  // 강점/약점 정렬 (사전 전용)
  const sorted = [...domainAverages].sort((a, b) => b.avg - a.avg);
  const strengths = sorted.slice(0, 3);
  const weaknesses = sorted.slice(-3);

  // 날짜 포맷팅 (24.06.03 형태)
  const date = new Date(diagnosisResult.created_at);
  const formattedDate = `${String(date.getFullYear()).slice(-2)}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;

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
                {userName} 님 / 진단 일시 : {formattedDate}
              </p>
            </div>
          </header>

        {/* 방사형 그래프 및 점수 (Recharts lazy) */}
        <div className="-mt-3 flex flex-col gap-4">
          {isPost && radarCompareData && barChartData ? (
            <DiagnosisResultCharts
              isPost
              radarCompareData={radarCompareData}
              barChartData={barChartData}
              domainAverages={[]}
              preDateStr={preDateStr}
              postDateStr={postDateStr}
              improvedDomains={improvedDomains}
            />
          ) : (
            <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 px-4 py-1 shadow-sm">
              <h2 className="text-base font-semibold text-slate-800 mb-0">역량 진단 결과</h2>
              <DiagnosisResultCharts
                isPost={false}
                radarCompareData={null}
                barChartData={null}
                domainAverages={domainAverages.map((d) => ({ name: d.label, score: d.avg }))}
                preDateStr=""
                postDateStr=""
              />
              <div className="mt-0.5 pt-0.5 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">총점</span>
                  <span className="text-sm font-bold text-slate-800">
                    {totalNorm.toFixed(1)}점 / 100점
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* 강점 영역(좌) / 개발 우선 영역(우) — 사전만 표시 */}
          {!isPost && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="rounded-2xl border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 p-3 shadow-sm">
              <h3 className="text-xs font-bold text-blue-700 mb-2">
                강점 영역 (상위 3)
              </h3>
              <div className="space-y-1">
                {strengths.map((item, index) => (
                  <div
                    key={item.domain}
                    className="flex items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1 shadow-sm"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-slate-700">
                        {item.label}
                      </span>
                      <span className="ml-1.5 text-[10px] text-slate-500">
                        ({item.avg.toFixed(1)}점)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-2xl border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-50 to-red-50 p-3 shadow-sm">
              <h3 className="text-xs font-bold text-orange-700 mb-2">
                개발 우선 영역 (하위 3)
              </h3>
              <div className="space-y-1">
                {weaknesses.map((item, index) => (
                  <div
                    key={item.domain}
                    className="flex items-center gap-1.5 rounded-lg bg-white/80 px-2 py-1 shadow-sm"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-slate-700">
                        {item.label}
                      </span>
                      <span className="ml-1.5 text-[10px] text-slate-500">
                        ({item.avg.toFixed(1)}점)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          )}
        </div>

        {/* 나의 결과 분석 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            나의 결과 분석
          </h2>
          {aiAnalysisLoading ? (
            <p className="text-sm text-slate-500">사전·사후 비교 분석을 생성하는 중입니다...</p>
          ) : aiAnalysis ? (
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                {aiAnalysis}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {isPost ? "사전·사후 비교 분석을 불러오는 중이거나, 분석 생성에 실패했을 수 있습니다." : "이 진단에 대한 결과 분석이 아직 없습니다. 진단을 다시 실시하면 제출 시 자동으로 생성됩니다."}
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
