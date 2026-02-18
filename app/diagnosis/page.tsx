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
import { ClipboardCheck } from "lucide-react";

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

  // 보호된 라우트 + 학교별 사전/사후검사 문항 로드
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
        | { role?: string; schoolName?: string }
        | undefined;

      if (metadata?.role !== "teacher" && metadata?.role !== "admin") {
        router.replace("/");
        return;
      }

      setUserEmail(user.email ?? null);
      setUserSchool(metadata?.schoolName ?? null);
      setIsChecking(false);
    };

    checkSession();
  }, [router]);

  // 학교별 문항 로드 (관리자가 설정한 문항 반영)
  useEffect(() => {
    if (isChecking) return;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j.domains) && j.domains.length === 6) {
            setQuestions(domainsToQuestions(j.domains));
            setDomainNames(
              j.domains.map((d: { name?: string }, i: number) =>
                (d?.name ?? "").trim() || (DEFAULT_DIAGNOSIS_DOMAINS[i]?.name ?? "")
              )
            );
          }
          if (typeof j.title === "string") setDiagnosisTitle(j.title.trim());
        }
      } catch {
        // 실패 시 기본 문항 유지
      }
    };
    load();
  }, [isChecking]);

  // 진행률 계산
  const progress = useMemo(() => {
    if (questions.length === 0) return 0;
    const answeredCount = Object.keys(answers).filter(
      (key) => answers[key] !== undefined && answers[key] !== null && answers[key] >= 0
    ).length;
    return (answeredCount / questions.length) * 100;
  }, [answers, questions.length]);

  // 영역별 점수 계산
  const domainScores = useMemo(() => {
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
  }, [answers]);

  // 총점 계산
  const totalScore = useMemo(() => {
    return Object.values(domainScores).reduce((sum, score) => sum + score, 0);
  }, [domainScores]);

  const handleSubmit = async () => {
    if (!userEmail || !userSchool) {
      alert("로그인 정보가 올바르지 않습니다. 다시 로그인해 주세요.");
      return;
    }

    // 모든 문항에 응답했는지 확인
    const unanswered = questions.filter((q) => answers[q.id] === undefined || answers[q.id] === null);
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

      const payload = {
        user_email: userEmail,
        school_name: userSchool,
        domain1: Number.isInteger(domain1Value) ? domain1Value : Math.floor(Number(domain1Value)),
        domain2: Number.isInteger(domain2Value) ? domain2Value : Math.floor(Number(domain2Value)),
        domain3: Number.isInteger(domain3Value) ? domain3Value : Math.floor(Number(domain3Value)),
        domain4: Number.isInteger(domain4Value) ? domain4Value : Math.floor(Number(domain4Value)),
        domain5: Number.isInteger(domain5Value) ? domain5Value : Math.floor(Number(domain5Value)),
        domain6: Number.isInteger(domain6Value) ? domain6Value : Math.floor(Number(domain6Value)),
        total_score: Number.isInteger(totalScoreValue) ? totalScoreValue : Math.floor(Number(totalScoreValue)),
        raw_answers: answers,
        diagnosis_type: isPost ? "post" : "pre",
        // 기존 구조와의 호환성을 위해 category_scores도 함께 저장
        category_scores: {
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
          // 영역별 점수 계산 (평균) — 관리자 설정 역량명(domainNames) 반영
          const domainAverages = (
            ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const
          ).map((domain, i) => ({
            domain,
            label: domainNames[i] ?? DEFAULT_DIAGNOSIS_DOMAINS[i]?.name ?? "",
            avg: (domainScores[domain] ?? 0) / 5,
            score: domainScores[domain] ?? 0,
          }));

          // 강점/약점 정렬
          const sorted = [...domainAverages].sort((a, b) => b.avg - a.avg);
          const strengths = sorted.slice(0, 3).map((d) => d.label);
          const weaknesses = sorted.slice(-3).map((d) => d.label);

          // 전체 영역 점수 정보
          const domainScoresText = domainAverages
            .map((d) => `${d.label}: ${d.avg.toFixed(1)}점`)
            .join(", ");

          // AI 분석 요청 (전체 분석)
          const analysisRes = await fetch("/api/ai-recommend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "analysis",
              strongDomains: strengths,
              weakDomains: weaknesses,
              domainScores: domainScoresText,
              totalScore: totalScore,
            }),
          });

          if (analysisRes.ok) {
            const result = await analysisRes.json();
            if (result.recommendation && result.recommendation.trim()) {
              // AI 분석 결과를 Supabase에 저장
              const { error: updateError } = await supabase
                .from("diagnosis_results")
                .update({ ai_analysis: result.recommendation.trim() })
                .eq("id", savedResultId);
              
              if (updateError) {
                // AI 분석 결과 저장 실패 (무시하고 진행)
              }
            }
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
        <p className="text-sm text-slate-500">
          사용자 정보를 확인하는 중입니다...
        </p>
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

        {/* 문항 리스트 - 2개씩 병렬 배치, 카드 낮게·진행바 하단 정렬·슬라이더 짧게·낮게, 완료 카드 푸른 계열 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-stretch">
          {questions.map((question) => {
            const isAnswered = answers[question.id] !== undefined && answers[question.id] !== null;
            return (
            <Card
              key={question.id}
              className={`flex flex-col h-full min-h-0 rounded-xl border p-2 shadow-sm transition-colors ${
                isAnswered
                  ? "border-blue-300/90 bg-gradient-to-br from-blue-100 via-blue-50/90 to-indigo-100/90"
                  : "border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50"
              }`}
            >
              <div className="flex-1 min-h-0 mb-2">
                <Label className={`text-xs font-semibold leading-tight line-clamp-3 ${isAnswered ? "text-slate-800" : "text-slate-800"}`}>
                  {question.id}. {question.text}
                </Label>
              </div>
              <div className="mt-auto w-full min-w-[33%] shrink-0">
                <div className="flex items-center gap-2 w-full">
                  <span className="shrink-0 text-[10px] font-medium text-slate-500 ml-[5mm]">매우 아니다</span>
                  <div className="min-w-0 flex-1">
                    <Slider
                      value={[isAnswered ? answers[question.id]! : 0]}
                      onValueChange={(value) => {
                        setAnswers((prev) => ({ ...prev, [question.id]: value[0] }));
                      }}
                      min={0}
                      max={100}
                      step={1}
                      className={`w-full [&_[data-slot=slider-track]]:h-[30px] [&_[data-slot=slider-thumb]]:h-5 [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:!rounded-sm ${
                        isAnswered
                          ? "[&_[data-slot=slider-thumb]]:bg-gradient-to-r [&_[data-slot=slider-thumb]]:from-blue-400/80 [&_[data-slot=slider-thumb]]:to-indigo-400/80 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:shadow-sm"
                          : "[&_[data-slot=slider-thumb]]:opacity-0 [&_[data-slot=slider-thumb]]:pointer-events-none"
                      }`}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-slate-500 mr-[5mm]">매우 그렇다</span>
                </div>
              </div>
            </Card>
          );})}
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
