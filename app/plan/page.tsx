"use client";

import { useEffect, useRef, useState } from "react";
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
import { DEFAULT_DIAGNOSIS_DOMAINS } from "@/lib/diagnosisQuestions";
import type { DiagnosisSurvey } from "@/lib/diagnosisSurvey";
import { computeSubDomainScores } from "@/lib/diagnosisSurvey";
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
import dynamic from "next/dynamic";

const DashboardDiagnosisRadar = dynamic(
  () => import("@/components/charts/DashboardDiagnosisRadar"),
  { ssr: false }
);

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
  remarks: string;
};

type ExpenseRequestRow = {
  id: string;
  activity: string; // 내용
  period: string; // 시기 및 방법 (예: 3월, 학부모 참관)
  method: string; // 과거 호환용 (사용 안 함)
  remarks: string; // 기대효과
};

type CommunityPlanRow = {
  id: string;
  activity: string; // 내용
  period: string; // 시기 및 방법
  method: string; // 과거 호환용 (사용 안 함)
  remarks: string; // 기대효과
};

type OtherPlanRow = {
  id: string;
  content: string; // 내용
  period: string; // 시기 및 방법
  method: string; // 과거 호환용 (사용 안 함)
  remarks: string; // 기대효과
};

const DEFAULT_EXPENSE_REQUESTS: ExpenseRequestRow[] = [
  {
    id: "1",
    activity: "학부모 공개 수업",
    period: "3월, 학부모 전체 참관",
    method: "",
    remarks: "학교설명회 연계",
  },
  {
    id: "2",
    activity: "동료 공개 수업",
    period: "9월, 동료 교사 수업 참관",
    method: "",
    remarks: "자율장학 연계",
  },
];

function getDefaultExpenseRequestsWithEmptyRow(): ExpenseRequestRow[] {
  const base = [...DEFAULT_EXPENSE_REQUESTS].map((r, i) => ({ ...r, id: String(Date.now() + i) }));
  return base.concat([{ id: String(Date.now() + 2), activity: "", period: "", method: "", remarks: "" }]);
}

// 기존 other_plans { id, text } → { id, content, period, method, remarks } 호환
function normalizeOtherPlanRow(row: { id: string; text?: string; content?: string; period?: string; method?: string; remarks?: string }): OtherPlanRow {
  return {
    id: row.id,
    content: (row.content ?? row.text ?? "").trim(),
    period: (row.period ?? "").trim(),
    method: (row.method ?? "").trim(),
    remarks: (row.remarks ?? "").trim(),
  };
}

