"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { Printer, FileDown, X } from "lucide-react";
import { useReactToPrint } from "react-to-print";

const DOMAIN_LABELS: Record<string, string> = {
  domain1: "수업 설계·운영",
  domain2: "학생 이해·생활지도",
  domain3: "평가·피드백",
  domain4: "학급경영·안전",
  domain5: "전문성 개발·성찰",
  domain6: "소통·협력 및 포용",
};

type TrainingPlanRow = { id: string; name: string; period: string; duration: string; remarks: string };
type EducationPlanRow = { id: string; area: string; period: string; duration: string; remarks: string };
type BookPlanRow = { id: string; title: string; period: string; method: string };
type ExpenseRequestRow = { id: string; activity: string; period: string; method: string; remarks: string };
type CommunityPlanRow = { id: string; activity: string; period: string; method: string; remarks: string };
type OtherPlanRow = { id: string; text: string };

type PlanData = {
  development_goal: string;
  expected_outcome: string;
  annual_goal?: string;
  expense_annual_goal?: string;
  community_annual_goal?: string;
  book_annual_goal?: string;
  education_annual_goal?: string;
  education_annual_goal_unit?: string;
  other_annual_goal?: string;
  training_plans: TrainingPlanRow[] | null;
  education_plans: EducationPlanRow[] | null;
  book_plans: BookPlanRow[] | null;
  expense_requests: ExpenseRequestRow[] | null;
  community_plans: CommunityPlanRow[] | null;
  other_plans: OtherPlanRow[] | null;
};

type DiagnosisRow = { domain: string; label: string; avg: number };

