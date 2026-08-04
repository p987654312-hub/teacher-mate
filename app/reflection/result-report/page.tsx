"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { MILEAGE_CATEGORIES } from "@/lib/mileageProgress";
import { maskDisplayName, resolveAffiliation } from "@/lib/displayName";
import type { DiagnosisSurvey } from "@/lib/diagnosisSurvey";
import { computeSubDomainScores } from "@/lib/diagnosisSurvey";
import { Printer, FileDown, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { downloadPdf, printDocument } from "@/lib/printWithPageNumbers";
import { buildSelfEvalHtml, downloadSelfEvalPdf, printSelfEvalDocument } from "@/lib/selfEvalDocument";
const ReflectionRadarCharts = dynamic(() => import("@/components/charts/ReflectionRadarCharts"), { ssr: false });
const DiagnosisResultCharts = dynamic(() => import("@/components/charts/DiagnosisResultCharts"), { ssr: false });

const FALLBACK_DOMAIN_LABELS: Record<string, string> = {
  domain1: "영역1",
  domain2: "영역2",
  domain3: "영역3",
  domain4: "영역4",
  domain5: "영역5",
  domain6: "영역6",
};

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  MILEAGE_CATEGORIES.map((c) => [c.key, c.label])
);

type DiagnosisRow = {
  id: string;
  user_email: string;
  domain1: number;
  domain2: number;
  domain3: number;
  domain4: number;
  domain5: number;
  domain6: number;
  total_score: number;
  created_at: string;
  diagnosis_type?: string | null;
  raw_answers?: Record<string, unknown> & { _schema?: string };
  category_scores?: Record<string, { score?: number; count?: number }>;
  ai_analysis?: string | null;
  ai_analysis_report?: string | null;
};

type MileageEntry = { id: string; content: string; category: string; created_at: string };

function ResultReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userName, setUserName] = useState("");
  const [userSchool, setUserSchool] = useState("");
  /** 학년반·담당과목 등 (프로필) */
  const [userGradeClass, setUserGradeClass] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [preResult, setPreResult] = useState<DiagnosisRow | null>(null);
  const [postResult, setPostResult] = useState<DiagnosisRow | null>(null);
  const [mileageByCategory, setMileageByCategory] = useState<Record<string, MileageEntry[]>>({});
  const [goalAchievementText, setGoalAchievementText] = useState("");
  const [reflectionText, setReflectionText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [nextYearGoalText, setNextYearGoalText] = useState("");
  const [loading, setLoading] = useState(true);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>(CATEGORY_LABELS);
  const [domainLabels, setDomainLabels] = useState<Record<string, string>>(FALLBACK_DOMAIN_LABELS);
  const [domainCount, setDomainCount] = useState<number>(6);
  const [diagnosisSurvey, setDiagnosisSurvey] = useState<DiagnosisSurvey | null>(null);
  const [selfEvalForm, setSelfEvalForm] = useState<any | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 기초정보 > 사전사후결과분석 탭 내용 (pref 우선, 없으면 진단 ai_analysis) */
  const [reportAnalysisText, setReportAnalysisText] = useState("");

  const handlePrint = () => {
    if ((searchParams.get("type") || "2") === "1") {
      void printSelfEvalDocument(selfEvalForm);
      return;
    }
    void printDocument();
  };
  const handleSavePdf = () => {
    if ((searchParams.get("type") || "2") === "1") {
      void downloadSelfEvalPdf(selfEvalForm);
      return;
    }
    void downloadPdf({ filename: "자기역량_개발_결과_보고서.pdf" });
  };

  useEffect(() => {
    const ac = new AbortController();
    const signal = ac.signal;
    let isMounted = true;

    const load = async () => {
      try {
        setLoadError(null);
        await supabase.auth.refreshSession();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          if (isMounted) router.replace("/");
          return;
        }
        const role = (user.user_metadata as { role?: string })?.role;
        let email: string;

        if (role === "admin" && searchParams.get("email")) {
          const viewEmail = searchParams.get("email")!.trim();
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) {
            if (isMounted) {
              router.replace("/");
              setLoading(false);
            }
            return;
          }
          const res = await fetch("/api/admin/result-report-by-email", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email: viewEmail }),
            signal,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (isMounted) {
              alert(err?.error ?? "해당 교원 성찰 결과를 볼 수 없습니다.");
              router.replace("/dashboard");
              setLoading(false);
            }
            return;
          }
          const j = await res.json();
        if (!isMounted) return;
        setUserName(j.name ?? viewEmail ?? "");
        setUserSchool(j.schoolName ?? "");
        setUserGradeClass(
          resolveAffiliation({
            gradeClass: j.gradeClass,
            subject: j.subject,
            schoolLevel: j.schoolLevel,
          })
        );
        setUserEmail(j.email ?? viewEmail);
        if (j.preResult) setPreResult(j.preResult as DiagnosisRow);
        if (j.postResult) setPostResult(j.postResult as DiagnosisRow);
        const byCat: Record<string, MileageEntry[]> = {};
        (j.mileageEntries ?? []).forEach((r: MileageEntry) => {
          const c = r.category || "other";
          if (!byCat[c]) byCat[c] = [];
          byCat[c].push(r);
        });
        setMileageByCategory(byCat);
        setGoalAchievementText(j.goalAchievementText ?? "");
        setReflectionText(j.reflectionText ?? "");
        setEvidenceText(j.evidenceText ?? "");
        setNextYearGoalText(j.nextYearGoalText ?? "");
        setReportAnalysisText(j.reportAnalysisText ?? "");
        if (j.selfEvalForm) {
          try {
            const parsed = typeof j.selfEvalForm === "string" ? JSON.parse(j.selfEvalForm) : j.selfEvalForm;
            setSelfEvalForm(parsed);
          } catch (_) {
            setSelfEvalForm(null);
          }
        }
        const { data: { session: adminSession } } = await supabase.auth.getSession();
        if (adminSession?.access_token) {
          try {
            const catRes = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${adminSession.access_token}` }, signal });
            if (catRes.ok && isMounted) {
              const catJ = await catRes.json();
              if (Array.isArray(catJ.categories) && catJ.categories.length === 6) {
                setCategoryLabels(Object.fromEntries((catJ.categories as { key: string; label: string }[]).map((c) => [c.key, c.label])));
              }
            }
            const diagRes = await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${adminSession.access_token}` }, cache: "no-store", signal });
            if (diagRes.ok && isMounted) {
              const diagJ = await diagRes.json();
              if (Array.isArray(diagJ.domains) && diagJ.domains.length >= 2 && diagJ.domains.length <= 6) {
                const defKeys = ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const;
                const labels: Record<string, string> = { ...FALLBACK_DOMAIN_LABELS };
                for (let i = 0; i < diagJ.domains.length; i++) {
                  const key = defKeys[i];
                  const name = (diagJ.domains[i]?.name ?? "").trim() || FALLBACK_DOMAIN_LABELS[key];
                  if (key) labels[key] = name;
                }
                setDomainLabels(labels);
                setDomainCount(diagJ.domains.length);
              }
              if (diagJ.survey) setDiagnosisSurvey(diagJ.survey as DiagnosisSurvey);
            }
          } catch (_) {
            // ignore (abort or network)
          }
        }
        if (isMounted) setLoading(false);
        return;
      }

      // 관리자도 교원 권한을 가지므로 자신의 데이터를 볼 수 있음
      if (role === "teacher" || role === "admin") {
        email = user.email!;
        const meta = (user.user_metadata || {}) as {
          name?: string;
          schoolName?: string;
          gradeClass?: string;
          subject?: string;
          schoolLevel?: string;
        };
        let name = meta.name ?? user.email ?? "";
        let schoolName = meta.schoolName ?? "";
        let gradeClass = resolveAffiliation(meta);
        const { data: { session: profileSession } } = await supabase.auth.getSession();
        if (profileSession?.access_token) {
          try {
            const ovRes = await fetch("/api/account/profile-overrides", {
              headers: { Authorization: `Bearer ${profileSession.access_token}` },
              signal,
            });
            if (ovRes.ok) {
              const ov = (await ovRes.json()) as {
                name?: string | null;
                schoolName?: string | null;
                gradeClass?: string | null;
              };
              if (ov.name != null && ov.name !== "") name = ov.name;
              if (ov.schoolName != null && ov.schoolName !== "") schoolName = ov.schoolName;
              if (ov.gradeClass != null) gradeClass = ov.gradeClass.trim();
            }
          } catch (_) {
            // ignore
          }
        }
        if (isMounted) {
          setUserName(name);
          setUserSchool(schoolName);
          setUserGradeClass(gradeClass);
          setUserEmail(email);
        }
      } else {
        if (isMounted) {
          router.replace("/");
          setLoading(false);
        }
        return;
      }

      const { data: preData } = await supabase.from("diagnosis_results").select("*").eq("user_email", email).or("diagnosis_type.is.null,diagnosis_type.eq.pre").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (isMounted && preData) setPreResult(preData as DiagnosisRow);

      const { data: postData } = await supabase.from("diagnosis_results").select("*").eq("user_email", email).eq("diagnosis_type", "post").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (isMounted && postData) setPostResult(postData as DiagnosisRow);

      const { data: mileageData } = await supabase.from("mileage_entries").select("id, content, category, created_at").eq("user_email", email).order("created_at", { ascending: false });
      const byCat: Record<string, MileageEntry[]> = {};
      (mileageData ?? []).forEach((r: MileageEntry) => {
        const c = r.category || "other";
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(r);
      });
      if (isMounted) setMileageByCategory(byCat);

      const { data: draftRow } = await supabase.from("reflection_drafts").select("goal_achievement_text, reflection_text").eq("user_email", email).maybeSingle();
      if (isMounted) {
        if (draftRow) {
          setGoalAchievementText((draftRow.goal_achievement_text as string) ?? "");
          setReflectionText((draftRow.reflection_text as string) ?? "");
        } else if (typeof window !== "undefined") {
          setGoalAchievementText(localStorage.getItem("teacher_mate_goal_achievement_" + email) ?? "");
          setReflectionText(localStorage.getItem("teacher_mate_reflection_text_" + email) ?? "");
        }
      }
      const { data: evidenceRow } = await supabase.from("user_preferences").select("pref_value").eq("user_email", email).eq("pref_key", "reflection_evidence_text").maybeSingle();
      if (isMounted && evidenceRow?.pref_value != null) setEvidenceText(String(evidenceRow.pref_value));
      const { data: nextYearRow } = await supabase.from("user_preferences").select("pref_value").eq("user_email", email).eq("pref_key", "reflection_next_year_goal").maybeSingle();
      if (isMounted && nextYearRow?.pref_value != null) setNextYearGoalText(String(nextYearRow.pref_value));
      const { data: analysisPrefRow } = await supabase.from("user_preferences").select("pref_value").eq("user_email", email).eq("pref_key", "reflection_ai_analysis_first_person").maybeSingle();
      if (isMounted) {
        const fromPref = analysisPrefRow?.pref_value != null ? String(analysisPrefRow.pref_value).trim() : "";
        const fromDiagnosis = (postData as { ai_analysis?: string | null })?.ai_analysis?.trim() ?? "";
        setReportAnalysisText(fromPref || fromDiagnosis);
      }
      const { data: selfEvalRow } = await supabase
        .from("user_preferences")
        .select("pref_value")
        .eq("user_email", email)
        .eq("pref_key", "reflection_self_eval_form")
        .maybeSingle();
      if (isMounted && selfEvalRow?.pref_value != null) {
        try {
          const parsed = JSON.parse(String(selfEvalRow.pref_value));
          setSelfEvalForm(parsed);
        } catch (_) {
          setSelfEvalForm(null);
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const catRes = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${session.access_token}` }, signal });
          if (catRes.ok && isMounted) {
            const catJ = await catRes.json();
            if (Array.isArray(catJ.categories) && catJ.categories.length === 6) {
              setCategoryLabels(Object.fromEntries((catJ.categories as { key: string; label: string }[]).map((c) => [c.key, c.label])));
            }
          }
          const diagRes = await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal });
          if (diagRes.ok && isMounted) {
            const diagJ = await diagRes.json();
            if (Array.isArray(diagJ.domains) && diagJ.domains.length >= 2 && diagJ.domains.length <= 6) {
              const defKeys = ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const;
              const labels: Record<string, string> = { ...FALLBACK_DOMAIN_LABELS };
              for (let i = 0; i < diagJ.domains.length; i++) {
                const key = defKeys[i];
                const name = (diagJ.domains[i]?.name ?? "").trim() || FALLBACK_DOMAIN_LABELS[key];
                if (key) labels[key] = name;
              }
              setDomainLabels(labels);
              setDomainCount(diagJ.domains.length);
            }
            if (diagJ.survey) setDiagnosisSurvey(diagJ.survey as DiagnosisSurvey);
          }
        } catch (_) {
          // ignore (abort or network)
        }
      }
      if (isMounted) setLoading(false);
      } catch (e) {
        if (!isMounted) return;
        if (e instanceof Error && e.name === "AbortError") return;
        setLoadError("데이터를 불러오는 중 문제가 발생했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
        setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
      ac.abort();
    };
  }, [router, searchParams.get("email") ?? "", searchParams.get("type") ?? ""]);

  const typeParam = searchParams.get("type") || "2";
  const isSelfEvalPreview = typeParam === "1";

  const result = postResult ?? preResult;
  const is4Domain = result?.raw_answers?._schema === "v4";
  const cat = result?.category_scores;
  const getCount = (key: string) => (cat?.[key]?.count ?? 5);
  const domainKeys = is4Domain
    ? ["domain1", "domain2", "domain3", "domain4"]
    : (["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const).slice(0, Math.min(domainCount, 6));
  const totalQuestionCount = result
    ? domainKeys.reduce((sum, key) => sum + (getCount(key) || 5), 0)
    : 30;
  const domainAverages = result
    ? domainKeys.map((key) => ({
        name: domainLabels[key] ?? FALLBACK_DOMAIN_LABELS[key as keyof typeof FALLBACK_DOMAIN_LABELS],
        score: (result[key as keyof DiagnosisRow] as number) / (getCount(key) || 1),
      }))
    : [];
  const radarCompareData =
    preResult && postResult
      ? domainKeys.map((key) => {
          const preVal = (preResult[key as keyof DiagnosisRow] as number) / (getCount(key) || 1);
          const postVal = (postResult[key as keyof DiagnosisRow] as number) / (getCount(key) || 1);
          return { name: domainLabels[key] ?? FALLBACK_DOMAIN_LABELS[key as keyof typeof FALLBACK_DOMAIN_LABELS], 사전: preVal, 사후: postVal };
        })
      : null;

  // 소영역 사전·사후 막대그래프용 (대영역 개수만큼 칸)
  type BarComparePoint = { name: string; 사전: number; 사후: number };
  const to100 = (avg1to5: number) => Math.round(Math.max(0, Math.min(100, avg1to5 * 20)));
  let barChartDataByDomain: { label: string; rows: BarComparePoint[] }[] = [];
  if (preResult && postResult) {
    let preSubByDomain: Record<string, { name: string; sum: number; count: number; avg: number }[]> | null = null;
    let postSubByDomain: Record<string, { name: string; sum: number; count: number; avg: number }[]> | null = null;

    // CSV 설문(2~6대영역)이 있고 문항 정보가 있을 때만 소영역 점수 계산
    if (diagnosisSurvey?.domains?.length && Array.isArray(diagnosisSurvey.questions) && diagnosisSurvey.questions.length > 0) {
      const preRaw = (preResult.raw_answers ?? {}) as Record<string, unknown>;
      const postRaw = (postResult.raw_answers ?? {}) as Record<string, unknown>;
      const preRawForSub: Record<string, number> = {};
      const postRawForSub: Record<string, number> = {};
      for (const [k, v] of Object.entries(preRaw)) {
        if (k === "_schema") continue;
        const num = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(num) && num >= 1 && num <= 5) preRawForSub[String(k)] = num;
      }
      for (const [k, v] of Object.entries(postRaw)) {
        if (k === "_schema") continue;
        const num = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(num) && num >= 1 && num <= 5) postRawForSub[String(k)] = num;
      }
      preSubByDomain = computeSubDomainScores(diagnosisSurvey, preRawForSub);
      postSubByDomain = computeSubDomainScores(diagnosisSurvey, postRawForSub);
    }

    domainKeys.forEach((key, i) => {
      const label = domainLabels[key] ?? FALLBACK_DOMAIN_LABELS[key as keyof typeof FALLBACK_DOMAIN_LABELS];
      const preAvg = (preResult[key as keyof DiagnosisRow] as number) / (getCount(key) || 1);
      const postAvg = (postResult[key as keyof DiagnosisRow] as number) / (getCount(key) || 1);
      const rows: BarComparePoint[] = [];

      if (preSubByDomain && postSubByDomain) {
        const postSubs = postSubByDomain[key] ?? [];
        const preSubs = preSubByDomain[key] ?? [];
        postSubs.forEach((postSub) => {
          const preSub = preSubs.find((s) => s.name === postSub.name);
          rows.push({
            name: postSub.name.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(),
            사전: to100(preSub ? preSub.avg : 0),
            사후: to100(postSub.avg),
          });
        });
      }

      // 소영역이 없거나 설문 정보가 없으면 대영역 평균 1개라도 표시
      if (rows.length === 0) {
        rows.push({ name: "평균", 사전: to100(preAvg), 사후: to100(postAvg) });
      }
      barChartDataByDomain.push({ label, rows });
    });
  }

  const maxTotal = totalQuestionCount * 5;
  const totalNorm = result && maxTotal > 0 ? (result.total_score / maxTotal) * 100 : 0;
  const preTotalNorm = preResult && maxTotal > 0 ? (preResult.total_score / maxTotal) * 100 : 0;
  function toShortYear(text: string): string {
    return text.replace(/\b20(\d{2})\./g, "$1.");
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const y = String(d.getFullYear()).slice(-2);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  };
  const preDateStr = preResult ? formatDate(preResult.created_at) : "";
  const postDateStr = postResult ? formatDate(postResult.created_at) : "";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">불러오는 중...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
        <p className="text-center text-slate-700">{loadError}</p>
        <Link href="/reflection">
          <Button variant="outline">반성 페이지로 돌아가기</Button>
        </Link>
      </div>
    );
  }

  const selfEvalHtml = isSelfEvalPreview && selfEvalForm ? buildSelfEvalHtml(selfEvalForm) : "";

  return (
    <div className="result-report-root min-h-screen bg-slate-50 px-4 py-6">
      <div className="result-report-inner mx-auto max-w-6xl px-[1cm]">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
          <Button type="button" size="sm" variant="outline" onClick={handlePrint} className="rounded-full border-slate-300">
            <Printer className="mr-1.5 h-3.5 w-3.5" /> 인쇄
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleSavePdf} title="PDF 파일로 바로 다운로드" className="rounded-full border-slate-300">
            <FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF 저장
          </Button>
          <Link href="/dashboard">
            <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300">
              <X className="mr-1.5 h-3.5 w-3.5" /> 닫기
            </Button>
          </Link>
        </div>
        <div
          className={
            isSelfEvalPreview
              ? "print-content-area bg-white p-0 shadow-none print:shadow-none"
              : "print-content-area rounded-lg bg-white p-6 shadow-sm print:shadow-none"
          }
        >
          {isSelfEvalPreview ? (
            selfEvalHtml ? (
              <iframe
                title="교사 자기실적평가서"
                srcDoc={selfEvalHtml}
                className="h-[1000px] w-full border-none"
              />
            ) : (
              <p className="text-sm text-slate-500">저장된 자기실적평가서 데이터가 없습니다.</p>
            )
          ) : (
            <>
          <h1 className="mb-4 text-center font-bold text-slate-800 leading-snug print:mb-4" style={{ fontSize: "120%" }}>
            목적지 Report (교사 성찰 기록) / 자기역량 개발 결과 보고서
          </h1>
          <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-3">
            <p className="text-left text-xs text-slate-600 leading-normal" style={{ fontSize: "80%" }}>
              작성일 : {(() => {
                const now = new Date();
                const y = String(now.getFullYear()).slice(-2);
                const m = String(now.getMonth() + 1).padStart(2, "0");
                const d = String(now.getDate()).padStart(2, "0");
                const 요일 = ["일", "월", "화", "수", "목", "금", "토"][now.getDay()];
                return `${y}.${m}.${d}. (${요일})`;
              })()}
            </p>
            <p className="text-base font-medium text-slate-800 leading-normal" style={{ fontSize: "90%" }}>
              {(() => {
                const subjectOrGrade = [
                  selfEvalForm?.subject,
                  selfEvalForm?.gradeClass,
                  userGradeClass,
                ]
                  .map((v) => String(v ?? "").trim())
                  .find(Boolean) ?? "";
                const position = String(selfEvalForm?.position ?? "").trim();
                const masked = userName ? maskDisplayName(userName) : "";
                return [userSchool, subjectOrGrade, position, masked].filter(Boolean).join(" ") +
                  (masked ? " 선생님" : "");
              })()}
            </p>
          </div>
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-slate-800">역량 성장 변화</h2>
            <div className="-mt-1">
              {preResult && postResult ? (
                <DiagnosisResultCharts
                  isPost
                  radarCompareData={radarCompareData}
                  barChartDataByDomain={barChartDataByDomain}
                  domainAverages={[]}
                  preDateStr={preDateStr}
                  postDateStr={postDateStr}
                />
              ) : (
                domainAverages.length > 0 && (
                  <Card className="rounded-2xl border border-[#e8edf3] bg-white px-4 py-3 shadow-none">
                    <h3 className="text-sm font-semibold text-slate-800 mb-1">역량 진단 결과</h3>
                    <div className="w-full min-w-0">
                      <ReflectionRadarCharts radarCompareData={null} domainAverages={domainAverages} hasPrePost={false} />
                    </div>
                  </Card>
                )
              )}
            </div>
            {reportAnalysisText.trim() && (
              <div className="print-text-box mt-4 rounded border border-[#e8edf3] bg-slate-50/50 p-3 shadow-none">
                <h3 className="mb-2 text-xs font-bold text-slate-800">결과 분석</h3>
                <div className="whitespace-pre-wrap text-xs text-slate-700 leading-relaxed">
                  {reportAnalysisText.trim()}
                </div>
              </div>
            )}
          </div>
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-slate-800">목표달성도 및 실천 내용</h2>
            <div className="print-text-box rounded border border-[#e8edf3] bg-slate-50/50 p-3 shadow-none">
              <div className="text-xs text-slate-700">
                {goalAchievementText ? (
                <div className="whitespace-pre-wrap">{toShortYear(goalAchievementText)}</div>
              ) : (
                <p className="text-slate-500">(작성된 내용 없음)</p>
              )}
              </div>
            </div>
          </div>
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-slate-800">성찰 및 내년 목표</h2>
            <div className="print-text-box rounded border border-[#e8edf3] bg-slate-50/50 p-3 text-xs text-slate-700 space-y-4 shadow-none">
              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">성찰</p>
                <div className="whitespace-pre-wrap">{reflectionText || "(작성된 내용 없음)"}</div>
              </div>
              <div className="pt-2 border-t border-[#e8edf3]">
                <p className="mb-1 text-[11px] font-semibold text-slate-600">내년도 목표</p>
                <div className="whitespace-pre-wrap">{nextYearGoalText || "(작성된 내용 없음)"}</div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-bold text-slate-800">자기실적 평가서</h2>
            <div className="print-text-box whitespace-pre-wrap rounded border border-[#e8edf3] bg-slate-50/50 p-3 text-xs text-slate-700 shadow-none">
              {(evidenceText ?? "").trim() ? evidenceText : "별첨"}
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResultReportPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-slate-500">로딩 중...</div>}>
      <ResultReportContent />
    </Suspense>
  );
}
