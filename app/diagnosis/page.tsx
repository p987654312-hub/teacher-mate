"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardPageHeader } from "@/components/CardPageHeader";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/lib/supabaseClient";
import { domainsToQuestions, DEFAULT_DIAGNOSIS_DOMAINS, type Question } from "@/lib/diagnosisQuestions";
import {
  type DiagnosisSurvey,
  scoreForQuestion,
  computeDomainScores,
  totalScoreFromDomainScores,
} from "@/lib/diagnosisSurvey";
import { Check, ClipboardCheck } from "lucide-react";

function DiagnosisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPost = searchParams.get("type") === "post";
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userSchool, setUserSchool] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [questions, setQuestions] = useState<Question[]>(() => domainsToQuestions(DEFAULT_DIAGNOSIS_DOMAINS));
  const [domainNames, setDomainNames] = useState<string[]>(() => DEFAULT_DIAGNOSIS_DOMAINS.map((d) => d.name));
  const [diagnosisTitle, setDiagnosisTitle] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useSurvey, setUseSurvey] = useState(false);
  const [survey, setSurvey] = useState<DiagnosisSurvey | null>(null);

  // 보호된 라우트 + 학교별 설문 로드 (설정 로드 후에만 폼 표시 → 깜빡임 없음)
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }
      const metadata = user.user_metadata as { role?: string; schoolName?: string } | undefined;
      if (metadata?.role !== "teacher" && metadata?.role !== "admin") {
        router.replace("/");
        return;
      }
      setUserEmail(user.email ?? null);
      setUserSchool(metadata?.schoolName ?? null);

      const { data: { session } } = await supabase.auth.getSession();
      try {
        const res = session?.access_token
          ? await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" })
          : null;
        if (res?.ok) {
          const j = await res.json();
          if (j.useSurvey && j.survey?.domains?.length >= 2 && j.survey?.domains?.length <= 6 && Array.isArray(j.survey.questions) && j.survey.questions.length > 0) {
            setUseSurvey(true);
            setSurvey(j.survey);
            setDomainNames(j.survey.domains.map((d: { name: string }) => d.name));
            setQuestions(
              j.survey.questions.map((q: { id: string; text: string; domainKey: string }) => ({
                id: q.id,
                text: q.text,
                domain: q.domainKey,
              }))
            );
          } else {
            setUseSurvey(false);
            setSurvey(null);
            const domains = Array.isArray(j.domains) && j.domains.length === 6 ? j.domains : DEFAULT_DIAGNOSIS_DOMAINS;
            setQuestions(domainsToQuestions(domains));
            setDomainNames(domains.map((d: { name?: string }, i: number) => (d?.name ?? "").trim() || (DEFAULT_DIAGNOSIS_DOMAINS[i]?.name ?? "")));
          }
          if (typeof j.title === "string") setDiagnosisTitle(j.title.trim());
        } else {
          setUseSurvey(false);
          setSurvey(null);
          setQuestions(domainsToQuestions(DEFAULT_DIAGNOSIS_DOMAINS));
          setDomainNames(DEFAULT_DIAGNOSIS_DOMAINS.map((d) => d.name));
        }
      } catch {
        setUseSurvey(false);
        setSurvey(null);
        setQuestions(domainsToQuestions(DEFAULT_DIAGNOSIS_DOMAINS));
        setDomainNames(DEFAULT_DIAGNOSIS_DOMAINS.map((d) => d.name));
      }
      setIsChecking(false);
    };
    init();
  }, [router]);

  // 진행률 계산 (엑셀 설문은 1~5 선택 시에만 완료)
  const progress = useMemo(() => {
    if (questions.length === 0) return 0;
    const answeredCount = useSurvey
      ? questions.filter((q) => {
          const v = answers[q.id];
          return v !== undefined && v !== null && v >= 1 && v <= 5;
        }).length
      : Object.keys(answers).filter(
          (key) => answers[key] !== undefined && answers[key] !== null && answers[key] >= 0
        ).length;
    return (answeredCount / questions.length) * 100;
  }, [answers, questions.length, useSurvey]);

  // 영역별 점수 계산 (엑셀 설문 시 방향 반영 후 4영역, 기존은 6영역)
  const domainScores = useMemo(() => {
    if (useSurvey && survey) {
      const scoreByQ: Record<string, number> = {};
      survey.questions.forEach((q) => {
        const raw = answers[q.id];
        if (raw !== undefined && raw !== null && raw >= 1 && raw <= 5) {
          scoreByQ[q.id] = scoreForQuestion(raw, q.direction);
        }
      });
      const byDomain = computeDomainScores(survey, scoreByQ);
      return {
        domain1: byDomain.domain1 ?? 0,
        domain2: byDomain.domain2 ?? 0,
        domain3: byDomain.domain3 ?? 0,
        domain4: byDomain.domain4 ?? 0,
        domain5: byDomain.domain5 ?? 0,
        domain6: byDomain.domain6 ?? 0,
      };
    }
    const scores: Record<string, { sum: number; count: number }> = {
      domain1: { sum: 0, count: 0 },
      domain2: { sum: 0, count: 0 },
      domain3: { sum: 0, count: 0 },
      domain4: { sum: 0, count: 0 },
      domain5: { sum: 0, count: 0 },
      domain6: { sum: 0, count: 0 },
    };
    questions.forEach((q) => {
      const answer = answers[q.id];
      if (answer !== undefined && answer !== null && answer >= 0) {
        scores[q.domain].sum += answer;
        scores[q.domain].count += 1;
      }
    });
    return {
      domain1: scores.domain1.sum,
      domain2: scores.domain2.sum,
      domain3: scores.domain3.sum,
      domain4: scores.domain4.sum,
      domain5: scores.domain5.sum,
      domain6: scores.domain6.sum,
    };
  }, [answers, useSurvey, survey, questions]);

  // 총점 계산 (설문 시 해당 영역만 합산)
  const totalScore = useMemo(() => {
    if (useSurvey && survey?.domains?.length) {
      let sum = 0;
      for (let i = 0; i < survey.domains.length; i++) sum += domainScores[`domain${i + 1}` as keyof typeof domainScores] ?? 0;
      return sum;
    }
    return Object.values(domainScores).reduce((sum, score) => sum + score, 0);
  }, [domainScores, useSurvey, survey?.domains?.length]);

  const handleSubmit = async () => {
    if (!userEmail || !userSchool) {
      alert("로그인 정보가 올바르지 않습니다. 다시 로그인해 주세요.");
      return;
    }

    // 모든 문항에 응답했는지 확인 (엑셀 설문은 1~5 선택 필수)
    const unanswered = useSurvey
      ? questions.filter((q) => {
          const v = answers[q.id];
          return v === undefined || v === null || v < 1 || v > 5;
        })
      : questions.filter((q) => answers[q.id] === undefined || answers[q.id] === null);
    if (unanswered.length > 0) {
      alert("모든 문항에 응답해 주세요.");
      return;
    }

    try {
      setIsSubmitting(true);

      // domain1~domain6 점수를 정수형으로 명시적으로 변환하여 저장 (null 방지)
      const domain1Value = domainScores.domain1 ?? 0;
      const domain2Value = domainScores.domain2 ?? 0;
      const domain3Value = domainScores.domain3 ?? 0;
      const domain4Value = domainScores.domain4 ?? 0;
      const domain5Value = domainScores.domain5 ?? 0;
      const domain6Value = domainScores.domain6 ?? 0;
      const totalScoreValue = totalScore ?? 0;

      const is4Domain = useSurvey && (survey?.domains?.length ?? 0) === 4;
      const payload = {
        user_email: userEmail,
        school_name: userSchool,
        domain1: Number.isInteger(domain1Value) ? domain1Value : Math.floor(Number(domain1Value)),
        domain2: Number.isInteger(domain2Value) ? domain2Value : Math.floor(Number(domain2Value)),
        domain3: Number.isInteger(domain3Value) ? domain3Value : Math.floor(Number(domain3Value)),
        domain4: Number.isInteger(domain4Value) ? domain4Value : Math.floor(Number(domain4Value)),
        domain5: is4Domain ? 0 : (Number.isInteger(domain5Value) ? domain5Value : Math.floor(Number(domain5Value))),
        domain6: is4Domain ? 0 : (Number.isInteger(domain6Value) ? domain6Value : Math.floor(Number(domain6Value))),
        total_score: Number.isInteger(totalScoreValue) ? totalScoreValue : Math.floor(Number(totalScoreValue)),
        raw_answers: is4Domain ? { ...answers, _schema: "v4" } : answers,
        diagnosis_type: isPost ? "post" : "pre",
        category_scores: (useSurvey && survey)
          ? {
              domain1: { score: Number.isInteger(domain1Value) ? domain1Value : Math.floor(Number(domain1Value)), count: survey.questions.filter((q) => q.domainKey === "domain1").length || 1 },
              domain2: { score: Number.isInteger(domain2Value) ? domain2Value : Math.floor(Number(domain2Value)), count: survey.questions.filter((q) => q.domainKey === "domain2").length || 1 },
              domain3: { score: Number.isInteger(domain3Value) ? domain3Value : Math.floor(Number(domain3Value)), count: survey.questions.filter((q) => q.domainKey === "domain3").length || 1 },
              domain4: { score: Number.isInteger(domain4Value) ? domain4Value : Math.floor(Number(domain4Value)), count: survey.questions.filter((q) => q.domainKey === "domain4").length || 1 },
              domain5: { score: Number.isInteger(domain5Value) ? domain5Value : Math.floor(Number(domain5Value)), count: is4Domain ? 0 : (survey.questions.filter((q) => q.domainKey === "domain5").length || 1) },
              domain6: { score: Number.isInteger(domain6Value) ? domain6Value : Math.floor(Number(domain6Value)), count: is4Domain ? 0 : (survey.questions.filter((q) => q.domainKey === "domain6").length || 1) },
            }
          : {
              domain1: { score: Number.isInteger(domain1Value) ? domain1Value : Math.floor(Number(domain1Value)), count: 5 },
              domain2: { score: Number.isInteger(domain2Value) ? domain2Value : Math.floor(Number(domain2Value)), count: 5 },
              domain3: { score: Number.isInteger(domain3Value) ? domain3Value : Math.floor(Number(domain3Value)), count: 5 },
              domain4: { score: Number.isInteger(domain4Value) ? domain4Value : Math.floor(Number(domain4Value)), count: 5 },
              domain5: { score: Number.isInteger(domain5Value) ? domain5Value : Math.floor(Number(domain5Value)), count: 5 },
              domain6: { score: Number.isInteger(domain6Value) ? domain6Value : Math.floor(Number(domain6Value)), count: 5 },
            },
      };

      const { error, data } = await supabase.from("diagnosis_results").insert([
        payload,
      ]).select();

      if (error) {
        alert(
          `진단 결과 저장 중 오류가 발생했습니다.\n\n에러 내용: ${error.message}\n\nSupabase 테이블 설정을 확인해 주세요.`
        );
        return;
      }

      // 진단 결과 저장 성공 후 자동으로 AI 분석 실행 (전체 분석)
      const savedResultId = data?.[0]?.id;
      if (savedResultId) {
        try {
          const domainKeys = survey?.domains?.length
            ? (survey.domains.map((_, i) => `domain${i + 1}`) as readonly string[])
            : (is4Domain
              ? (["domain1", "domain2", "domain3", "domain4"] as const)
              : (["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const));
          const counts = survey
            ? domainKeys.map((key) => survey.questions.filter((q) => q.domainKey === key).length || 1)
            : [5, 5, 5, 5, 5, 5];
          const domainAverages = domainKeys.map((domain, i) => {
            const key = domain as keyof typeof domainScores;
            return {
              domain,
              label: domainNames[i] ?? DEFAULT_DIAGNOSIS_DOMAINS[i]?.name ?? "",
              avg: counts[i] ? (domainScores[key] ?? 0) / counts[i] : 0,
              score: domainScores[key] ?? 0,
            };
          });

          const sorted = [...domainAverages].sort((a, b) => b.avg - a.avg);
          const domainCount = domainKeys.length;
          const strengthN = Math.ceil(domainCount / 2);
          const weaknessN = domainCount - strengthN;
          const strengths = sorted.slice(0, strengthN).map((d) => d.label);
          const weaknesses = sorted.slice(-weaknessN).map((d) => d.label);

          // 전체 영역 점수 정보 (역량별 1~5점 척도 평균)
          const domainScoresText = domainAverages
            .map((d) => `${d.label}: ${d.avg.toFixed(1)}점`)
            .join(", ");
          const maxTotal = counts.reduce((sum, c) => sum + c * 5, 0) || 1;
          const totalScoreNorm100 = Math.round((totalScore / maxTotal) * 100);

          // AI 분석 요청 (전체 분석)
          const analysisRes = await fetch("/api/ai-recommend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "analysis",
              strongDomains: strengths,
              weakDomains: weaknesses,
              domainScores: domainScoresText,
              totalScore: totalScoreNorm100,
              domainCount: domainCount,
            }),
          });

          if (analysisRes.ok) {
            const result = await analysisRes.json();
            if (result.recommendation && result.recommendation.trim()) {
              const { error: updateError } = await supabase
                .from("diagnosis_results")
                .update({ ai_analysis: result.recommendation.trim() })
                .eq("id", savedResultId);
              if (updateError) { /* 무시 */ }
            }
          } else {
            const err = await analysisRes.json().catch(() => ({}));
            if (err?.code === "QUOTA_EXCEEDED") alert(err.error);
          }
        } catch {
          // AI 분석 실패해도 진단 결과 저장은 성공했으므로 계속 진행
        }
      }

      alert("진단 결과가 저장되었습니다.");
      if (isPost) {
        router.push("/diagnosis/result?type=post");
      } else {
        router.push("/dashboard");
      }
    } catch {
      alert("진단 결과 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">준비 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white px-4 py-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <CardPageHeader
          icon={<ClipboardCheck className="h-6 w-6" />}
          title={
            diagnosisTitle
              ? (isPost ? `(사후) ${diagnosisTitle}` : `(사전) ${diagnosisTitle}`)
              : (isPost ? "(사후) 나의 교원 역량 진단" : "나의 교원 역량 사전 진단")
          }
          subtitle="각 문항에 대해 현재 나의 수준에 가장 가까운 응답을 선택해 주세요."
        />

        {/* 진행률 바 — 높이 낮게, 푸른 계열 */}
        <Card className="rounded-xl border-slate-200/80 bg-slate-50/50 p-2.5 shadow-sm">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-600">진행률</span>
            <span className="font-semibold text-slate-800">
              {Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== null).length} / {questions.length}
            </span>
          </div>
          <Progress
            value={progress}
            className="h-1.5 bg-blue-200/70 [&_[data-slot=progress-indicator]]:bg-blue-500"
          />
        </Card>

        {/* 문항: 왼쪽 문항, 오른쪽 점수 체크 (한 페이지, 가독성·공간 절약) */}
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          {useSurvey ? (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <span>문항</span>
                <div className="w-[180px] shrink-0 flex justify-between items-center text-[10px] font-normal text-slate-400">
                  <span>매우 그렇지 않다</span>
                  <span>~</span>
                  <span>매우 그렇다</span>
                </div>
              </div>
              {questions.map((question) => {
                const raw = answers[question.id];
                const isAnswered = raw !== undefined && raw !== null && raw >= 1 && raw <= 5;
                return (
                  <div
                    key={question.id}
                    className={`grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 items-center border-b border-slate-100 last:border-b-0 ${
                      isAnswered ? "bg-blue-50/60" : "bg-white"
                    }`}
                  >
                    <p className="text-sm text-slate-800 leading-snug min-w-0">
                      <span className="font-medium text-slate-500 mr-1.5">{question.id}.</span>
                      {question.text}
                    </p>
                    <div className="flex items-center justify-between shrink-0 w-[180px] gap-0">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: n }))}
                          className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center transition-colors ${
                            raw === n
                              ? "bg-blue-600 text-white ring-1 ring-blue-600"
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                          }`}
                          title={`선택 ${n}`}
                        >
                          {raw === n ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="divide-y divide-slate-100">
              {questions.map((question) => {
                const raw = answers[question.id];
                const isAnswered = raw !== undefined && raw !== null;
                return (
                  <div key={question.id} className="px-3 py-2.5 flex flex-col gap-2">
                    <Label className="text-sm text-slate-800">{question.id}. {question.text}</Label>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[10px] text-slate-500">매우 아니다</span>
                      <Slider
                        value={[isAnswered ? answers[question.id]! : 0]}
                        onValueChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value[0] }))}
                        min={0}
                        max={100}
                        step={1}
                        className="flex-1 max-w-[200px] [&_[data-slot=slider-thumb]]:h-4 [&_[data-slot=slider-thumb]]:w-3"
                      />
                      <span className="shrink-0 text-[10px] text-slate-500">매우 그렇다</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-sm font-semibold text-white shadow-md hover:shadow-lg hover:opacity-95 transition disabled:opacity-70 sm:w-64"
          >
            {isSubmitting ? "제출 중..." : "진단 결과 제출하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DiagnosisPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white"><p className="text-sm text-slate-500">불러오는 중...</p></div>}>
      <DiagnosisContent />
    </Suspense>
  );
}