// Sortable Row 컴포넌트들
function SortableTrainingRow({
  row,
  idx,
  trainingPlans,
  setTrainingPlans,
  removeTrainingRow,
  placeholders,
}: {
  row: TrainingPlanRow;
  idx: number;
  trainingPlans: TrainingPlanRow[];
  setTrainingPlans: (plans: TrainingPlanRow[]) => void;
  removeTrainingRow: (id: string) => void;
  placeholders?: { content: string; period: string; method: string; remarks: string };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const ph = placeholders ?? { content: "예: 내용", period: "예: 4월, 온라인 15시간", method: "예: 방법", remarks: "예: 기대효과" };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left"
    >
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
        placeholder={idx === 0 ? ph.content : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...trainingPlans];
          updated[idx].period = e.target.value;
          setTrainingPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.period : ""}
      />
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...trainingPlans];
          updated[idx].remarks = e.target.value;
          setTrainingPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.remarks : ""}
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
  placeholders,
}: {
  row: ExpenseRequestRow;
  idx: number;
  expenseRequests: ExpenseRequestRow[];
  setExpenseRequests: (requests: ExpenseRequestRow[]) => void;
  removeExpenseRow: (id: string) => void;
  placeholders?: { content: string; period: string; method: string; remarks: string };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const ph = placeholders ?? { content: "예: 내용", period: "예: 3월, 학부모 참관", method: "예: 방법", remarks: "예: 기대효과" };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left"
    >
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
        placeholder={idx === 0 ? ph.content : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...expenseRequests];
          updated[idx].period = e.target.value;
          setExpenseRequests(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.period : ""}
      />
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...expenseRequests];
          updated[idx].remarks = e.target.value;
          setExpenseRequests(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.remarks : ""}
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
  placeholders,
}: {
  row: CommunityPlanRow;
  idx: number;
  communityPlans: CommunityPlanRow[];
  setCommunityPlans: (plans: CommunityPlanRow[]) => void;
  removeCommunityRow: (id: string) => void;
  placeholders?: { content: string; period: string; method: string; remarks: string };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const ph = placeholders ?? { content: "예: 내용", period: "예: 4월, 월 1회 모임", method: "예: 방법", remarks: "예: 기대효과" };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left"
    >
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
        placeholder={idx === 0 ? ph.content : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...communityPlans];
          updated[idx].period = e.target.value;
          setCommunityPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.period : ""}
      />
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...communityPlans];
          updated[idx].remarks = e.target.value;
          setCommunityPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.remarks : ""}
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
  placeholders,
}: {
  row: BookPlanRow;
  idx: number;
  bookPlans: BookPlanRow[];
  setBookPlans: (plans: BookPlanRow[]) => void;
  removeBookRow: (id: string) => void;
  placeholders?: { content: string; period: string; method: string; remarks: string };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const ph = placeholders ?? { content: "예: 내용", period: "예: 6월, 독서 후 수업 적용", method: "예: 방법", remarks: "예: 기대효과" };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left"
    >
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
        placeholder={idx === 0 ? ph.content : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...bookPlans];
          updated[idx].period = e.target.value;
          setBookPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.period : ""}
      />
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...bookPlans];
          updated[idx].remarks = e.target.value;
          setBookPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.remarks : ""}
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
  placeholders,
}: {
  row: EducationPlanRow;
  idx: number;
  educationPlans: EducationPlanRow[];
  setEducationPlans: (plans: EducationPlanRow[]) => void;
  removeEducationRow: (id: string) => void;
  placeholders?: { content: string; period: string; method: string; remarks: string };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const ph = placeholders ?? { content: "예: 내용", period: "예: 5월", method: "예: 방법", remarks: "비고" };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left"
    >
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
        placeholder={idx === 0 ? ph.content : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...educationPlans];
          updated[idx].period = e.target.value;
          setEducationPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.period : ""}
      />
      {/* duration 필드는 더 이상 별도 입력칸으로 사용하지 않음 */}
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...educationPlans];
          updated[idx].remarks = e.target.value;
          setEducationPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.remarks : ""}
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
  placeholders,
}: {
  row: OtherPlanRow;
  idx: number;
  otherPlans: OtherPlanRow[];
  setOtherPlans: (plans: OtherPlanRow[]) => void;
  removeOtherRow: (id: string) => void;
  placeholders?: { content: string; period: string; method: string; remarks: string };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const ph = placeholders ?? { content: "예: 내용", period: "예: 3월", method: "예: 방법", remarks: "비고" };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full items-center rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-left"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
        <GripVertical className="h-4 w-4" />
      </div>
      <Input
        value={row.content}
        onChange={(e) => {
          const updated = [...otherPlans];
          updated[idx].content = e.target.value;
          setOtherPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.content : ""}
      />
      <Input
        value={row.period}
        onChange={(e) => {
          const updated = [...otherPlans];
          updated[idx].period = e.target.value;
          setOtherPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.period : ""}
      />
      {/* method 필드는 더 이상 별도 입력칸으로 사용하지 않음 */}
      <Input
        value={row.remarks}
        onChange={(e) => {
          const updated = [...otherPlans];
          updated[idx].remarks = e.target.value;
          setOtherPlans(updated);
        }}
        className="rounded text-xs w-full h-8 py-1 text-left"
        placeholder={idx === 0 ? ph.remarks : ""}
      />
      <div className="flex justify-center">
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
  const [aiFillRowsLoading, setAiFillRowsLoading] = useState<{
    training: boolean;
    expense: boolean;
    community: boolean;
    book: boolean;
    education: boolean;
    other: boolean;
  }>({
    training: false,
    expense: false,
    community: false,
    book: false,
    education: false,
    other: false,
  });
  const [hasUsedAIGoal, setHasUsedAIGoal] = useState(false);
  const [hasUsedAIEffect, setHasUsedAIEffect] = useState(false);
  const [diagnosisSummary, setDiagnosisSummary] = useState<{
    strengths: string[];
    weaknesses: string[];
    strengthsDetail: { label: string; domainKey: string; avg: number; subDomains: { name: string; avg: number }[] }[];
    weaknessesDetail: { label: string; domainKey: string; avg: number; subDomains: { name: string; avg: number }[] }[];
    domain1: number;
    domain2: number;
    domain3: number;
    domain4: number;
    domain5: number;
    domain6: number;
    createdAt: string;
    labels: string[];
  } | null>(null);
  const [schoolCategories, setSchoolCategories] = useState<{ key: string; label: string; unit: string }[]>([]);
  const [missingAnnualGoalKeys, setMissingAnnualGoalKeys] = useState<string[]>([]);

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
  const [bookPlans, setBookPlans] = useState<BookPlanRow[]>([{ id: "1", title: "", period: "", method: "", remarks: "" }]);
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequestRow[]>([
    { id: "1", activity: "", period: "", method: "", remarks: "" },
  ]);
  const [communityPlans, setCommunityPlans] = useState<CommunityPlanRow[]>([
    { id: "1", activity: "", period: "", method: "", remarks: "" },
  ]);
  const [otherPlans, setOtherPlans] = useState<OtherPlanRow[]>([
    { id: "1", content: "", period: "", method: "", remarks: "" },
  ]);
  const [mentoringFeedback, setMentoringFeedback] = useState<string | null>(null);
  const [isMentoringLoading, setIsMentoringLoading] = useState(false);
  const sessionTokenRef = useRef<string | null>(null);

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
      sessionTokenRef.current = session?.access_token ?? null;
      const token = session?.access_token ?? null;

      // 병렬 로드: 카테고리 설정 + 진단(결과·역량명) + 계획서 한 번에
      const email = user.email;
      if (email && token) {
        try {
          const [catRes, preRes, diagnosisSettingsRes, planRes] = await Promise.all([
            fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
            supabase.from("diagnosis_results").select("domain1,domain2,domain3,domain4,domain5,domain6,created_at,raw_answers,category_scores").eq("user_email", email).order("created_at", { ascending: false }).limit(1).maybeSingle(),
            fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
            supabase.from("development_plans").select("*").eq("user_email", email).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          ]);

          const catJson = catRes as { categories?: { key: string; label: string; unit: string }[] };
          if (Array.isArray(catJson.categories)) setSchoolCategories(catJson.categories);

          const data = preRes.data;
          const diagSettings = diagnosisSettingsRes as { domains?: { name?: string }[] };
          const domainCount = Math.min(6, Math.max(2, Array.isArray(diagSettings?.domains) ? diagSettings.domains.length : 6));
          const labels: string[] =
            Array.isArray(diagSettings?.domains) && diagSettings.domains.length >= 2 && diagSettings.domains.length <= 6
              ? diagSettings.domains.map((d, i) => (d?.name ?? "").trim() || (DEFAULT_DIAGNOSIS_DOMAINS[i]?.name ?? ""))
              : DEFAULT_DIAGNOSIS_DOMAINS.map((d) => d.name);
          if (!preRes.error && data) {
            const cat = data.category_scores as Record<string, { count?: number }> | undefined;
            const getCount = (key: string) => (cat?.[key]?.count ?? 5);
            const avg = (key: string, val: number) => val / (getCount(key) || 1);
            const d1 = avg("domain1", (data.domain1 as number) ?? 0);
            const d2 = avg("domain2", (data.domain2 as number) ?? 0);
            const d3 = avg("domain3", (data.domain3 as number) ?? 0);
            const d4 = avg("domain4", (data.domain4 as number) ?? 0);
            const d5 = domainCount >= 5 ? avg("domain5", (data.domain5 as number) ?? 0) : 0;
            const d6 = domainCount >= 6 ? avg("domain6", (data.domain6 as number) ?? 0) : 0;
            const domainKeys = ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const;
            const domainAverages = [
              { label: labels[0], avg: d1, domainKey: domainKeys[0] },
              { label: labels[1], avg: d2, domainKey: domainKeys[1] },
              { label: labels[2], avg: d3, domainKey: domainKeys[2] },
              { label: labels[3], avg: d4, domainKey: domainKeys[3] },
              ...(domainCount >= 5 ? [{ label: labels[4], avg: d5, domainKey: domainKeys[4] }] : []),
              ...(domainCount >= 6 ? [{ label: labels[5], avg: d6, domainKey: domainKeys[5] }] : []),
            ];
            const sorted = [...domainAverages].sort((a, b) => b.avg - a.avg);
            const strengthN = Math.ceil(domainCount / 2);
            const weaknessN = domainCount - strengthN;
            const strengths = sorted.slice(0, strengthN).map((x) => x.label);
            const weaknesses = sorted.slice(-weaknessN).map((x) => x.label);

            const survey = (diagSettings as { useSurvey?: boolean; survey?: DiagnosisSurvey })?.survey;
            const rawFromDb = (data.raw_answers ?? {}) as Record<string, unknown>;
            const rawAnswers: Record<string, number> = {};
            for (const [k, v] of Object.entries(rawFromDb)) {
              if (k === "_schema") continue;
              const num = typeof v === "number" ? v : Number(v);
              if (Number.isFinite(num) && num >= 1 && num <= 5) rawAnswers[String(k)] = num;
            }
            const subByDomain =
              survey?.domains?.length && Array.isArray(survey.questions) && survey.questions.length > 0
                ? computeSubDomainScores(survey, rawAnswers)
                : null;
            const strengthsDetail = sorted.slice(0, strengthN).map((x) => ({
              label: x.label,
              domainKey: x.domainKey,
              avg: x.avg,
              subDomains: subByDomain?.[x.domainKey]
                ? [...subByDomain[x.domainKey]].sort((a, b) => b.avg - a.avg)
                : [],
            }));
            const weaknessesDetail = [...sorted.slice(-weaknessN)].reverse().map((x) => ({
              label: x.label,
              domainKey: x.domainKey,
              avg: x.avg,
              subDomains: subByDomain?.[x.domainKey]
                ? [...subByDomain[x.domainKey]].sort((a, b) => a.avg - b.avg)
                : [],
            }));

            const date = new Date(data.created_at as string);
            const formattedDate = `${String(date.getFullYear()).slice(-2)}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
            setDiagnosisSummary({
              strengths,
              weaknesses,
              strengthsDetail,
              weaknessesDetail,
              domain1: d1,
              domain2: d2,
              domain3: d3,
              domain4: d4,
              domain5: d5,
              domain6: d6,
              createdAt: formattedDate,
              labels,
            });
          }

          const planData = planRes.data;
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
            const bp = planData.book_plans as (BookPlanRow & { remarks?: string })[] | null;
            if (Array.isArray(bp) && bp.length > 0) setBookPlans(bp.map((r) => ({ id: r.id, title: r.title ?? "", period: r.period ?? "", method: r.method ?? "", remarks: r.remarks ?? "" })));
            const er = planData.expense_requests as (ExpenseRequestRow & { amount?: string })[] | null;
            const hasRealContent = Array.isArray(er) && er.some((r) => (r.activity ?? "").trim() !== "" || (r.method ?? "").trim() !== "");
            if (hasRealContent && Array.isArray(er) && er.length > 0) {
              setExpenseRequests(er.map(({ id, activity, period, method, remarks }) => ({ id, activity: activity ?? "", period: period ?? "", method: method ?? "", remarks: remarks ?? "" })));
            } else {
              setExpenseRequests(getDefaultExpenseRequestsWithEmptyRow());
            }
            const cp = planData.community_plans as CommunityPlanRow[] | null;
            if (Array.isArray(cp) && cp.length > 0) setCommunityPlans(cp);
            const op = planData.other_plans as (OtherPlanRow | { id: string; text?: string })[] | null;
            if (Array.isArray(op) && op.length > 0) setOtherPlans(op.map(normalizeOtherPlanRow));
          }

          // 연간 목표 미기재 표시(빨간 외곽선) 복원: 저장된 계획서 값 + 이전 저장 시 경고 기록(localStorage) 병합
          const missingFromPlan = computeMissingAnnualGoals({
            training: String((planData as any)?.annual_goal ?? ""),
            class_open: String((planData as any)?.expense_annual_goal ?? ""),
            community: String((planData as any)?.community_annual_goal ?? ""),
            book_edutech: String((planData as any)?.book_annual_goal ?? ""),
            health: String((planData as any)?.education_annual_goal ?? ""),
            other: String((planData as any)?.other_annual_goal ?? ""),
          });
          let missingFromStorage: string[] = [];
          if (typeof window !== "undefined") {
            try {
              const raw = localStorage.getItem(missingAnnualGoalsStorageKey(email));
              missingFromStorage = raw ? (JSON.parse(raw) as string[]).filter((x) => typeof x === "string") : [];
            } catch {
              missingFromStorage = [];
            }
          }
          const mergedMissing = Array.from(new Set([...missingFromStorage, ...missingFromPlan]));
          setMissingAnnualGoalKeys(mergedMissing);
          persistMissingAnnualGoals(email, mergedMissing);
        } catch (e) {
          console.error("Error loading plan/diagnosis:", e);
        }
      }

      if (typeof window !== "undefined") {
        setHasUsedAIGoal(localStorage.getItem("plan_ai_goal_used") === "true");
        setHasUsedAIEffect(localStorage.getItem("plan_ai_effect_used") === "true");
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
      { id: Date.now().toString(), title: "", period: "", method: "", remarks: "" },
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
    setOtherPlans([...otherPlans, { id: Date.now().toString(), content: "", period: "", method: "", remarks: "" }]);
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

  /** 학교에서 설정한 영역명(label)에 맞는 예시 문구 반환. 라벨 우선 매칭 후 키 기본값 사용 */
  const getPlaceholdersForCategory = (key: string, label: string): { content: string; period: string; method: string; remarks: string } => {
    const L = (label ?? "").trim();
    // 전문성계발Ⅰ(지원단, 연구대회, 교육청 등) → 지원단/연구대회/교육청 예시
    if (/지원단|연구대회|교육청|공식\s*활동|전문성\s*계발\s*[ⅠI]|전문성계발\s*[ⅠI]/.test(L))
      return { content: "예: 지원단 활동", period: "예: 3월", method: "예: 연구대회 참가", remarks: "예: 교육청 공식 활동" };
    // 전문성계발Ⅱ(대학원, 연구회 등) → 대학원/논문 예시
    if (/대학원|석사|박사|논문|전문성\s*계발\s*[ⅡII]|전문성계발\s*[ⅡII]/.test(L))
      return { content: "예: 대학원 졸업", period: "예: 3월", method: "예: 논문 작성", remarks: "예: 석사 과정" };
    if (/\b연구회\b/.test(L))
      return { content: "예: 연구회 활동", period: "예: 4월", method: "예: 월 1회 모임", remarks: "예: 학회 발표" };
    // 건강/체력 (공백 포함 가능)
    if (/건강|체력|운동|등산|달리기|수영|헬스/.test(L))
      return { content: "예: 걷기·조깅 등 유산소 운동", period: "예: 3~7월, 주 3회", method: "예: 30분 이상 실천", remarks: "예: 체력 향상 및 스트레스 해소(기대효과)" };
    // 나머지는 키별 기본 예시
    const defaults: Record<string, { content: string; period: string; method: string; remarks: string }> = {
      // 직무연수 계획: 학생 상담·학습 지원 중심 예시
      training: {
        content: "예: 학생 상담 및 학습코칭 역량 강화를 위한 연수",
        period: "예: 4월, 온라인 직무연수 15시간",
        method: "예: 사례 중심 강의 및 실습",
        remarks: "예: 학급 학생 상담·학습 지원 역량 향상(기대효과)",
      },
      // 수업 공개: 학부모·동료 공개수업 기본 예시
      class_open: {
        content: "예: 학부모 공개 수업",
        period: "예: 3월, 학부모 전체 참관",
        method: "예: 학부모 대상 안내자료 제공",
        remarks: "예: 학교설명회 연계 및 수업 신뢰도 향상(기대효과)",
      },
      community: {
        content: "예: 수업 나눔 동아리",
        period: "예: 4월, 월 1회 모임",
        method: "예: 수업 사례 공유 및 피드백",
        remarks: "예: 수업 전문성 공동 성장(기대효과)",
      },
      book_edutech: {
        content: "예: 교육서적·에듀테크 활용 독서",
        period: "예: 6월, 독서 후 수업 적용",
        method: "예: 핵심 내용 정리 후 수업에 적용",
        remarks: "예: 학생 참여 중심 수업 설계 역량 향상(기대효과)",
      },
      health: {
        content: "예: 걷기·조깅 등 유산소 운동",
        period: "예: 3~7월, 주 3회",
        method: "예: 30분 이상 실천",
        remarks: "예: 체력 향상 및 스트레스 해소(기대효과)",
      },
      other: {
        content: "예: 교육청 연계 기타 활동",
        period: "예: 3월", method: "예: 컨설팅·워크숍 참여",
        remarks: "예: 학교 교육과정 운영 내실화(기대효과)",
      },
    };
    return defaults[key] ?? { content: "예: 내용", period: "예: 월", method: "예: 방법", remarks: "비고" };
  };

  // 학교에서 설정한 카드명이 "수업 공개" 계열일 때만 기본 예시 2개(학부모/동료 공개수업)를 자동 채움
  useEffect(() => {
    if (!schoolCategories.length) return;
    const label = getPlanCategoryLabel("class_open");
    const L = (label ?? "").trim();
    if (!L) return;
    const isClassOpenCategory = /수업\s*공개|공개\s*수업|공개수업|open\s*class/i.test(L);
    if (!isClassOpenCategory) return;
    // 이미 사용자가 내용을 입력한 경우에는 건드리지 않음
    const hasUserData = expenseRequests.some(
      (r) => (r.activity ?? "").trim() !== "" || (r.period ?? "").trim() !== "" || (r.remarks ?? "").trim() !== ""
    );
    if (hasUserData) return;
    const now = Date.now();
    setExpenseRequests([
      { ...DEFAULT_EXPENSE_REQUESTS[0], id: String(now) },
      { ...DEFAULT_EXPENSE_REQUESTS[1], id: String(now + 1) },
      { id: String(now + 2), activity: "", period: "", method: "", remarks: "" },
    ]);
  }, [schoolCategories, expenseRequests]);

  const missingAnnualGoalsStorageKey = (email: string) => `teacher_mate_plan_missing_annual_goals_${email.toLowerCase()}`;
  const computeMissingAnnualGoals = (values: {
    training: string;
    class_open: string;
    community: string;
    book_edutech: string;
    health: string;
    other: string;
  }) => {
    const missing: string[] = [];
    if (!values.training.trim()) missing.push("training");
    if (!values.class_open.trim()) missing.push("class_open");
    if (!values.community.trim()) missing.push("community");
    if (!values.book_edutech.trim()) missing.push("book_edutech");
    if (!values.health.trim()) missing.push("health");
    if (!values.other.trim()) missing.push("other");
    return missing;
  };
  const persistMissingAnnualGoals = (email: string, keys: string[]) => {
    if (typeof window === "undefined") return;
    try {
      if (!keys.length) localStorage.removeItem(missingAnnualGoalsStorageKey(email));
      else localStorage.setItem(missingAnnualGoalsStorageKey(email), JSON.stringify(keys));
    } catch {
      // ignore
    }
  };

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
    setAiFillRowsLoading((prev) => ({ ...prev, [cardType]: true }));
    try {
      const categoryByCard: Record<PlanCardType, { key: string; label: string; unit: string }> = {
        training: { key: "training", label: getPlanCategoryLabel("training"), unit: getPlanCategoryUnit("training") },
        expense: { key: "class_open", label: getPlanCategoryLabel("class_open"), unit: getPlanCategoryUnit("class_open") },
        community: { key: "community", label: getPlanCategoryLabel("community"), unit: getPlanCategoryUnit("community") },
        book: { key: "book_edutech", label: getPlanCategoryLabel("book_edutech"), unit: getPlanCategoryUnit("book_edutech") },
        education: { key: "health", label: getPlanCategoryLabel("health"), unit: getPlanCategoryUnit("health") },
        other: { key: "other", label: getPlanCategoryLabel("other"), unit: getPlanCategoryUnit("other") },
      };
      const cat = categoryByCard[cardType];
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
          type: "plan_fill_rows",
          cardType,
          categoryKey: cat.key,
          categoryLabel: cat.label,
          categoryUnit: cat.unit,
          count: rows.length,
          developmentGoal: developmentGoal.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.code === "QUOTA_EXCEEDED" ? data.error : (data?.error || "AI 추천을 불러오는데 실패했습니다."));
        return;
      }
      const filled = (data.rows || []) as { activity?: string; period?: string; remarks?: string }[];
      if (filled.length === 0) return;
      const merged = (rows as any[]).map((row, i) => {
        const base: any = { ...row };
        const ai = filled[i] || {};
        if (cardType === "training") {
          base.name = ai.activity ?? base.name ?? "";
          base.period = ai.period ?? base.period ?? "";
          base.remarks = ai.remarks ?? base.remarks ?? "";
        } else if (cardType === "expense" || cardType === "community") {
          base.activity = ai.activity ?? base.activity ?? "";
          base.period = ai.period ?? base.period ?? "";
          base.remarks = ai.remarks ?? base.remarks ?? "";
        } else if (cardType === "book") {
          base.title = ai.activity ?? base.title ?? "";
          base.period = ai.period ?? base.period ?? "";
          base.remarks = ai.remarks ?? base.remarks ?? "";
        } else if (cardType === "education") {
          base.area = ai.activity ?? base.area ?? "";
          base.period = ai.period ?? base.period ?? "";
          base.remarks = ai.remarks ?? base.remarks ?? "";
        } else if (cardType === "other") {
          base.content = ai.activity ?? base.content ?? "";
          base.period = ai.period ?? base.period ?? "";
          base.remarks = ai.remarks ?? base.remarks ?? "";
        }
        base.id = (row as { id?: string }).id ?? String(i);
        return base;
      });
      if (cardType === "other") {
        setter(merged.map((r) => normalizeOtherPlanRow(r as Parameters<typeof normalizeOtherPlanRow>[0])));
      } else {
        setter(merged);
      }
    } catch (e) {
      console.error(e);
      alert("AI 추천 중 오류가 발생했습니다.");
    } finally {
      setAiFillRowsLoading((prev) => ({ ...prev, [cardType]: false }));
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
          count(r.title); count(r.period); count(r.method); count(r.remarks);
        });
        expenseRequests.forEach((r) => {
          count(r.activity); count(r.period); count(r.method); count(r.remarks);
        });
        communityPlans.forEach((r) => {
          count(r.activity); count(r.period); count(r.method); count(r.remarks);
        });
        otherPlans.forEach((r) => {
          count(r.content); count(r.period); count(r.method); count(r.remarks);
        });
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
      const { data: { session: sessionForAi } } = await supabase.auth.getSession();
      const aiToken = sessionForAi?.access_token;
      if (!aiToken) {
        alert("로그인이 필요합니다.");
        return;
      }
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiToken}` },
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
        const errorMessage = responseData?.code === "QUOTA_EXCEEDED" ? responseData.error : (responseData?.error || `AI 추천 생성에 실패했습니다. (상태 코드: ${res.status})`);
        console.error("API 응답 오류:", { status: res.status, statusText: res.statusText, error: responseData });
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
      const { data: { session: mentorSession } } = await supabase.auth.getSession();
      const mentorToken = mentorSession?.access_token;
      if (!mentorToken) {
        alert("로그인이 필요합니다.");
        return;
      }
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mentorToken}` },
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
        const msg = data?.code === "QUOTA_EXCEEDED" ? data.error : (data?.error || "멘토링 요청에 실패했습니다.");
        throw new Error(msg);
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
      const missingKeys = computeMissingAnnualGoals({
        training: annualGoal,
        class_open: expenseAnnualGoal,
        community: communityAnnualGoal,
        book_edutech: bookAnnualGoal,
        health: educationAnnualGoal,
        other: otherAnnualGoal,
      });
      setMissingAnnualGoalKeys(missingKeys);
      persistMissingAnnualGoals(userEmail, missingKeys);

      const proceed = confirm(`${missingList}이(가) 비어있습니다. 그래도 저장하시겠습니까?`);
      if (!proceed) return;
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
          title="목적지 플래너(자기역량 개발계획서 작성)"
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
              <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_4fr] gap-3">
                {/* 강점 영역: 2/7 너비 */}
                <div className="rounded-xl border-l-2 border-l-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 p-2.5 min-w-0">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <div className="rounded-full bg-blue-500 p-1 shrink-0">
                      <Target className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-[15px] font-semibold text-blue-700 shrink-0">강점 영역</h3>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-2">
                    {(diagnosisSummary.strengthsDetail ?? diagnosisSummary.strengths.map((label, i) => ({ label, domainKey: `domain${i + 1}`, avg: 0, subDomains: [] as { name: string; avg: number }[] }))).map((item, index) => (
                      <div key={item.domainKey ?? index} className="min-w-[120px] max-w-[220px] rounded-md bg-white/80 px-2 py-1 shadow-sm">
                        <div className="text-[13px] font-bold text-blue-700 break-words" title={item.label}>{item.label}</div>
                        {item.subDomains?.length ? (
                          <ul className="mt-0.5 space-y-0.5 text-[12px] text-slate-600">
                            {item.subDomains.map((s) => (
                              <li key={s.name} className="break-words">{s.name} ({s.avg.toFixed(1)})</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-0.5 text-[12px] text-slate-500">평균 {item.avg.toFixed(1)}점</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 개발 우선 영역: 대영역 가로 나열, 아래 소영역(낮은 순) + 점수 */}
                <div className="rounded-xl border-l-2 border-l-orange-500 bg-gradient-to-br from-orange-50 to-red-50 p-2.5 min-w-0">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <div className="rounded-full bg-orange-500 p-1 shrink-0">
                      <Target className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-[15px] font-semibold text-orange-700 shrink-0">개발 우선 영역</h3>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-2">
                    {(diagnosisSummary.weaknessesDetail ?? diagnosisSummary.weaknesses.map((label, i) => ({ label, domainKey: `domain${i + 1}`, avg: 0, subDomains: [] as { name: string; avg: number }[] }))).map((item, index) => (
                      <div key={item.domainKey ?? index} className="min-w-[120px] max-w-[220px] rounded-md bg-white/80 px-2 py-1 shadow-sm">
                        <div className="text-[13px] font-bold text-orange-700 break-words" title={item.label}>{item.label}</div>
                        {item.subDomains?.length ? (
                          <ul className="mt-0.5 space-y-0.5 text-[12px] text-slate-600">
                            {item.subDomains.map((s) => (
                              <li key={s.name} className="break-words">{s.name} ({s.avg.toFixed(1)})</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-0.5 text-[12px] text-slate-500">평균 {item.avg.toFixed(1)}점</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 방사형 그래프 — 대시보드 사전진단 카드와 동일 컴포넌트·동일 데이터 소스 */}
                <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-1 flex items-center justify-center min-h-[11rem] min-w-[200px]">
                <div className="h-44 w-full min-h-[176px] min-w-[200px]">
                  <DashboardDiagnosisRadar
                    data={diagnosisSummary.labels.map((name, i) => ({
                      name,
                      score: [diagnosisSummary.domain1, diagnosisSummary.domain2, diagnosisSummary.domain3, diagnosisSummary.domain4, diagnosisSummary.domain5, diagnosisSummary.domain6][i] ?? 0,
                    }))}
                  />
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setAnnualGoal(v);
                    if (v.trim()) {
                      const next = missingAnnualGoalKeys.filter((k) => k !== "training");
                      if (next.length !== missingAnnualGoalKeys.length) {
                        setMissingAnnualGoalKeys(next);
                        if (userEmail) persistMissingAnnualGoals(userEmail, next);
                      }
                    }
                  }}
                  placeholder="연간 목표"
                  className={`w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1 ${missingAnnualGoalKeys.includes("training") ? "border-red-500 ring-1 ring-red-300" : ""}`}
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("training")}</span>
              </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAIFillRowsClick("training")}
              className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
            >
              <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading.training ? "animate-spin" : ""}`} />
              {aiFillRowsLoading.training ? "추천 생성 중..." : "AI 추천 받기"}
            </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTrainingDragEnd}>
            <SortableContext items={trainingPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기 및 방법</div>
                  <div>기대효과</div>
                  <div></div>
                </div>
                {trainingPlans.map((row, idx) => (
                  <SortableTrainingRow
                    key={row.id}
                    row={row}
                    idx={idx}
                    trainingPlans={trainingPlans}
                    setTrainingPlans={setTrainingPlans}
                    removeTrainingRow={removeTrainingRow}
                    placeholders={getPlaceholdersForCategory("training", getPlanCategoryLabel("training"))}
                  />
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setExpenseAnnualGoal(v);
                    if (v.trim()) {
                      const next = missingAnnualGoalKeys.filter((k) => k !== "class_open");
                      if (next.length !== missingAnnualGoalKeys.length) {
                        setMissingAnnualGoalKeys(next);
                        if (userEmail) persistMissingAnnualGoals(userEmail, next);
                      }
                    }
                  }}
                  placeholder="연간 목표"
                  className={`w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1 ${missingAnnualGoalKeys.includes("class_open") ? "border-red-500 ring-1 ring-red-300" : ""}`}
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("class_open")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("expense")}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading.expense ? "animate-spin" : ""}`} />
                {aiFillRowsLoading.expense ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleExpenseDragEnd}>
            <SortableContext items={expenseRequests.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기 및 방법</div>
                  <div>기대효과</div>
                  <div></div>
                </div>
                {expenseRequests.map((row, idx) => (
                  <SortableExpenseRow
                    key={row.id}
                    row={row}
                    idx={idx}
                    expenseRequests={expenseRequests}
                    setExpenseRequests={setExpenseRequests}
                    removeExpenseRow={removeExpenseRow}
                    placeholders={getPlaceholdersForCategory("class_open", getPlanCategoryLabel("class_open"))}
                  />
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setCommunityAnnualGoal(v);
                    if (v.trim()) {
                      const next = missingAnnualGoalKeys.filter((k) => k !== "community");
                      if (next.length !== missingAnnualGoalKeys.length) {
                        setMissingAnnualGoalKeys(next);
                        if (userEmail) persistMissingAnnualGoals(userEmail, next);
                      }
                    }
                  }}
                  placeholder="연간 목표"
                  className={`w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1 ${missingAnnualGoalKeys.includes("community") ? "border-red-500 ring-1 ring-red-300" : ""}`}
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("community")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("community")}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading.community ? "animate-spin" : ""}`} />
                {aiFillRowsLoading.community ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCommunityDragEnd}>
            <SortableContext items={communityPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기 및 방법</div>
                  <div>기대효과</div>
                  <div></div>
                </div>
                {communityPlans.map((row, idx) => (
                  <SortableCommunityRow
                    key={row.id}
                    row={row}
                    idx={idx}
                    communityPlans={communityPlans}
                    setCommunityPlans={setCommunityPlans}
                    removeCommunityRow={removeCommunityRow}
                    placeholders={getPlaceholdersForCategory("community", getPlanCategoryLabel("community"))}
                  />
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setBookAnnualGoal(v);
                    if (v.trim()) {
                      const next = missingAnnualGoalKeys.filter((k) => k !== "book_edutech");
                      if (next.length !== missingAnnualGoalKeys.length) {
                        setMissingAnnualGoalKeys(next);
                        if (userEmail) persistMissingAnnualGoals(userEmail, next);
                      }
                    }
                  }}
                  placeholder="연간 목표"
                  className={`w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1 ${missingAnnualGoalKeys.includes("book_edutech") ? "border-red-500 ring-1 ring-red-300" : ""}`}
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("book_edutech")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("book")}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading.book ? "animate-spin" : ""}`} />
                {aiFillRowsLoading.book ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBookDragEnd}>
            <SortableContext items={bookPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기 및 방법</div>
                  <div>기대효과</div>
                  <div></div>
                </div>
                {bookPlans.map((row, idx) => (
                  <SortableBookRow
                    key={row.id}
                    row={row}
                    idx={idx}
                    bookPlans={bookPlans}
                    setBookPlans={setBookPlans}
                    removeBookRow={removeBookRow}
                    placeholders={getPlaceholdersForCategory("book_edutech", getPlanCategoryLabel("book_edutech"))}
                  />
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setEducationAnnualGoal(v);
                    if (v.trim()) {
                      const next = missingAnnualGoalKeys.filter((k) => k !== "health");
                      if (next.length !== missingAnnualGoalKeys.length) {
                        setMissingAnnualGoalKeys(next);
                        if (userEmail) persistMissingAnnualGoals(userEmail, next);
                      }
                    }
                  }}
                  placeholder="연간 목표"
                  className={`w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1 ${missingAnnualGoalKeys.includes("health") ? "border-red-500 ring-1 ring-red-300" : ""}`}
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
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading.education ? "animate-spin" : ""}`} />
                {aiFillRowsLoading.education ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEducationDragEnd}>
            <SortableContext items={educationPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기 및 방법</div>
                  <div>기대효과</div>
                  <div></div>
                </div>
                {educationPlans.map((row, idx) => (
                  <SortableEducationRow
                    key={row.id}
                    row={row}
                    idx={idx}
                    educationPlans={educationPlans}
                    setEducationPlans={setEducationPlans}
                    removeEducationRow={removeEducationRow}
                    placeholders={getPlaceholdersForCategory("health", getPlanCategoryLabel("health"))}
                  />
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setOtherAnnualGoal(v);
                    if (v.trim()) {
                      const next = missingAnnualGoalKeys.filter((k) => k !== "other");
                      if (next.length !== missingAnnualGoalKeys.length) {
                        setMissingAnnualGoalKeys(next);
                        if (userEmail) persistMissingAnnualGoals(userEmail, next);
                      }
                    }
                  }}
                  placeholder="연간 목표"
                  className={`w-[2.5cm] max-w-[2.5cm] h-8 rounded-lg border-slate-200 text-sm py-1 ${missingAnnualGoalKeys.includes("other") ? "border-red-500 ring-1 ring-red-300" : ""}`}
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{getPlanCategoryUnit("other")}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAIFillRowsClick("other")}
                className="shrink-0 rounded-full border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 text-xs text-purple-600 hover:from-purple-100 hover:to-pink-100 disabled:opacity-50"
              >
                <Sparkles className={`mr-1 h-3 w-3 ${aiFillRowsLoading.other ? "animate-spin" : ""}`} />
                {aiFillRowsLoading.other ? "추천 생성 중..." : "AI 추천 받기"}
              </Button>
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleOtherDragEnd}>
            <SortableContext items={otherPlans.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 w-full rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 leading-none text-left">
                  <div className="w-4"></div>
                  <div>내용</div>
                  <div>시기 및 방법</div>
                  <div>기대효과</div>
                  <div></div>
                </div>
                {otherPlans.map((row, idx) => (
                  <SortableOtherRow
                    key={row.id}
                    row={row}
                    idx={idx}
                    otherPlans={otherPlans}
                    setOtherPlans={setOtherPlans}
                    removeOtherRow={removeOtherRow}
                    placeholders={getPlaceholdersForCategory("other", getPlanCategoryLabel("other"))}
                  />
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