export default function PlanPrintPage() {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [userName, setUserName] = useState<string>("");
  const [userSchool, setUserSchool] = useState<string>("");
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [diagnosisSummary, setDiagnosisSummary] = useState<{ strengths: string[]; weaknesses: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setLoading(false);
        return;
      }
      const meta = (user.user_metadata || {}) as { name?: string; schoolName?: string };
      setUserName(meta.name ?? user.email ?? "");
      setUserSchool(meta.schoolName ?? "");

      const { data: planRow } = await supabase
        .from("development_plans")
        .select("*")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (planRow) {
        setPlan({
          development_goal: (planRow.development_goal as string) ?? "",
          expected_outcome: (planRow.expected_outcome as string) ?? "",
          annual_goal: (planRow.annual_goal as string) ?? "",
          expense_annual_goal: (planRow.expense_annual_goal as string) ?? "",
          community_annual_goal: (planRow.community_annual_goal as string) ?? "",
          book_annual_goal: (planRow.book_annual_goal as string) ?? "",
          education_annual_goal: (planRow.education_annual_goal as string) ?? "",
          education_annual_goal_unit: (planRow.education_annual_goal_unit as string) ?? "시간",
          other_annual_goal: (planRow.other_annual_goal as string) ?? "",
          training_plans: (planRow.training_plans as TrainingPlanRow[]) ?? [],
          education_plans: (planRow.education_plans as EducationPlanRow[]) ?? [],
          book_plans: (planRow.book_plans as BookPlanRow[]) ?? [],
          expense_requests: (planRow.expense_requests as ExpenseRequestRow[]) ?? [],
          community_plans: (planRow.community_plans as CommunityPlanRow[]) ?? [],
          other_plans: (planRow.other_plans as OtherPlanRow[]) ?? [],
        });
      } else {
        setPlan({
          development_goal: "",
          expected_outcome: "",
          annual_goal: "",
          expense_annual_goal: "",
          community_annual_goal: "",
          book_annual_goal: "",
          education_annual_goal: "",
          education_annual_goal_unit: "시간",
          other_annual_goal: "",
          training_plans: [],
          education_plans: [],
          book_plans: [],
          expense_requests: [],
          community_plans: [],
          other_plans: [],
        });
      }

      const { data: diag } = await supabase
        .from("diagnosis_results")
        .select("domain1,domain2,domain3,domain4,domain5,domain6")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (diag) {
        const rows: DiagnosisRow[] = [
          { domain: "domain1", label: DOMAIN_LABELS.domain1, avg: ((diag.domain1 as number) ?? 0) / 5 },
          { domain: "domain2", label: DOMAIN_LABELS.domain2, avg: ((diag.domain2 as number) ?? 0) / 5 },
          { domain: "domain3", label: DOMAIN_LABELS.domain3, avg: ((diag.domain3 as number) ?? 0) / 5 },
          { domain: "domain4", label: DOMAIN_LABELS.domain4, avg: ((diag.domain4 as number) ?? 0) / 5 },
          { domain: "domain5", label: DOMAIN_LABELS.domain5, avg: ((diag.domain5 as number) ?? 0) / 5 },
          { domain: "domain6", label: DOMAIN_LABELS.domain6, avg: ((diag.domain6 as number) ?? 0) / 5 },
        ];
        const sorted = [...rows].sort((a, b) => b.avg - a.avg);
        setDiagnosisSummary({
          strengths: sorted.slice(0, 3).map((r) => r.label),
          weaknesses: sorted.slice(-3).reverse().map((r) => r.label),
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: "자기역량 개발계획서",
    pageStyle: `
      @page { size: A4; margin: 12mm; }
      html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-content-area { background: #fff !important; }
    `,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-600">계획서를 불러오는 중...</p>
      </div>
    );
  }

  const trainingPlans = plan?.training_plans ?? [];
  const educationPlans = plan?.education_plans ?? [];
  const bookPlans = plan?.book_plans ?? [];
  const expenseRequests = plan?.expense_requests ?? [];
  const communityPlans = plan?.community_plans ?? [];
  const otherPlans = plan?.other_plans ?? [];

  return (
    <div className="min-h-screen bg-white px-4 py-6">
      <div className="mx-auto max-w-4xl">
        {/* 상단 버튼: 인쇄(A4), PDF 저장, 닫기 */}
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
          <Button
            type="button"
            onClick={() => handlePrint()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Printer className="h-4 w-4" />
            인쇄 (A4)
          </Button>
          <Button
            type="button"
            onClick={() => handlePrint()}
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

        {/* 출력용 문서 영역 */}
        <div
          ref={contentRef}
          className="print-content-area rounded-lg bg-white p-6 shadow-lg print:shadow-none print:rounded-none print:p-0 print:bg-white"
          style={{ minHeight: "297mm" }}
        >
          {/* 제목 */}
          <div className="mb-6 border-b-2 border-sky-200 bg-sky-50/80 py-3 text-center print:py-2">
            <h1 className="text-lg font-bold text-slate-800">자기역량 개발계획서</h1>
          </div>

          <div className="space-y-4 text-sm text-slate-800">
            {/* 성명, 학교명 */}
            <table className="w-full border-collapse border border-slate-300">
              <tbody>
                <tr>
                  <td className="w-28 border border-slate-300 bg-slate-50 px-2 py-1.5 font-medium">성명</td>
                  <td className="border border-slate-300 px-2 py-1.5">{userName || "—"}</td>
                  <td className="w-28 border border-slate-300 bg-slate-50 px-2 py-1.5 font-medium">학교명</td>
                  <td className="border border-slate-300 px-2 py-1.5">{userSchool || "—"}</td>
                </tr>
              </tbody>
            </table>

            {/* 역량 진단 요약 */}
            <div>
              <div className="border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">역량 진단 요약 (사전 검사 결과)</div>
              <table className="w-full border-collapse border border-slate-300">
                <tbody>
                  <tr>
                    <td className="w-40 border border-slate-300 bg-slate-50 px-2 py-1.5 font-medium">강점 영역</td>
                    <td className="border border-slate-300 px-2 py-1.5">{diagnosisSummary?.strengths?.join(", ") || "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 bg-slate-50 px-2 py-1.5 font-medium">개발 우선 영역</td>
                    <td className="border border-slate-300 px-2 py-1.5">{diagnosisSummary?.weaknesses?.join(", ") || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 자기 역량 개발 목표 */}
            <div>
              <div className="border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">자기 역량 개발 목표</div>
              <div className="min-h-[4rem] border border-slate-300 px-2 py-1.5 whitespace-pre-wrap">{plan?.development_goal || ""}</div>
            </div>

            {/* 6개 항목: 한 줄에 두 개씩 2열 배치 */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              {/* 1행: 연수 | 수업 공개 */}
              <div>
                <div className="flex justify-between items-center border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">
                  <span>연수(직무, 자율) 계획</span>
                  <span className="text-slate-600 font-normal text-xs">나의 연간 목표: {plan?.annual_goal || "—"} 시간</span>
                </div>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">직무 / 자율 연수명</th>
                      <th className="w-12 border border-slate-300 px-1 py-0.5 text-left font-medium">시기</th>
                      <th className="w-14 border border-slate-300 px-1 py-0.5 text-left font-medium">기간</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingPlans.length ? trainingPlans.map((r) => (
                      <tr key={r.id}>
                        <td className="border border-slate-300 px-1 py-0.5">{r.name || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.period || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.duration || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.remarks || ""}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="border border-slate-300 px-1 py-0.5">&nbsp;</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="flex justify-between items-center border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">
                  <span>수업 공개 계획</span>
                  <span className="text-slate-600 font-normal text-xs">나의 연간 목표: {plan?.expense_annual_goal || "—"} 회</span>
                </div>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">내용</th>
                      <th className="w-12 border border-slate-300 px-1 py-0.5 text-left font-medium">시기</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">방법</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseRequests.length ? expenseRequests.map((r) => (
                      <tr key={r.id}>
                        <td className="border border-slate-300 px-1 py-0.5">{r.activity || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.period || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.method || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.remarks || ""}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="border border-slate-300 px-1 py-0.5">&nbsp;</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 2행: 교원학습 | 서적 */}
              <div>
                <div className="flex justify-between items-center border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">
                  <span>교원학습 공동체 활동 계획</span>
                  <span className="text-slate-600 font-normal text-xs">나의 연간 목표: {plan?.community_annual_goal || "—"} 회</span>
                </div>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">내용</th>
                      <th className="w-12 border border-slate-300 px-1 py-0.5 text-left font-medium">시기</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">방법</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communityPlans.length ? communityPlans.map((r) => (
                      <tr key={r.id}>
                        <td className="border border-slate-300 px-1 py-0.5">{r.activity || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.period || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.method || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.remarks || ""}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="border border-slate-300 px-1 py-0.5">&nbsp;</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="flex justify-between items-center border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">
                  <span>전문 서적 / 에듀테크 등 구입 활용 계획</span>
                  <span className="text-slate-600 font-normal text-xs">나의 연간 목표: {plan?.book_annual_goal || "—"} 회</span>
                </div>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">서적/도구명</th>
                      <th className="w-12 border border-slate-300 px-1 py-0.5 text-left font-medium">시기</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">활용방법</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookPlans.length ? bookPlans.map((r) => (
                      <tr key={r.id}>
                        <td className="border border-slate-300 px-1 py-0.5">{r.title || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.period || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.method || ""}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} className="border border-slate-300 px-1 py-0.5">&nbsp;</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 3행: 건강 | 기타 */}
              <div>
                <div className="flex justify-between items-center border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">
                  <span>건강/체력 향상 계획</span>
                  <span className="text-slate-600 font-normal text-xs">
                    나의 연간 목표: {plan?.education_annual_goal || "—"} {plan?.education_annual_goal_unit === "거리" ? "거리 km" : "시간"}
                  </span>
                </div>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">내용</th>
                      <th className="w-12 border border-slate-300 px-1 py-0.5 text-left font-medium">시기</th>
                      <th className="w-12 border border-slate-300 px-1 py-0.5 text-left font-medium">기간</th>
                      <th className="border border-slate-300 px-1 py-0.5 text-left font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {educationPlans.length ? educationPlans.map((r) => (
                      <tr key={r.id}>
                        <td className="border border-slate-300 px-1 py-0.5">{r.area || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.period || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.duration || ""}</td>
                        <td className="border border-slate-300 px-1 py-0.5">{r.remarks || ""}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="border border-slate-300 px-1 py-0.5">&nbsp;</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="flex justify-between items-center border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">
                  <span>기타 계획</span>
                  <span className="text-slate-600 font-normal text-xs">나의 연간 목표: {plan?.other_annual_goal || "—"} 건</span>
                </div>
                <div className="min-h-[3rem] border border-slate-300 px-2 py-1.5">
                  {otherPlans.length ? (
                    <ul className="list-inside list-disc space-y-0.5 text-xs">
                      {otherPlans.map((r) => (
                        <li key={r.id}>{r.text || ""}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-400">&nbsp;</span>
                  )}
                </div>
              </div>
            </div>

            {/* 기대 효과 */}
            <div>
              <div className="border border-b-0 border-slate-300 bg-slate-100 px-2 py-1 font-medium">기대 효과</div>
              <div className="min-h-[4rem] border border-slate-300 px-2 py-1.5 whitespace-pre-wrap">{plan?.expected_outcome || ""}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center print:hidden">
          <Link href="/dashboard" className="text-sm text-slate-500 underline hover:text-slate-700">대시보드로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
