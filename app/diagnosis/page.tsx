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
import { ClipboardCheck } from "lucide-react";

type Question = {
  id: string;
  text: string;
  domain: string;
};

const QUESTIONS: Question[] = [
  // 1영역: 수업 설계·운영
  {
    id: "1",
    text: "학습 목표를 학생 수준에 맞게 구체적 행동 목표로 제시한다.",
    domain: "domain1",
  },
  {
    id: "2",
    text: "성취기준과 수업 활동이 일관되게 연결되도록 수업을 설계한다.",
    domain: "domain1",
  },
  {
    id: "3",
    text: "학생 참여를 높이기 위해 질문, 토의, 활동을 균형 있게 운영한다.",
    domain: "domain1",
  },
  {
    id: "4",
    text: "수업 중 학생 반응에 따라 설명·활동을 조정(즉각적 수정)한다.",
    domain: "domain1",
  },
  {
    id: "5",
    text: "다양한 교수·학습 자료(교구/매체/실물 등)를 목적에 맞게 선택·활용한다.",
    domain: "domain1",
  },
  // 2영역: 학생 이해·생활지도
  {
    id: "6",
    text: "학생의 발달 특성(인지·정서·사회성)을 고려하여 지도한다.",
    domain: "domain2",
  },
  {
    id: "7",
    text: "학생의 강점과 어려움을 파악하기 위해 관찰·대화·기록을 지속한다.",
    domain: "domain2",
  },
  {
    id: "8",
    text: "문제행동을 다룰 때 원인(상황/욕구)을 먼저 파악하고 지도한다.",
    domain: "domain2",
  },
  {
    id: "9",
    text: "갈등 상황에서 학생이 감정을 조절하고 관계를 회복하도록 돕는다.",
    domain: "domain2",
  },
  {
    id: "10",
    text: "학생의 다양성(가정·문화·개별차)을 존중하며 차별 없이 지도한다.",
    domain: "domain2",
  },
  // 3영역: 평가·피드백
  {
    id: "11",
    text: "평가 계획을 수업 목표와 연계하여 사전에 안내한다.",
    domain: "domain3",
  },
  {
    id: "12",
    text: "수행평가에서 평가기준(루브릭 등)을 명확히 제시한다.",
    domain: "domain3",
  },
  {
    id: "13",
    text: "학생의 학습 과정을 평가에 반영하기 위해 형성평가를 활용한다.",
    domain: "domain3",
  },
  {
    id: "14",
    text: "피드백을 \"잘함/보완점/다음 전략\"처럼 구체적으로 제공한다.",
    domain: "domain3",
  },
  {
    id: "15",
    text: "평가 결과를 다음 수업 개선과 개별 지도에 실제로 반영한다.",
    domain: "domain3",
  },
  // 4영역: 학급경영·안전
  {
    id: "16",
    text: "학급 규칙과 기대 행동을 학생과 함께 정하고 일관되게 적용한다.",
    domain: "domain4",
  },
  {
    id: "17",
    text: "수업 전환(활동 이동, 정리, 모둠 전환 등)을 효율적으로 운영한다.",
    domain: "domain4",
  },
  {
    id: "18",
    text: "교실 환경(자리 배치, 자료 동선 등)을 학습에 도움이 되게 구성한다.",
    domain: "domain4",
  },
  {
    id: "19",
    text: "안전사고 예방을 위해 위험요소를 점검하고 예방지도를 실시한다.",
    domain: "domain4",
  },
  {
    id: "20",
    text: "위기 상황(사고·응급·폭력·재난 등) 발생 시 절차에 따라 침착하게 대응한다.",
    domain: "domain4",
  },
  // 5영역: 전문성 개발·성찰
  {
    id: "21",
    text: "수업 후 성찰(기록/회고)을 통해 개선점을 구체화한다.",
    domain: "domain5",
  },
  {
    id: "22",
    text: "학생 학습자료, 평가 결과 등을 근거로 수업을 점검·개선한다.",
    domain: "domain5",
  },
  {
    id: "23",
    text: "연수·독서·연구회 등으로 새로운 교수법을 지속적으로 학습한다.",
    domain: "domain5",
  },
  {
    id: "24",
    text: "동료의 수업을 관찰하거나 피드백을 주고받으며 공동 성장한다.",
    domain: "domain5",
  },
  {
    id: "25",
    text: "교육 정책/지침 변화가 수업과 학급 운영에 미치는 영향을 파악하고 반영한다.",
    domain: "domain5",
  },
  // 6영역: 소통·협력 및 포용적 교육
  {
    id: "26",
    text: "학부모와의 소통에서 학생의 강점과 성장 중심으로 신뢰를 형성한다.",
    domain: "domain6",
  },
  {
    id: "27",
    text: "민감한 사안(생활/평가/갈등)을 전달할 때 사실·근거·대안을 갖추어 설명한다.",
    domain: "domain6",
  },
  {
    id: "28",
    text: "담임·전담·특수/상담 등과 협력하여 학생 지원을 연계한다.",
    domain: "domain6",
  },
  {
    id: "29",
    text: "학습에 어려움이 있는 학생을 위해 지원(조정, 보조자료, 추가 지도)을 계획적으로 제공한다.",
    domain: "domain6",
  },
  {
    id: "30",
    text: "교실에서 모든 학생이 참여할 수 있도록 포용적 활동(역할, 수준, 참여 방식)을 설계한다.",
    domain: "domain6",
  },
];


function DiagnosisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPost = searchParams.get("type") === "post";
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userSchool, setUserSchool] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 보호된 라우트: 로그인하지 않은 사용자 또는 교사가 아니면 / 로 리다이렉트
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

      // 관리자는 교원 권한도 가집니다
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

  // 진행률 계산
  const progress = useMemo(() => {
    const answeredCount = Object.keys(answers).filter(
      (key) => answers[key] !== undefined && answers[key] !== null && answers[key] >= 0
    ).length;
    return (answeredCount / QUESTIONS.length) * 100;
  }, [answers]);

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

    QUESTIONS.forEach((q) => {
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
    const unanswered = QUESTIONS.filter((q) => answers[q.id] === undefined || answers[q.id] === null);
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

      // 디버깅: payload 확인
      console.log("저장할 진단 결과:", {
        domain1: payload.domain1,
        domain2: payload.domain2,
        domain3: payload.domain3,
        domain4: payload.domain4,
        domain5: payload.domain5,
        domain6: payload.domain6,
        total_score: payload.total_score,
      });

      const { error, data } = await supabase.from("diagnosis_results").insert([
        payload,
      ]).select();

      if (error) {
        console.error("Supabase insert error:", error);
        alert(
          `진단 결과 저장 중 오류가 발생했습니다.\n\n에러 내용: ${error.message}\n\nSupabase 테이블 설정을 확인해 주세요.`
        );
        return;
      }

      // 진단 결과 저장 성공 후 자동으로 AI 분석 실행 (전체 분석)
      const savedResultId = data?.[0]?.id;
      if (savedResultId) {
        try {
          // 영역별 점수 계산 (평균)
          const domainAverages = [
            { domain: "domain1", label: "수업 설계·운영", avg: domainScores.domain1 / 5, score: domainScores.domain1 },
            { domain: "domain2", label: "학생 이해·생활지도", avg: domainScores.domain2 / 5, score: domainScores.domain2 },
            { domain: "domain3", label: "평가·피드백", avg: domainScores.domain3 / 5, score: domainScores.domain3 },
            { domain: "domain4", label: "학급경영·안전", avg: domainScores.domain4 / 5, score: domainScores.domain4 },
            { domain: "domain5", label: "전문성 개발·성찰", avg: domainScores.domain5 / 5, score: domainScores.domain5 },
            { domain: "domain6", label: "소통·협력 및 포용적 교육", avg: domainScores.domain6 / 5, score: domainScores.domain6 },
          ];

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
                console.error("AI 분석 결과 DB 저장 실패:", updateError);
              } else {
                console.log("AI 분석 결과가 성공적으로 저장되었습니다.");
              }
            } else {
              console.error("AI 분석 응답에 recommendation이 없습니다:", result);
            }
          } else {
            const errorData = await analysisRes.json().catch(() => ({}));
            console.error("AI 분석 API 호출 실패:", analysisRes.status, errorData);
          }
        } catch (analysisError) {
          console.error("AI 분석 생성 중 오류:", analysisError);
          // AI 분석 실패해도 진단 결과 저장은 성공했으므로 계속 진행
        }
      }

      alert("진단 결과가 저장되었습니다.");
      if (isPost) {
        router.push("/diagnosis/result?type=post");
      } else {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error(error);
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
          title={isPost ? "(사후) 나의 교원 역량 진단" : "나의 교원 역량 사전 진단"}
          subtitle="각 문항에 대해 현재 나의 수준에 가장 가까운 응답을 선택해 주세요."
        />

        {/* 진행률 바 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-600">진행률</span>
            <span className="font-semibold text-slate-800">
              {Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== null).length} / {QUESTIONS.length}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </Card>

        {/* 문항 리스트 - 2개씩 병렬 배치 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {QUESTIONS.map((question) => (
            <Card
              key={question.id}
              className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-5 shadow-sm"
            >
              <div className="mb-4">
                <Label className="text-sm font-semibold text-slate-800">
                  {question.id}. {question.text}
                </Label>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-medium text-slate-600">매우 그렇지 않다</span>
                  <span className="text-xs font-medium text-slate-600">매우 그렇다</span>
                </div>
                <div className="px-2">
                  <Slider
                    value={[answers[question.id] !== undefined && answers[question.id] !== null ? answers[question.id] : 0]}
                    onValueChange={(value) => {
                      setAnswers((prev) => ({ ...prev, [question.id]: value[0] }));
                    }}
                    min={0}
                    max={100}
                    step={1}
                    className={`w-full [&_[data-slot=slider-track]]:h-6 [&_[data-slot=slider-thumb]]:size-6 ${
                      answers[question.id] !== undefined && answers[question.id] !== null
                        ? "[&_[data-slot=slider-thumb]]:bg-gradient-to-r [&_[data-slot=slider-thumb]]:from-[#8B5CF6] [&_[data-slot=slider-thumb]]:to-[#3B82F6] [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:shadow-md"
                        : "[&_[data-slot=slider-thumb]]:opacity-0 [&_[data-slot=slider-thumb]]:pointer-events-none"
                    }`}
                  />
                </div>
              </div>
            </Card>
          ))}
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
