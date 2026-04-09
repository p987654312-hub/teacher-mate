"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { maskDisplayName } from "@/lib/displayName";
import type { DiagnosisSurvey } from "@/lib/diagnosisSurvey";
import { computeSubDomainScores } from "@/lib/diagnosisSurvey";
import { Printer, FileDown, X } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  Tooltip,
} from "recharts";

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
  raw_answers: Record<string, number> & { _schema?: string };
  created_at: string;
  exam_date?: string | null;
  ai_analysis?: string | null;
  ai_analysis_report?: string | null;
  category_scores?: {
    domain1?: { score: number; count: number };
    domain2?: { score: number; count: number };
    domain3?: { score: number; count: number };
    domain4?: { score: number; count: number };
    domain5?: { score: number; count: number };
    domain6?: { score: number; count: number };
  };
};

const FALLBACK_DOMAIN_LABELS: Record<string, string> = {
  domain1: "영역1",
  domain2: "영역2",
  domain3: "영역3",
  domain4: "영역4",
  domain5: "영역5",
  domain6: "영역6",
};

function DiagnosisReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPost = searchParams.get("type") === "post";
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [preResult, setPreResult] = useState<DiagnosisResult | null>(null);
  const [domainLabels, setDomainLabels] = useState<Record<string, string>>(FALLBACK_DOMAIN_LABELS);
  const [diagnosisTitle, setDiagnosisTitle] = useState<string | null>(null);
  const [survey, setSurvey] = useState<DiagnosisSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: isPost ? "나의 교원 역량 사후 진단 결과 보고서" : "나의 교원 역량 사전 진단 결과 보고서",
    pageStyle: `
      @page { size: A4; margin: 12mm; }
      @media print {
        html, body {
          width: 186mm !important;
          min-width: 186mm !important;
          max-width: 186mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #ffffff !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          box-sizing: border-box;
        }
        .report-print-area {
          width: 186mm !important;
          min-width: 186mm !important;
          max-width: 186mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #ffffff !important;
          box-sizing: border-box;
        }
        .report-print-area * { box-sizing: border-box; }
      }
    `,
  });

  // 데이터 로드 (기존 결과 페이지와 동일한 조건으로)
  useEffect(() => {
    const fetchData = async () => {
      await supabase.auth.refreshSession();
      const viewEmailParam = searchParams.get("email")?.trim();

      const loadForEmail = async (targetEmail: string, displayName: string) => {
        try {
          setUserEmail(targetEmail);
          setUserName(displayName);
          setLoading(true);

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
            if (postRes.error || !postRes.data) {
              alert("진단 결과를 불러오는 중 오류가 발생했거나 결과가 없습니다.");
              router.push("/dashboard");
              return;
            }
            setDiagnosisResult(postRes.data as DiagnosisResult);
            if (preRes.data) setPreResult(preRes.data as DiagnosisResult);
            setSchoolName((postRes.data as any).school_name ?? null);
          } else {
            const { data, error } = await supabase
              .from("diagnosis_results")
              .select("*")
              .eq("user_email", targetEmail)
              .or("diagnosis_type.is.null,diagnosis_type.eq.pre")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (error || !data) {
              alert("진단 결과를 불러오는 중 오류가 발생했거나 결과가 없습니다.");
              router.push("/dashboard");
              return;
            }
            setDiagnosisResult(data as DiagnosisResult);
            setSchoolName((data as any).school_name ?? null);
          }

          // 역량명·설문 설정 로드
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            const res = await fetch("/api/diagnosis-settings", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            });
            if (res.ok) {
              const j = await res.json();
              const domains = Array.isArray(j.domains) && j.domains.length >= 2 && j.domains.length <= 6 ? j.domains : null;
              if (domains) {
                const labels: Record<string, string> = { ...FALLBACK_DOMAIN_LABELS };
                domains.forEach((d: { name?: string }, i: number) => {
                  const key = `domain${i + 1}`;
                  const name = (d?.name ?? "").trim();
                  if (name) labels[key] = name;
                });
                setDomainLabels(labels);
              }
              if (typeof j.title === "string") setDiagnosisTitle(j.title.trim() || null);
              if (j.survey) setSurvey(j.survey as DiagnosisSurvey);
            }
          }
        } finally {
          setLoading(false);
        }
      };

      if (viewEmailParam) {
        let { data: { session } } = await supabase.auth.getSession();
        let token = session?.access_token ?? null;
        if (!token) {
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
            await loadForEmail(targetEmail, displayName);
            return;
          }
        }
        alert("해당 교원 결과를 볼 수 없습니다.");
        router.push("/dashboard");
        return;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.replace("/");
        return;
      }
      const metadata = user.user_metadata as { role?: string; name?: string; full_name?: string } | undefined;
      if (metadata?.role !== "teacher" && metadata?.role !== "admin") {
        router.replace("/");
        return;
      }
      const raw = user.user_metadata as Record<string, unknown> | undefined;
      const displayName =
        (typeof raw?.name === "string" ? raw.name : null) ??
        metadata?.name ??
        metadata?.full_name ??
        (typeof raw?.full_name === "string" ? raw.full_name : null) ??
        user.email ??
        "교사";

      await loadForEmail(user.email!, displayName);
    };
    fetchData();
  }, [router, searchParams, isPost]);

  if (loading || !diagnosisResult || !userName) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">보고서를 불러오는 중입니다...</p>
      </div>
    );
  }

  const created = new Date(diagnosisResult.exam_date || diagnosisResult.created_at);
  const dateStr = `${created.getFullYear()}년 ${created.getMonth() + 1}월 ${created.getDate()}일`;

  // 영역별 평균 점수 계산
  const domainKeys = ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const;
  const category = diagnosisResult.category_scores ?? {};
  const getCount = (key: (typeof domainKeys)[number]) => (category[key]?.count ?? 5);
  const getScore = (key: (typeof domainKeys)[number]) => (diagnosisResult[key] as number) ?? 0;
  const getAvg = (key: (typeof domainKeys)[number], score: number) => score / (getCount(key) || 1);
  const domainAverages = domainKeys.map((k, i) => {
    const label = domainLabels[k] ?? FALLBACK_DOMAIN_LABELS[k];
    const cnt = getCount(k) || 1;
    const avg = getScore(k) / cnt;
    return { key: k, label, avg, index: i };
  }).filter((d) => d.avg > 0 || d.label !== FALLBACK_DOMAIN_LABELS[d.key]);

  const preAverages = preResult
    ? domainKeys.map((key) => {
        const dk = key as keyof Pick<DiagnosisResult, "domain1" | "domain2" | "domain3" | "domain4" | "domain5" | "domain6">;
        return {
          domain: key,
          label: domainLabels[key],
          avg: getAvg(key, (preResult[dk] as number) ?? 0),
        };
      })
    : [];

  const radarCompareData =
    isPost && preResult && domainAverages.length > 0
      ? domainAverages.map((d, i) => ({
          name: d.label,
          사전: preAverages.find((p) => p.domain === d.key)?.avg ?? 0,
          사후: d.avg,
        }))
      : null;

  let subDomainScoresByDomain: Record<string, { name: string; avg: number }[]> | null = null;
  if (survey && diagnosisResult.raw_answers) {
    const rawFromDb = diagnosisResult.raw_answers ?? {};
    const rawAnswers: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawFromDb)) {
      if (k === "_schema") continue;
      const num = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(num) && num >= 1 && num <= 5) rawAnswers[String(k)] = num;
    }
    const subByDomain = computeSubDomainScores(survey, rawAnswers);
    subDomainScoresByDomain = subByDomain;
  }

  const to100 = (avg1to5: number) => Math.round(Math.max(0, Math.min(100, avg1to5 * 20)));
  type BarRow = { name: string; 사전: number; 사후: number };
  let barChartDataByDomain: { label: string; rows: BarRow[] }[] = [];
  if (isPost && preResult && survey?.domains?.length && Array.isArray(survey.questions) && subDomainScoresByDomain) {
    const preRaw = (preResult.raw_answers ?? {}) as Record<string, unknown>;
    const preRawForSub: Record<string, number> = {};
    for (const [k, v] of Object.entries(preRaw)) {
      if (k === "_schema") continue;
      const num = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(num) && num >= 1 && num <= 5) preRawForSub[String(k)] = num;
    }
    const preSubByDomain = computeSubDomainScores(survey, preRawForSub);
    domainKeys.forEach((key, i) => {
      const label = domainLabels[key] ?? `역량${i + 1}`;
      const preAvg = preAverages[i]?.avg ?? 0;
      const postAvg = domainAverages.find((d) => d.key === key)?.avg ?? 0;
      const rows: BarRow[] = [];
      const postSubs = subDomainScoresByDomain?.[key] ?? [];
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
      if (rows.length === 0) {
        rows.push({ name: "평균", 사전: to100(preAvg), 사후: to100(postAvg) });
      }
      barChartDataByDomain.push({ label, rows });
    });
  }

  const formatDate = (isoOrDate: string) => {
    const d = new Date(isoOrDate);
    const y = String(d.getFullYear()).slice(-2);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  };
  const preDateStr = preResult ? formatDate(preResult.exam_date || preResult.created_at) : "";
  const postDateStr = formatDate(diagnosisResult.exam_date || diagnosisResult.created_at);

  const aiText = (diagnosisResult.ai_analysis_report ?? diagnosisResult.ai_analysis ?? "") || "";

  const YAxisTick = (props: { x: number; y: number; payload: any }) => {
    const { x, y, payload } = props;
    const dLabel = payload?.payload?.domainLabel ?? "";
    const sLabel = payload?.value ?? "";
    return (
      <text x={x} y={y} textAnchor="end" fontSize={9} fill="#374151">
        <tspan x={x} dy={-2}>{dLabel}</tspan>
        <tspan x={x} dy={10}>{sLabel}</tspan>
      </text>
    );
  };

  return (
    <div className="min-h-screen bg-white px-4 py-6">
      <div className="mx-auto max-w-4xl">
        {/* 상단 버튼: 인쇄(A4), PDF 저장, 닫기 */}
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
          <Button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Printer className="h-4 w-4" />
            인쇄 (A4)
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            title="인쇄 대화상자에서 대상을 'PDF로 저장'으로 선택하면 PDF 파일로 저장됩니다."
            className="inline-flex items-center gap-2 rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            <FileDown className="h-4 w-4" />
            PDF 저장
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg border-slate-400 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            닫기
          </Button>
        </div>

        {/* 출력용 보고서 영역 */}
        <div
          ref={contentRef}
          className="report-print-area rounded-lg bg-white p-6 shadow-lg print:shadow-none print:rounded-none print:p-0"
          style={{ minHeight: "297mm" }}
        >
          {/* 제목 */}
          <div className="mb-6 border-b-2 border-sky-200 bg-sky-50/80 py-3 text-center print:py-2">
            <h1 className="text-lg font-bold text-slate-800">
              {diagnosisTitle
                ? (isPost ? `(사후) ${diagnosisTitle}` : `(사전) ${diagnosisTitle}`)
                : (isPost ? "(사후) 나의 교원 역량 진단 결과" : "(사전) 나의 교원 역량 진단 결과")}
            </h1>
          </div>

          <div className="space-y-4 text-sm text-slate-800">
            {/* 기본 정보 */}
            <table className="w-full border-collapse border border-slate-300">
              <tbody>
                <tr>
                  <td className="w-24 border border-slate-300 bg-slate-50 px-2 py-1.5 font-medium">학교명</td>
                  <td className="border border-slate-300 px-2 py-1.5">{schoolName || "—"}</td>
                  <td className="w-24 border border-slate-300 bg-slate-50 px-2 py-1.5 font-medium">성명</td>
                  <td className="border border-slate-300 px-2 py-1.5">{userName ? maskDisplayName(userName) : "—"}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 bg-slate-50 px-2 py-1.5 font-medium">진단 시기</td>
                  <td className="border border-slate-300 px-2 py-1.5">{isPost ? "사후" : "사전"}</td>
                  <td className="border border-slate-300 bg-slate-50 px-2 py-1.5 font-medium">진단 일자</td>
                  <td className="border border-slate-300 px-2 py-1.5">{dateStr}</td>
                </tr>
              </tbody>
            </table>

            {/* 소영역까지 포함한 시각 요약 (방사형 + 소영역 막대) — 사후일 때 사전·사후 비교 */}
            <div>
              <div className="border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">역량별 점수 (시각 요약)</div>
              {domainAverages.length > 0 && (
                <div className="mt-3">
                  {isPost && radarCompareData && barChartDataByDomain.length > 0 ? (
                    <DiagnosisResultCharts
                      isPost
                      radarCompareData={radarCompareData}
                      barChartDataByDomain={barChartDataByDomain}
                      domainAverages={[]}
                      preDateStr={preDateStr}
                      postDateStr={postDateStr}
                      compact
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* 방사형 그래프 (대영역 요약) */}
                      <div className="h-56 border border-slate-200 bg-white rounded-md">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart
                            data={domainAverages.map((d) => ({ name: d.label, score: d.avg }))}
                            outerRadius="60%"
                            margin={{ top: 16, right: 32, bottom: 16, left: 32 }}
                          >
                            <PolarGrid stroke="#e5e7eb" />
                            <PolarAngleAxis
                              dataKey="name"
                              tick={{ fill: "#4b5563", fontSize: 11 }}
                            />
                            <PolarRadiusAxis
                              angle={90}
                              domain={[0, 5]}
                              tick={{ fill: "#9ca3af", fontSize: 10 }}
                            />
                            <Radar
                              name="역량 평균"
                              dataKey="score"
                              stroke="#6366f1"
                              fill="#6366f1"
                              fillOpacity={0.35}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* 소영역별 막대 (보고서용 카드 레이아웃) */}
                      <div className="border border-slate-200 bg-white rounded-md px-3 py-2 text-[11px] text-slate-800">
                        {subDomainScoresByDomain ? (
                          domainAverages.map((d) => {
                            const subs = subDomainScoresByDomain?.[d.key] ?? [];
                            if (!subs.length) return null;
                            return (
                              <div key={d.key} className="mb-2 last:mb-0">
                                <div className="mb-1 text-[11px] font-semibold text-slate-700">
                                  {d.label}
                                </div>
                                <div className="space-y-1">
                                  {subs.map((s) => (
                                    <div key={s.name} className="flex items-center gap-2 pl-4">
                                      <span className="w-24 truncate">{s.name}</span>
                                      <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                                        <div
                                          className="h-1.5 rounded-full bg-indigo-400"
                                          style={{ width: `${Math.max(0, Math.min(100, (s.avg / 5) * 100))}%` }}
                                        />
                                      </div>
                                      <span className="w-6 text-right text-[10px] text-slate-600">
                                        {s.avg.toFixed(1)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-[11px] text-slate-500">소영역 설정이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 강점/개발우선 소영역 요약 (설정에 소영역이 있을 때만) */}
            {subDomainScoresByDomain && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="border border-b-0 border-slate-300 bg-blue-50 px-2 py-1 font-medium text-blue-800">강점 영역 및 소영역</div>
                  <div className="border border-slate-300 px-2 py-1.5 min-h-[3rem]">
                    {domainAverages
                      .slice()
                      .sort((a, b) => b.avg - a.avg)
                      .map((d) => {
                        const subs = subDomainScoresByDomain?.[d.key] ?? [];
                        if (!subs.length) return null;
                        return (
                          <div key={d.key} className="mb-1">
                            <div className="text-xs font-semibold text-blue-800">{d.label} ({d.avg.toFixed(1)})</div>
                            <div className="text-[11px] text-slate-700">
                              {subs
                                .slice()
                                .sort((a, b) => b.avg - a.avg)
                                .map((s) => `${s.name} ${s.avg.toFixed(1)}`)
                                .join(", ")}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
                <div>
                  <div className="border border-b-0 border-slate-300 bg-orange-50 px-2 py-1 font-medium text-orange-800">개발 우선 영역 및 소영역</div>
                  <div className="border border-slate-300 px-2 py-1.5 min-h-[3rem]">
                    {domainAverages
                      .slice()
                      .sort((a, b) => a.avg - b.avg)
                      .map((d) => {
                        const subs = subDomainScoresByDomain?.[d.key] ?? [];
                        if (!subs.length) return null;
                        return (
                          <div key={d.key} className="mb-1">
                            <div className="text-xs font-semibold text-orange-800">{d.label} ({d.avg.toFixed(1)})</div>
                            <div className="text-[11px] text-slate-700">
                              {subs
                                .slice()
                                .sort((a, b) => a.avg - b.avg)
                                .map((s) => `${s.name} ${s.avg.toFixed(1)}`)
                                .join(", ")}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* 결과 분석 (AI) */}
            <div>
              <div className="border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">결과 분석</div>
              <div className="min-h-[4rem] border border-slate-300 px-2 py-1.5 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                {aiText || "분석 내용이 없습니다."}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center print:hidden">
          <Link href="/dashboard" className="text-sm text-slate-500 underline hover:text-slate-700">
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DiagnosisReportPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-slate-500">보고서 로딩 중...</div>}>
      <DiagnosisReportContent />
    </Suspense>
  );
}

