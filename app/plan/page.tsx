"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardPageHeader } from "@/components/CardPageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabaseClient";
import {
  Target,
  Calendar,
  Activity,
  BookOpen,
  Presentation,
  Users,
  Sparkles,
  BarChart3,
  ListChecks,
  GripVertical,
  MessageCircle,
  ClipboardList,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

type TrainingPlanRow = {
  id: string;
  name: string;
  period: string;
  duration: string;
  remarks: string;
};

type EducationPlanRow = {
  id: string;
  area: string;
  period: string;
  duration: string;
  remarks: string;
};

type BookPlanRow = {
  id: string;
  title: string;
  period: string;
  method: string;
};

type ExpenseRequestRow = {
  id: string;
  activity: string; // 내용
  period: string;
  method: string;
  remarks: string;
};

type CommunityPlanRow = {
  id: string;
  activity: string; // 내용
  period: string;
  method: string;
  remarks: string;
};

type OtherPlanRow = {
  id: string;
  text: string;
};

const DEFAULT_EXPENSE_REQUESTS: ExpenseRequestRow[] = [
  { id: "1", activity: "학부모 공개 수업", period: "3월", method: "학부모 전체 참관", remarks: "학교설명회 연계" },
  { id: "2", activity: "동료 공개 수업", period: "9월", method: "동료 교사 수업 참관", remarks: "자율장학 연계" },
];

function getDefaultExpenseRequestsWithEmptyRow(): ExpenseRequestRow[] {
  const base = [...DEFAULT_EXPENSE_REQUESTS].map((r, i) => ({ ...r, id: String(Date.now() + i) }));
  return base.concat([{ id: String(Date.now() + 2), activity: "", period: "", method: "", remarks: "" }]);
}

// Sortable Row 컴포넌트들
function SortableTrainingRow({
  row,
  idx,
  trainingPlans,
  setTrainingPlans,
  removeTrainingRow,
}: {
  row: TrainingPlanRow;
  idx: number;
  trainingPlans: TrainingPlanRow[];
  setTrainingPlans: (plans: TrainingPlanRow[]) => void;
  removeTrainingRow: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
        <GripVertical className="h-4 w-4" />
      </div>
      <Input
        value={row.name}
        onChange={(e) => {
          const updated = [...trainingPlans];
          updated[idx].name = e.target.value;
          setTrainingPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: AI 활용 수업" : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...trainingPlans];
          updated[idx].period = e.target.value;
          setTrainingPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 4월중" : ""}
      />
      <Input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={row.duration}
        onChange={(e) => {
          const updated = [...trainingPlans];
          updated[idx].duration = e.target.value;
          setTrainingPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "시간" : ""}
      />
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...trainingPlans];
          updated[idx].remarks = e.target.value;
          setTrainingPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "비고" : ""}
      />
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeTrainingRow(row.id)}
          disabled={trainingPlans.length === 1}
          className="h-8 w-8 shrink-0 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        >
          ×
        </Button>
      </div>
    </div>
  );
}

function SortableExpenseRow({
  row,
  idx,
  expenseRequests,
  setExpenseRequests,
  removeExpenseRow,
}: {
  row: ExpenseRequestRow;
  idx: number;
  expenseRequests: ExpenseRequestRow[];
  setExpenseRequests: (requests: ExpenseRequestRow[]) => void;
  removeExpenseRow: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
        <GripVertical className="h-4 w-4" />
      </div>
      <Input
        value={row.activity}
        onChange={(e) => {
          const updated = [...expenseRequests];
          updated[idx].activity = e.target.value;
          setExpenseRequests(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder=""
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...expenseRequests];
          updated[idx].period = e.target.value;
          setExpenseRequests(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder=""
      />
      <Input
        value={row.method}
        onChange={(e) => {
          const updated = [...expenseRequests];
          updated[idx].method = e.target.value;
          setExpenseRequests(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder=""
      />
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...expenseRequests];
          updated[idx].remarks = e.target.value;
          setExpenseRequests(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder=""
      />
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeExpenseRow(row.id)}
          disabled={expenseRequests.length === 1}
          className="h-8 w-8 shrink-0 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        >
          ×
        </Button>
      </div>
    </div>
  );
}

function SortableCommunityRow({
  row,
  idx,
  communityPlans,
  setCommunityPlans,
  removeCommunityRow,
}: {
  row: CommunityPlanRow;
  idx: number;
  communityPlans: CommunityPlanRow[];
  setCommunityPlans: (plans: CommunityPlanRow[]) => void;
  removeCommunityRow: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
        <GripVertical className="h-4 w-4" />
      </div>
      <Input
        value={row.activity}
        onChange={(e) => {
          const updated = [...communityPlans];
          updated[idx].activity = e.target.value;
          setCommunityPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 수업 나눔 동아리" : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...communityPlans];
          updated[idx].period = e.target.value;
          setCommunityPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 4월~6월" : ""}
      />
      <Input
        value={row.method}
        onChange={(e) => {
          const updated = [...communityPlans];
          updated[idx].method = e.target.value;
          setCommunityPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 월 1회 모임" : ""}
      />
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...communityPlans];
          updated[idx].remarks = e.target.value;
          setCommunityPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "비고" : ""}
      />
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeCommunityRow(row.id)}
          disabled={communityPlans.length === 1}
          className="h-8 w-8 shrink-0 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        >
          ×
        </Button>
      </div>
    </div>
  );
}

function SortableBookRow({
  row,
  idx,
  bookPlans,
  setBookPlans,
  removeBookRow,
}: {
  row: BookPlanRow;
  idx: number;
  bookPlans: BookPlanRow[];
  setBookPlans: (plans: BookPlanRow[]) => void;
  removeBookRow: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
        <GripVertical className="h-4 w-4" />
      </div>
      <Input
        value={row.title}
        onChange={(e) => {
          const updated = [...bookPlans];
          updated[idx].title = e.target.value;
          setBookPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: AI 시대의 교육" : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...bookPlans];
          updated[idx].period = e.target.value;
          setBookPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 6월" : ""}
      />
      <Input
        value={row.method}
        onChange={(e) => {
          const updated = [...bookPlans];
          updated[idx].method = e.target.value;
          setBookPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 독서 후 수업 적용" : ""}
      />
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeBookRow(row.id)}
          disabled={bookPlans.length === 1}
          className="h-8 w-8 shrink-0 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        >
          ×
        </Button>
      </div>
    </div>
  );
}

function SortableEducationRow({
  row,
  idx,
  educationPlans,
  setEducationPlans,
  removeEducationRow,
}: {
  row: EducationPlanRow;
  idx: number;
  educationPlans: EducationPlanRow[];
  setEducationPlans: (plans: EducationPlanRow[]) => void;
  removeEducationRow: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
        <GripVertical className="h-4 w-4" />
      </div>
      <Input
        value={row.area}
        onChange={(e) => {
          const updated = [...educationPlans];
          updated[idx].area = e.target.value;
          setEducationPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 하이킹" : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...educationPlans];
          updated[idx].period = e.target.value;
          setEducationPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 4~10월" : ""}
      />
      <Input
        value={row.duration}
        onChange={(e) => {
          const updated = [...educationPlans];
          updated[idx].duration = e.target.value;
          setEducationPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 월 2회" : ""}
      />
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...educationPlans];
          updated[idx].remarks = e.target.value;
          setEducationPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 서울 둘레길 정복" : ""}
      />
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeEducationRow(row.id)}
          disabled={educationPlans.length === 1}
          className="h-8 w-8 shrink-0 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        >
          ×
        </Button>
      </div>
    </div>
  );
}

function SortableOtherRow({
  row,
  idx,
  otherPlans,
  setOtherPlans,
  removeOtherRow,
}: {
  row: OtherPlanRow;
  idx: number;
  otherPlans: OtherPlanRow[];
  setOtherPlans: (plans: OtherPlanRow[]) => void;
  removeOtherRow: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50/50 px-2 py-1">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
        <GripVertical className="h-4 w-4" />
      </div>
      <Input
        value={row.text}
        onChange={(e) => {
          const updated = [...otherPlans];
          updated[idx].text = e.target.value;
          setOtherPlans(updated);
        }}
        className="flex-1 rounded text-xs h-8 py-1 text-left"
        placeholder={idx === 0 ? "예: 지원단활동, 컨설팅 및 강의, 봉사활동 등" : ""}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => removeOtherRow(row.id)}
        disabled={otherPlans.length === 1}
        className="h-8 w-8 shrink-0 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
      >
        ×
      </Button>
    </div>
  );
}

export default function PlanPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userSchool, setUserSchool] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingGoal, setIsGeneratingGoal] = useState(false);
  const [isGeneratingOutcome, setIsGeneratingOutcome] = useState(false);
  const [aiFillRowsLoading, setAiFillRowsLoading] = useState<string | null>(null);
  const [hasUsedAIGoal, setHasUsedAIGoal] = useState(false);
  const [hasUsedAIEffect, setHasUsedAIEffect] = useState(false);
  const [diagnosisSummary, setDiagnosisSummary] = useState<{
    strengths: string[];
    weaknesses: string[];
    domain1: number;
    domain2: number;
    domain3: number;
    domain4: number;
    domain5: number;
    domain6: number;
    createdAt: string;
  } | null>(null);
  const [schoolCategories, setSchoolCategories] = useState<{ key: string; label: string; unit: string }[]>([]);

  // 폼 데이터
  const [developmentGoal, setDevelopmentGoal] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [annualGoal, setAnnualGoal] = useState("");
  const [expenseAnnualGoal, setExpenseAnnualGoal] = useState("");
  const [communityAnnualGoal, setCommunityAnnualGoal] = useState("");
  const [bookAnnualGoal, setBookAnnualGoal] = useState("");
  const [educationAnnualGoal, setEducationAnnualGoal] = useState("");
  const [otherAnnualGoal, setOtherAnnualGoal] = useState("");
  const [trainingPlans, setTrainingPlans] = useState<TrainingPlanRow[]>([
    { id: "1", name: "", period: "", duration: "", remarks: "" },
  ]);
  const [educationPlans, setEducationPlans] = useState<EducationPlanRow[]>([
    { id: "1", area: "", period: "", duration: "", remarks: "" },
  ]);
  const [bookPlans, setBookPlans] = useState<BookPlanRow[]>([
    { id: "1", title: "", period: "", method: "" },
  ]);
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequestRow[]>(() => getDefaultExpenseRequestsWithEmptyRow());
  const [communityPlans, setCommunityPlans] = useState<CommunityPlanRow[]>([
    { id: "1", activity: "", period: "", method: "", remarks: "" },
  ]);
  const [otherPlans, setOtherPlans] = useState<OtherPlanRow[]>([
    { id: "1", text: "" },
  ]);
  const [mentoringFeedback, setMentoringFeedback] = useState<string | null>(null);
  const [isMentoringLoading, setIsMentoringLoading] = useState(false);

  // 보호된 라우트: 교사만 접근 가능
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

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const res = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${session.access_token}` } });
          if (res.ok) {
            const j = await res.json();
            if (Array.isArray(j.categories)) setSchoolCategories(j.categories);
          }
        } catch {
          // ignore
        }
      }

      // AI 추천 사용 여부 (localStorage - 한번 받았으면 '다시 받기' 표시)
      if (typeof window !== "undefined") {
        setHasUsedAIGoal(localStorage.getItem("plan_ai_goal_used") === "true");
        setHasUsedAIEffect(localStorage.getItem("plan_ai_effect_used") === "true");
      }

      // 최신 계획서 불러오기 (한번 쓰인 내용 다시 열어도 유지)
      if (user.email) {
        try {
          const { data: planData } = await supabase
            .from("development_plans")
            .select("*")
            .eq("user_email", user.email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (planData) {
            setDevelopmentGoal((planData.development_goal as string) ?? "");
            setExpectedOutcome((planData.expected_outcome as string) ?? "");
            setAnnualGoal((planData.annual_goal as string) ?? "");
            setExpenseAnnualGoal((planData.expense_annual_goal as string) ?? "");
            setCommunityAnnualGoal((planData.community_annual_goal as string) ?? "");
            setBookAnnualGoal((planData.book_annual_goal as string) ?? "");
            setEducationAnnualGoal((planData.education_annual_goal as string) ?? "");
            setOtherAnnualGoal((planData.other_annual_goal as string) ?? "");
            const tp = planData.training_plans as TrainingPlanRow[] | null;
            if (Array.isArray(tp) && tp.length > 0) setTrainingPlans(tp);
            const ep = planData.education_plans as EducationPlanRow[] | null;
            if (Array.isArray(ep) && ep.length > 0) setEducationPlans(ep);
            const bp = planData.book_plans as BookPlanRow[] | null;
            if (Array.isArray(bp) && bp.length > 0) setBookPlans(bp);
            const er = planData.expense_requests as (ExpenseRequestRow & { amount?: string })[] | null;
            const hasRealContent = Array.isArray(er) && er.some((r) => (r.activity ?? "").trim() !== "" || (r.method ?? "").trim() !== "");
            if (hasRealContent && Array.isArray(er) && er.length > 0) {
              setExpenseRequests(er.map(({ id, activity, period, method, remarks }) => ({ id, activity: activity ?? "", period: period ?? "", method: method ?? "", remarks: remarks ?? "" })));
            } else {
              setExpenseRequests(getDefaultExpenseRequestsWithEmptyRow());
            }
            const cp = planData.community_plans as CommunityPlanRow[] | null;
            if (Array.isArray(cp) && cp.length > 0) setCommunityPlans(cp);
            const op = planData.other_plans as OtherPlanRow[] | null;
            if (Array.isArray(op) && op.length > 0) setOtherPlans(op);
          }
        } catch (e) {
          console.error("Error loading latest plan:", e);
        }
      }

      // 진단 결과 가져오기
      if (user.email) {
        try {
          const { data, error } = await supabase
            .from("diagnosis_results")
            .select("domain1,domain2,domain3,domain4,domain5,domain6,created_at")
            .eq("user_email", user.email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && data) {
            // 영역 이름 매핑
            const domainLabels: Record<string, string> = {
              domain1: "수업 설계·운영",
              domain2: "학생 이해·생활지도",
              domain3: "평가·피드백",
              domain4: "학급경영·안전",
              domain5: "전문성 개발·성찰",
              domain6: "소통·협력 및 포용적 교육",
            };

            // 각 영역의 평균 점수 계산 (각 영역당 5문항이므로 5로 나눔)
            const domainAverages = [
              {
                domain: "domain1",
                label: domainLabels.domain1,
                avg: ((data.domain1 as number) ?? 0) / 5,
              },
              {
                domain: "domain2",
                label: domainLabels.domain2,
                avg: ((data.domain2 as number) ?? 0) / 5,
              },
              {
                domain: "domain3",
                label: domainLabels.domain3,
                avg: ((data.domain3 as number) ?? 0) / 5,
              },
              {
                domain: "domain4",
                label: domainLabels.domain4,
                avg: ((data.domain4 as number) ?? 0) / 5,
              },
              {
                domain: "domain5",
                label: domainLabels.domain5,
                avg: ((data.domain5 as number) ?? 0) / 5,
              },
              {
                domain: "domain6",
                label: domainLabels.domain6,
                avg: ((data.domain6 as number) ?? 0) / 5,
              },
            ];

            // 평균 점수 기준으로 정렬
            const sorted = [...domainAverages].sort((a, b) => b.avg - a.avg);

            // 상위 3개 (강점)
            const strengths = sorted.slice(0, 3).map((item) => item.label);

            // 하위 3개 (약점)
            const weaknesses = sorted.slice(-3).map((item) => item.label);

            // 날짜 포맷팅 (24.06.03 형태)
            const createdAt = data.created_at as string;
            const date = new Date(createdAt);
            const formattedDate = `${String(date.getFullYear()).slice(-2)}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;

            setDiagnosisSummary({
              strengths,
              weaknesses,
              domain1: domainAverages.find((d) => d.domain === "domain1")?.avg ?? 0,
              domain2: domainAverages.find((d) => d.domain === "domain2")?.avg ?? 0,
              domain3: domainAverages.find((d) => d.domain === "domain3")?.avg ?? 0,
              domain4: domainAverages.find((d) => d.domain === "domain4")?.avg ?? 0,
              domain5: domainAverages.find((d) => d.domain === "domain5")?.avg ?? 0,
              domain6: domainAverages.find((d) => d.domain === "domain6")?.avg ?? 0,
              createdAt: formattedDate,
            });
          }
        } catch (error) {
          console.error("Error fetching diagnosis summary:", error);
        }
      }
    };

    checkSession();
  }, [router]);

  // 행 추가 함수들
  const addTrainingRow = () => {
    setTrainingPlans([
      ...trainingPlans,
      { id: Date.now().toString(), name: "", period: "", duration: "", remarks: "" },
    ]);
  };

  const addEducationRow = () => {
    setEducationPlans([
      ...educationPlans,
      { id: Date.now().toString(), area: "", period: "", duration: "", remarks: "" },
    ]);
  };

  const addBookRow = () => {
    setBookPlans([
      ...bookPlans,
      { id: Date.now().toString(), title: "", period: "", method: "" },
    ]);
  };

  const addExpenseRow = () => {
    setExpenseRequests([
      ...expenseRequests,
      { id: Date.now().toString(), activity: "", period: "", method: "", remarks: "" },
    ]);
  };

  const addCommunityRow = () => {
    setCommunityPlans([
      ...communityPlans,
      { id: Date.now().toString(), activity: "", period: "", method: "", remarks: "" },
    ]);
  };

  const addOtherRow = () => {
    setOtherPlans([...otherPlans, { id: Date.now().toString(), text: "" }]);
  };

  // 행 삭제 함수들
  const removeTrainingRow = (id: string) => {
    if (trainingPlans.length > 1) {
      setTrainingPlans(trainingPlans.filter((row) => row.id !== id));
    }
  };

  const removeEducationRow = (id: string) => {
    if (educationPlans.length > 1) {
      setEducationPlans(educationPlans.filter((row) => row.id !== id));
    }
  };

  const removeBookRow = (id: string) => {
    if (bookPlans.length > 1) {
      setBookPlans(bookPlans.filter((row) => row.id !== id));
    }
  };

  const removeExpenseRow = (id: string) => {
    if (expenseRequests.length > 1) {
      setExpenseRequests(expenseRequests.filter((row) => row.id !== id));
    }
  };

  const removeCommunityRow = (id: string) => {
    if (communityPlans.length > 1) {
      setCommunityPlans(communityPlans.filter((row) => row.id !== id));
    }
  };

  const removeOtherRow = (id: string) => {
    if (otherPlans.length > 1) {
      setOtherPlans(otherPlans.filter((row) => row.id !== id));
    }
  };

  // 드래그 앤 드롭 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 드래그 종료 핸들러들
  const handleTrainingDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = trainingPlans.findIndex((item) => item.id === active.id);
      const newIndex = trainingPlans.findIndex((item) => item.id === over.id);
      setTrainingPlans(arrayMove(trainingPlans, oldIndex, newIndex));
    }
  };

  const handleExpenseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = expenseRequests.findIndex((item) => item.id === active.id);
      const newIndex = expenseRequests.findIndex((item) => item.id === over.id);
      setExpenseRequests(arrayMove(expenseRequests, oldIndex, newIndex));
    }
  };

  const handleCommunityDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = communityPlans.findIndex((item) => item.id === active.id);
      const newIndex = communityPlans.findIndex((item) => item.id === over.id);
      setCommunityPlans(arrayMove(communityPlans, oldIndex, newIndex));
    }
  };

  const handleBookDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = bookPlans.findIndex((item) => item.id === active.id);
      const newIndex = bookPlans.findIndex((item) => item.id === over.id);
      setBookPlans(arrayMove(bookPlans, oldIndex, newIndex));
    }
  };

  const handleEducationDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = educationPlans.findIndex((item) => item.id === active.id);
      const newIndex = educationPlans.findIndex((item) => item.id === over.id);
      setEducationPlans(arrayMove(educationPlans, oldIndex, newIndex));
    }
  };

  const handleOtherDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = otherPlans.findIndex((item) => item.id === active.id);
      const newIndex = otherPlans.findIndex((item) => item.id === over.id);
      setOtherPlans(arrayMove(otherPlans, oldIndex, newIndex));
    }
  };

  const PLAN_CATEGORY_DEFAULTS: Record<string, { label: string; unit: string }> = {
    training: { label: "연수(직무·자율)", unit: "시간" },
    class_open: { label: "수업 공개", unit: "회" },
    community: { label: "교원학습 공동체", unit: "회" },
    book_edutech: { label: "전문 서적/에듀테크", unit: "회" },
    health: { label: "건강/체력", unit: "시간" },
    other: { label: "기타 계획", unit: "건" },
  };
  const getPlanCategoryLabel = (key: string) => schoolCategories.find((c) => c.key === key)?.label ?? PLAN_CATEGORY_DEFAULTS[key]?.label ?? key;
  const getPlanCategoryUnit = (key: string) => schoolCategories.find((c) => c.key === key)?.unit ?? PLAN_CATEGORY_DEFAULTS[key]?.unit ?? "회";

  // AI 추천/수정 후 드래프트 저장 (API 절감: 한번 쓰인 내용 다시 열어도 유지)
  const savePlanDraft = async (
    email: string,
    school: string,
    partial: {
      development_goal?: string;
      expected_outcome?: string;
      annual_goal?: string;
      expense_annual_goal?: string;
      community_annual_goal?: string;
      book_annual_goal?: string;
      education_annual_goal?: string;
      education_annual_goal_unit?: "시간" | "거리";
      other_annual_goal?: string;
    }
  ) => {
    try {
      const { data: existing } = await supabase
        .from("development_plans")
        .select("id")
        .eq("user_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from("development_plans")
          .update(partial)
          .eq("id", existing.id);
      } else {
        await supabase.from("development_plans").insert([
          {
            user_email: email,
            school_name: school,
            development_goal: partial.development_goal ?? "",
            expected_outcome: partial.expected_outcome ?? "",
            annual_goal: partial.annual_goal ?? "",
            expense_annual_goal: partial.expense_annual_goal ?? "",
            community_annual_goal: partial.community_annual_goal ?? "",
            book_annual_goal: partial.book_annual_goal ?? "",
            education_annual_goal: partial.education_annual_goal ?? "",
            education_annual_goal_unit: partial.education_annual_goal_unit ?? "시간",
            other_annual_goal: partial.other_annual_goal ?? "",
            training_plans: trainingPlans,
            education_plans: educationPlans,
            book_plans: bookPlans,
            expense_requests: expenseRequests,
            community_plans: communityPlans,
            other_plans: otherPlans,
          },
        ]);
      }
    } catch (e) {
      console.error("계획서 드래프트 저장 실패:", e);
    }
  };

  // 행 기반 카드용 AI 추천 받기: 기존 행에만 내용 채움
  const AI_ROW_MESSAGE = "만들어진 행에만 내용이 입력되니 먼저 행을 추가하시고 눌러주세요.";
  type PlanCardType = "training" | "expense" | "community" | "book" | "education" | "other";
  const handleAIFillRowsClick = async (cardType: PlanCardType) => {
    const configs: Record<PlanCardType, { rows: unknown[]; setter: (v: unknown[]) => void }> = {
      training: { rows: trainingPlans, setter: setTrainingPlans as (v: unknown[]) => void },
      expense: { rows: expenseRequests, setter: setExpenseRequests as (v: unknown[]) => void },
      community: { rows: communityPlans, setter: setCommunityPlans as (v: unknown[]) => void },
      book: { rows: bookPlans, setter: setBookPlans as (v: unknown[]) => void },
      education: { rows: educationPlans, setter: setEducationPlans as (v: unknown[]) => void },
      other: { rows: otherPlans, setter: setOtherPlans as (v: unknown[]) => void },
    };
    const { rows, setter } = configs[cardType];
    if (!rows || rows.length === 0) {
      alert(AI_ROW_MESSAGE);
      return;
    }
    setAiFillRowsLoading(cardType);
    try {
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "plan_fill_rows",
          cardType,
          count: rows.length,
          developmentGoal: developmentGoal.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "AI 추천을 불러오는데 실패했습니다.");
        return;
      }
      const filled = (data.rows || []) as Record<string, string>[];
      if (filled.length === 0) return;
      const merged = (rows as Record<string, unknown>[]).map((row, i) => {
        const next = filled[i] || {};
        const id = (row as { id?: string }).id ?? String(i);
        return { ...row, ...next, id };
      });
      setter(merged);
    } catch (e) {
      console.error(e);
      alert("AI 추천 중 오류가 발생했습니다.");
    } finally {
      setAiFillRowsLoading(null);
    }
  };

  // AI 추천 버튼 핸들러 (type: 'goal' | 'effect')
  const handleAIRecommend = async (type: "goal" | "effect") => {
    try {
      // 진단 결과가 없으면 경고
      if (!diagnosisSummary) {
        alert("먼저 역량 진단을 완료해주세요.");
        return;
      }

      // 기대효과 추천 시: 위쪽 입력(개발 목표 + 각 계획 테이블) 50% 미만 채워지면 안내 후 중단
      if (type === "effect") {
        let total = 0;
        let filled = 0;
        const count = (value: string) => {
          total += 1;
          if ((value ?? "").trim() !== "") filled += 1;
        };
        count(developmentGoal ?? "");
        trainingPlans.forEach((r) => {
          count(r.name); count(r.period); count(r.duration); count(r.remarks);
        });
        educationPlans.forEach((r) => {
          count(r.area); count(r.period); count(r.duration); count(r.remarks);
        });
        bookPlans.forEach((r) => {
          count(r.title); count(r.period); count(r.method);
        });
        expenseRequests.forEach((r) => {
          count(r.activity); count(r.period); count(r.method); count(r.remarks);
        });
        communityPlans.forEach((r) => {
          count(r.activity); count(r.period); count(r.method); count(r.remarks);
        });
        otherPlans.forEach((r) => count(r.text));
        const fillRatio = total > 0 ? filled / total : 0;
        if (fillRatio < 0.5) {
          setExpectedOutcome("위의 내용들을 좀 더 자세하고 성실하게 입력해 주셔야, AI의 도움을 받을 수 있습니다.");
          return;
        }
      }

      // 로딩 상태 설정
      if (type === "goal") {
        setIsGeneratingGoal(true);
      } else {
        setIsGeneratingOutcome(true);
      }

      // 약점 영역 데이터 가져오기
      const weakDomains = diagnosisSummary.weaknesses || [];

      if (weakDomains.length === 0) {
        alert("약점 영역 데이터가 없습니다.");
        if (type === "goal") {
          setIsGeneratingGoal(false);
        } else {
          setIsGeneratingOutcome(false);
        }
        return;
      }

      // API 호출 (goal: 강점·약점만 / effect: 계획서 입력 내용 포함)
      const strongDomains = diagnosisSummary.strengths || [];
      const payload: Record<string, unknown> = { type, weakDomains, strongDomains };
      if (type === "effect") {
        payload.development_goal = developmentGoal?.trim() ?? "";
        payload.training_plans = trainingPlans;
        payload.education_plans = educationPlans;
        payload.book_plans = bookPlans;
        payload.expense_requests = expenseRequests;
      }
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // 응답 본문 읽기
      let responseData;
      const contentType = res.headers.get("content-type");
      
      if (contentType && contentType.includes("application/json")) {
        try {
          responseData = await res.json();
        } catch (parseError) {
          console.error("JSON 파싱 오류:", parseError);
          const textResponse = await res.text();
          console.error("응답 본문:", textResponse);
          alert(`AI 추천 생성에 실패했습니다. (상태 코드: ${res.status})\n응답을 파싱할 수 없습니다.`);
          return;
        }
      } else {
        const textResponse = await res.text();
        console.error("비 JSON 응답:", textResponse);
        alert(`AI 추천 생성에 실패했습니다. (상태 코드: ${res.status})`);
        return;
      }

      if (!res.ok) {
        const errorMessage = responseData?.error || `AI 추천 생성에 실패했습니다. (상태 코드: ${res.status})`;
        console.error("API 응답 오류:", {
          status: res.status,
          statusText: res.statusText,
          error: responseData,
        });
        alert(errorMessage);
        return;
      }

      const { recommendation } = responseData;

      if (!recommendation || recommendation.trim() === "") {
        console.error("추천 결과가 비어있음:", responseData);
        alert("AI 추천 결과를 받지 못했습니다.");
        return;
      }

      // 결과를 해당 텍스트 입력창에 설정 + 드래프트 저장(API 절감)
      if (type === "goal") {
        setDevelopmentGoal(recommendation.trim());
        setHasUsedAIGoal(true);
        if (typeof window !== "undefined") localStorage.setItem("plan_ai_goal_used", "true");
        if (userEmail) await savePlanDraft(userEmail, userSchool ?? "", { development_goal: recommendation.trim() });
      } else {
        setExpectedOutcome(recommendation.trim());
        setHasUsedAIEffect(true);
        if (typeof window !== "undefined") localStorage.setItem("plan_ai_effect_used", "true");
        if (userEmail) await savePlanDraft(userEmail, userSchool ?? "", { expected_outcome: recommendation.trim() });
      }
    } catch (error: any) {
      console.error("AI 추천 생성 중 오류:", error);
      const errorMessage = error?.message || "알 수 없는 오류";
      alert(`AI 추천 생성 중 오류가 발생했습니다: ${errorMessage}\n\n콘솔을 확인해주세요.`);
    } finally {
      setIsGeneratingGoal(false);
      setIsGeneratingOutcome(false);
    }
  };

  // 계획서 AI 멘토링
  const handleMentoring = async () => {
    if (!diagnosisSummary) {
      alert("진단 결과가 없으면 멘토링을 받을 수 없습니다. 먼저 역량 진단을 완료해 주세요.");
      return;
    }
    try {
      setIsMentoringLoading(true);
      setMentoringFeedback(null);
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "mentor",
          strongDomains: diagnosisSummary.strengths,
          weakDomains: diagnosisSummary.weaknesses,
          development_goal: developmentGoal,
          training_plans: trainingPlans,
          expense_requests: expenseRequests,
          community_plans: communityPlans,
          book_plans: bookPlans,
          education_plans: educationPlans,
          other_plans: otherPlans,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "멘토링 요청에 실패했습니다.");
      }
      const text = (data.recommendation ?? "").trim();
      setMentoringFeedback(text || "피드백을 생성하지 못했습니다.");
    } catch (error: any) {
      console.error("AI 멘토링 오류:", error);
      alert(error?.message || "AI 멘토링 중 오류가 발생했습니다.");
    } finally {
      setIsMentoringLoading(false);
    }
  };

  // 연간 목표량 검증 함수
  const validateAnnualGoals = (): { isValid: boolean; missingItems: string[] } => {
    const missingItems: string[] = [];
    const goals = [
      { key: "training", value: annualGoal.trim(), label: getPlanCategoryLabel("training") },
      { key: "class_open", value: expenseAnnualGoal.trim(), label: getPlanCategoryLabel("class_open") },
      { key: "community", value: communityAnnualGoal.trim(), label: getPlanCategoryLabel("community") },
      { key: "book_edutech", value: bookAnnualGoal.trim(), label: getPlanCategoryLabel("book_edutech") },
      { key: "health", value: educationAnnualGoal.trim(), label: getPlanCategoryLabel("health") },
      { key: "other", value: otherAnnualGoal.trim(), label: getPlanCategoryLabel("other") },
    ];

    goals.forEach((goal) => {
      if (!goal.value) {
        missingItems.push(goal.label);
      }
    });

    return {
      isValid: missingItems.length === 0,
      missingItems,
    };
  };

  // 저장 핸들러
  const handleSave = async () => {
    if (!userEmail || !userSchool) {
      alert("로그인 정보가 올바르지 않습니다.");
      return;
    }

    // 연간 목표량 검증 (저장은 진행하되 경고만 표시)
    const validation = validateAnnualGoals();
    let hasWarning = false;
    let warningMessage = "";

    if (!validation.isValid) {
      hasWarning = true;
      const missingList = validation.missingItems.join(", ");
      warningMessage = `${missingList} 항목 연간목표가 비어있습니다. 계획서 출력이 불가합니다. 추후 기재 바랍니다.`;
    }

    try {
      setIsSaving(true);

      const payload = {
        user_email: userEmail,
        school_name: userSchool,
        development_goal: developmentGoal,
        expected_outcome: expectedOutcome,
        annual_goal: annualGoal,
        expense_annual_goal: expenseAnnualGoal,
        community_annual_goal: communityAnnualGoal,
        book_annual_goal: bookAnnualGoal,
        education_annual_goal: educationAnnualGoal,
        education_annual_goal_unit: schoolCategories.find((c) => c.key === "health")?.unit ?? "시간",
        other_annual_goal: otherAnnualGoal,
        training_plans: trainingPlans,
        education_plans: educationPlans,
        book_plans: bookPlans,
        expense_requests: expenseRequests,
        community_plans: communityPlans,
        other_plans: otherPlans,
      };

      const res = await supabase.from("development_plans").insert([payload]);
      const { data, error } = res;

      if (error) {
        const e = error as unknown as Record<string, unknown>;
        const msg = [e.message, e.error_description, e.details].find((v) => typeof v === "string");
        const extra = [e.code, e.hint].filter((v) => v != null && v !== "").join(" · ");
        const detail = [msg, extra].filter(Boolean).join(" ") || JSON.stringify(error, Object.getOwnPropertyNames(error));
        console.error("Supabase 저장 오류:", detail, "full response:", res);
        alert(`계획서 저장 중 오류가 발생했습니다. Supabase 테이블 설정을 확인해 주세요.\n\n오류: ${detail}`);
        return;
      }

      // 저장 성공 후 경고가 있으면 경고 표시, 없으면 저장 완료 메시지
      const successMessage = hasWarning
        ? `${warningMessage}\n\n계획서는 저장되었습니다. 확인을 누르면 대시보드로 이동합니다.`
        : "계획서가 저장되었습니다.\n\n확인을 누르면 대시보드로 이동합니다.";

      if (confirm(successMessage)) {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error(error);
      alert("계획서 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">사용자 정보를 확인하는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white px-4 py-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 text-left">
        <CardPageHeader
          icon={<ClipboardList className="h-6 w-6" />}
          title="자기역량 개발계획서 작성"
          subtitle="연간 역량 개발 목표와 실천 계획을 세우고 기록합니다."
        />

        {/* 역량 진단 요약: 강점·개발우선·레이더 한 덩어리 */}
        <div className="space-y-4">
          {diagnosisSummary ? (
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-md">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-7 w-7 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-800">
                  [참고] 나의 역량 진단 결과는? ({diagnosisSummary.createdAt} 시행)
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 강점 영역 */}
                <div className="rounded-xl border-l-2 border-l-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <div className="rounded-full bg-blue-500 p-1">
                    <Target className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-blue-700">
                    강점 영역 (상위 3)
                  </h3>
                </div>
                <div className="space-y-1">
                  {diagnosisSummary.strengths.map((strength, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 shadow-sm"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-[13px] font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="text-[15px] leading-tight" style={{ color: "#1d4ed8", fontWeight: 700 }}>
                        {strength}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

                {/* 개발 우선 영역 */}
                <div className="rounded-xl border-l-2 border-l-orange-500 bg-gradient-to-br from-orange-50 to-red-50 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <div className="rounded-full bg-orange-500 p-1">
                    <Target className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-orange-700">
                    개발 우선 영역 (하위 3)
                  </h3>
                </div>
                <div className="space-y-1">
                  {diagnosisSummary.weaknesses.map((weakness, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 shadow-sm"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-[13px] font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="text-[15px] leading-tight" style={{ color: "#c2410c", fontWeight: 700 }}>
                        {weakness}
                      </span>
                    </div>
                  ))}
                </div>
                </div>

                {/* 방사형 그래프 */}
                <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-1 flex items-center justify-center">
                <div className="h-44 w-full">
                  {(() => {
                    const radarData = [
                      { name: "수업 설계·운영", score: diagnosisSummary.domain1 },
                      { name: "학생 이해·생활지도", score: diagnosisSummary.domain2 },
                      { name: "평가·피드백", score: diagnosisSummary.domain3 },
                      { name: "학급경영·안전", score: diagnosisSummary.domain4 },
                      { name: "전문성 개발·성찰", score: diagnosisSummary.domain5 },
                      { name: "소통·협력 및 포용", score: diagnosisSummary.domain6 },
                    ];
                    const sorted = [...radarData].sort((a, b) => b.score - a.score);
                    const strengthNames = new Set(sorted.slice(0, 3).map((d) => d.name));
                    const weaknessNames = new Set(sorted.slice(-3).map((d) => d.name));
                    return (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart outerRadius="64%" data={radarData}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis
                        dataKey="name"
                        tick={(props) => {
                          const p = props as { x?: number; y?: number; cx?: number; cy?: number; payload?: { value?: string } };
                          const { x, y, cx, cy, payload } = p;
                          const pushOut = 1.25;
                          const numX = typeof x === "number" ? x : 0;
                          const numY = typeof y === "number" ? y : 0;
                          const dx = numX - (cx ?? numX);
                          const dy = numY - (cy ?? numY);
                          const outX = (cx ?? numX) + dx * pushOut;
                          const outY = (cy ?? numY) + dy * pushOut;
                          const name = payload?.value ?? "";
                          const isStrength = strengthNames.has(name);
                          const isWeakness = weaknessNames.has(name);
                          const color = isStrength ? "#1d4ed8" : isWeakness ? "#c2410c" : "#6b7280";
                          return (
                            <g transform={`translate(${outX}, ${outY})`}>
                              <foreignObject
                                x={-48}
                                y={-8}
                                width={96}
                                height={20}
                                style={{ overflow: "visible" }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    color,
                                    fontWeight: 700,
                                    textAlign: "center",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {name}
                                </div>
                              </foreignObject>
                            </g>
                          );
                        }}
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
                    );
                  })()}
                </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-slate-600" />
                <h2 className="text-sm font-semibold text-slate-800">■ 역량 진단 요약</h2>
              </div>
              <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
                <div className="space-y-1 text-xs text-slate-500">
                  <p>아직 진단을 완료하지 않으셨습니다.</p>
                <p>
                  먼저{" "}
                  <a
                    href="/diagnosis"
                    className="text-blue-600 hover:underline"
                  >
                    역량 진단
                  </a>
                  을 완료해 주세요.
                </p>
              </div>
            </Card>
            </>
          )}
        </div>

        {/* 자기역량 개발목표 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="relative">
            <div className="mb-0 flex items-center gap-2">
              <Target className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                자기역량 개발목표
              </h2>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAIRecommend("goal")}
              disabled={isGeneratingGoal}
              className="absolute right-0 top-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
            >
              <Sparkles className={`mr-1 h-3 w-3 ${isGeneratingGoal ? "animate-spin" : ""}`} />
              {isGeneratingGoal ? "추천 생성 중..." : developmentGoal.trim() ? "AI 추천 다시 받기" : "AI 추천 받기"}
            </Button>
            <Textarea
              placeholder="예: AI 활용 역량을 강화하여..."
              value={developmentGoal}
              onChange={(e) => setDevelopmentGoal(e.target.value)}
              className="mt-2 min-h-[80px] rounded-xl text-sm leading-snug border-slate-200"
            />
          </div>
        </Card>

        {/* 연수(직무, 자율) 계획 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                {getPlanCategoryLabel("training")} 계획
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="annual-goal" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  나의 연간 목표
                </Label>
                <Input
                  id="annual-goal"
                  value={annualGoal}
                  onChange={(e) => setAnnualGoal(e.target.value)}
                  placeholder="연간 목표"
                  className="w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("training")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("training")}
                disabled={aiFillRowsLoading !== null}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading === "training" ? "animate-spin" : ""}`} />
                {aiFillRowsLoading === "training" ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTrainingDragEnd}>
            <SortableContext items={trainingPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>직무 / 자율 연수명</div>
                  <div>시기</div>
                  <div>기간(시간)</div>
                  <div>비고</div>
                  <div></div>
                </div>
                {trainingPlans.map((row, idx) => (
                  <SortableTrainingRow key={row.id} row={row} idx={idx} trainingPlans={trainingPlans} setTrainingPlans={setTrainingPlans} removeTrainingRow={removeTrainingRow} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={addTrainingRow}
            className="text-sm text-blue-600 hover:underline mt-2 block text-left"
          >
            + 행 추가
          </button>
        </Card>

        {/* 수업 공개 계획 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Presentation className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                {getPlanCategoryLabel("class_open")} 계획
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="expense-annual-goal" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  나의 연간 목표
                </Label>
                <Input
                  id="expense-annual-goal"
                  value={expenseAnnualGoal}
                  onChange={(e) => setExpenseAnnualGoal(e.target.value)}
                  placeholder="연간 목표"
                  className="w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("class_open")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("expense")}
                disabled={aiFillRowsLoading !== null}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading === "expense" ? "animate-spin" : ""}`} />
                {aiFillRowsLoading === "expense" ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleExpenseDragEnd}>
            <SortableContext items={expenseRequests.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기</div>
                  <div>방법</div>
                  <div>비고</div>
                  <div></div>
                </div>
                {expenseRequests.map((row, idx) => (
                  <SortableExpenseRow key={row.id} row={row} idx={idx} expenseRequests={expenseRequests} setExpenseRequests={setExpenseRequests} removeExpenseRow={removeExpenseRow} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={addExpenseRow}
            className="text-sm text-blue-600 hover:underline mt-2 block text-left"
          >
            + 행 추가
          </button>
        </Card>

        {/* 교원학습 공동체 활동 계획 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                {getPlanCategoryLabel("community")} 계획
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="community-annual-goal" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  나의 연간 목표
                </Label>
                <Input
                  id="community-annual-goal"
                  value={communityAnnualGoal}
                  onChange={(e) => setCommunityAnnualGoal(e.target.value)}
                  placeholder="연간 목표"
                  className="w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("community")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("community")}
                disabled={aiFillRowsLoading !== null}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading === "community" ? "animate-spin" : ""}`} />
                {aiFillRowsLoading === "community" ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCommunityDragEnd}>
            <SortableContext items={communityPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기</div>
                  <div>방법</div>
                  <div>비고</div>
                  <div></div>
                </div>
                {communityPlans.map((row, idx) => (
                  <SortableCommunityRow key={row.id} row={row} idx={idx} communityPlans={communityPlans} setCommunityPlans={setCommunityPlans} removeCommunityRow={removeCommunityRow} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={addCommunityRow}
            className="text-sm text-blue-600 hover:underline mt-2 block text-left"
          >
            + 행 추가
          </button>
        </Card>

        {/* 전문 서적 / 에듀테크 등 구입 활용 계획 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                {getPlanCategoryLabel("book_edutech")} 계획
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="book-annual-goal" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  나의 연간 목표
                </Label>
                <Input
                  id="book-annual-goal"
                  value={bookAnnualGoal}
                  onChange={(e) => setBookAnnualGoal(e.target.value)}
                  placeholder="연간 목표"
                  className="w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("book_edutech")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("book")}
                disabled={aiFillRowsLoading !== null}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading === "book" ? "animate-spin" : ""}`} />
                {aiFillRowsLoading === "book" ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBookDragEnd}>
            <SortableContext items={bookPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>서적/도구명</div>
                  <div>시기</div>
                  <div>활용방법</div>
                  <div></div>
                </div>
                {bookPlans.map((row, idx) => (
                  <SortableBookRow key={row.id} row={row} idx={idx} bookPlans={bookPlans} setBookPlans={setBookPlans} removeBookRow={removeBookRow} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={addBookRow}
            className="text-sm text-blue-600 hover:underline mt-2 block text-left"
          >
            + 행 추가
          </button>
        </Card>

        {/* 건강/체력 향상 계획 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                {getPlanCategoryLabel("health")} 향상 계획
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="education-annual-goal" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  나의 연간 목표
                </Label>
                <Input
                  id="education-annual-goal"
                  value={educationAnnualGoal}
                  onChange={(e) => setEducationAnnualGoal(e.target.value)}
                  placeholder="연간 목표"
                  className="w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">
                  {getPlanCategoryUnit("health")}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("education")}
                disabled={aiFillRowsLoading !== null}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading === "education" ? "animate-spin" : ""}`} />
                {aiFillRowsLoading === "education" ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEducationDragEnd}>
            <SortableContext items={educationPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기</div>
                  <div>기간</div>
                  <div>비고</div>
                  <div></div>
                </div>
                {educationPlans.map((row, idx) => (
                  <SortableEducationRow key={row.id} row={row} idx={idx} educationPlans={educationPlans} setEducationPlans={setEducationPlans} removeEducationRow={removeEducationRow} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={addEducationRow}
            className="text-sm text-blue-600 hover:underline mt-2 block text-left"
          >
            + 행 추가
          </button>
        </Card>

        {/* 기타 계획 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                {getPlanCategoryLabel("other")} 계획
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="other-annual-goal" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  나의 연간 목표
                </Label>
                <Input
                  id="other-annual-goal"
                  value={otherAnnualGoal}
                  onChange={(e) => setOtherAnnualGoal(e.target.value)}
                  placeholder="연간 목표"
                  className="w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("other")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("other")}
                disabled={aiFillRowsLoading !== null}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading === "other" ? "animate-spin" : ""}`} />
                {aiFillRowsLoading === "other" ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleOtherDragEnd}>
            <SortableContext items={otherPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                {otherPlans.map((row, idx) => (
                  <SortableOtherRow key={row.id} row={row} idx={idx} otherPlans={otherPlans} setOtherPlans={setOtherPlans} removeOtherRow={removeOtherRow} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={addOtherRow}
            className="text-sm text-blue-600 hover:underline mt-2 block text-left"
          >
            + 행 추가
          </button>
        </Card>

        {/* 기대 효과 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="relative">
            <div className="mb-0 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                기대 효과
              </h2>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAIRecommend("effect")}
              disabled={isGeneratingOutcome}
              className="absolute right-0 top-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
            >
              <Sparkles className={`mr-1 h-3 w-3 ${isGeneratingOutcome ? "animate-spin" : ""}`} />
              {isGeneratingOutcome ? "추천 생성 중..." : expectedOutcome.trim() ? "AI 추천 다시 받기" : "AI 추천 받기"}
            </Button>
            <Textarea
              placeholder="예: 이를 통해 나는 디지털 도구를 능숙하게..."
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              className="mt-2 min-h-[80px] rounded-xl border-slate-200 text-sm leading-snug"
            />
          </div>
        </Card>

        {/* 계획서 AI 멘토 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <MessageCircle className="h-5 w-5 shrink-0 text-slate-600" />
              <p className="text-sm text-slate-700">
                부족한 항목들을 잘 보완할 수 있는지 작성한 내용을 검토하는 AI 멘토입니다.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMentoring}
              disabled={isMentoringLoading}
              className="shrink-0 rounded-full border-violet-300 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-700 hover:from-violet-100 hover:to-indigo-100 disabled:opacity-50"
            >
              {isMentoringLoading ? "멘토링 생성 중..." : "계획서 AI 멘토링"}
            </Button>
          </div>
          {mentoringFeedback && (
            <div className="mt-4 rounded-xl border border-violet-200/80 bg-violet-50/50 px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {mentoringFeedback}
            </div>
          )}
        </Card>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/dashboard")}
            className="rounded-full border-slate-300 bg-white"
          >
            취소/돌아가기
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white shadow-md hover:shadow-lg hover:opacity-95 disabled:opacity-70"
          >
            {isSaving ? "저장 중..." : "저장하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
