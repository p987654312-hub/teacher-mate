"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, NotebookPen, Pencil, Plane, Plus, Trash2 } from "lucide-react";

const PLAN_GOAL_KEYS: Record<string, string> = {
  training: "annual_goal",
  class_open: "expense_annual_goal",
  community: "community_annual_goal",
  book_edutech: "book_annual_goal",
  health: "education_annual_goal",
  other: "other_annual_goal",
};

const MILEAGE_CATEGORIES = [
  { key: "training", label: "연수(직무·자율)" },
  { key: "class_open", label: "수업 공개" },
  { key: "community", label: "교원학습 공동체" },
  { key: "book_edutech", label: "전문 서적/에듀테크" },
  { key: "health", label: "건강/체력" },
  { key: "other", label: "기타 계획" },
] as const;

type MileageEntry = {
  id: string;
  content: string;
  category: string;
  created_at: string;
};

function parseDateFromContent(content: string): Date | null {
  const m = content.match(/(\d{2})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10) - 1;
  const dd = parseInt(m[3], 10);
  const fullYear = yy >= 0 && yy <= 99 ? 2000 + yy : yy;
  const d = new Date(fullYear, mm, dd);
  return isNaN(d.getTime()) ? null : d;
}

function sortEntriesByActivityDate(entries: MileageEntry[]): MileageEntry[] {
  return [...entries].sort((a, b) => {
    const dateA = parseDateFromContent(a.content);
    const dateB = parseDateFromContent(b.content);
    if (dateA && dateB) return dateA.getTime() - dateB.getTime();
    if (dateA) return -1;
    if (dateB) return 1;
    const createdA = new Date(a.created_at).getTime();
    const createdB = new Date(b.created_at).getTime();
    return createdA - createdB;
  });
}

function DroppableArea({
  id,
  categoryKey,
  children,
  className,
}: {
  id: string;
  categoryKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { categoryKey },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-violet-300 ring-inset rounded-lg bg-violet-50/50" : ""}`}
    >
      {children}
    </div>
  );
}

const NEW_ENTRY_DURATION_MS = 5 * 60 * 1000;
const MOVED_ENTRY_DURATION_MS = 60 * 1000;

function isNewEntry(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < NEW_ENTRY_DURATION_MS;
}

function getEntryItemStyle(opts: { isNew: boolean; isMoved: boolean }) {
  if (opts.isMoved) return "border-violet-200/90 bg-violet-50/80";
  if (opts.isNew) return "border-blue-200/90 bg-blue-50/80";
  return "border-slate-100/80 bg-white/80";
}

function DraggableEntryItem({
  entry,
  isEditing,
  isNew,
  isMoved,
  children,
}: {
  entry: MileageEntry;
  isEditing: boolean;
  isNew: boolean;
  isMoved: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry-${entry.id}`,
    data: { entry },
    disabled: isEditing,
  });
  return (
    <li
      ref={setNodeRef}
      {...(!isEditing ? { ...attributes, ...listeners } : {})}
      className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs ${getEntryItemStyle({
        isNew,
        isMoved,
      })} ${
        !isEditing ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-30" : ""}`}
    >
      {children}
    </li>
  );
}

export default function MileagePage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>(MILEAGE_CATEGORIES[0].key);
  const [aiAssistOn, setAiAssistOn] = useState(false);
  const [planGoals, setPlanGoals] = useState<Record<string, number>>({});
  const [healthGoalUnit, setHealthGoalUnit] = useState<"시간" | "거리">("시간");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState<string>(MILEAGE_CATEGORIES[0].key);
  const [activeDragEntry, setActiveDragEntry] = useState<MileageEntry | null>(null);
  const [recentlyMovedAt, setRecentlyMovedAt] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("teacher_mate_mileage_started", "1");
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        router.replace("/");
        return;
      }
      const meta = user.user_metadata as { role?: string } | undefined;
      if (meta?.role !== "teacher") {
        router.replace(meta?.role === "admin" ? "/dashboard" : "/");
        return;
      }
      setUserEmail(user.email);

      const { data, error } = await supabase
        .from("mileage_entries")
        .select("id, content, category, created_at")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false });

      if (!error && data) setEntries((data as MileageEntry[]) ?? []);

      const { data: planRow } = await supabase
        .from("development_plans")
        .select("annual_goal, expense_annual_goal, community_annual_goal, book_annual_goal, education_annual_goal, education_annual_goal_unit, other_annual_goal")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const plan = planRow as Record<string, unknown> | null;
      const goals: Record<string, number> = {};
      MILEAGE_CATEGORIES.forEach((c) => {
        const key = PLAN_GOAL_KEYS[c.key];
        const raw = String(plan?.[key] ?? "").trim();
        goals[c.key] = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
      });
      setPlanGoals(goals);
      setHealthGoalUnit(plan?.education_annual_goal_unit === "거리" ? "거리" : "시간");
      setLoading(false);
    };
    fetchData();
  }, [router]);

  const handleAdd = async () => {
    const trimmed = content.trim();
    if (!trimmed || !userEmail) return;
    setAdding(true);

    if (aiAssistOn) {
      try {
        const res = await fetch("/api/ai-classify-mileage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data?.error ?? "AI 분류에 실패했습니다.");
          setAdding(false);
          return;
        }
        const list = data?.entries ?? [];
        if (list.length === 0) {
          alert("분류된 활동이 없습니다. 내용을 구체적으로 적어 주세요.");
          setAdding(false);
          return;
        }
        for (const e of list) {
          await supabase.from("mileage_entries").insert({
            user_email: userEmail,
            content: e.content,
            category: e.category,
          });
        }
        const { data: refreshed } = await supabase
          .from("mileage_entries")
          .select("id, content, category, created_at")
          .eq("user_email", userEmail)
          .order("created_at", { ascending: false });
        if (refreshed?.length) setEntries(refreshed as MileageEntry[]);
        setContent("");
      } catch (err) {
        alert("AI 분류 요청 중 오류가 났습니다.");
      }
      setAdding(false);
      return;
    }

    const { error } = await supabase.from("mileage_entries").insert({
      user_email: userEmail,
      content: trimmed,
      category,
    });
    if (!error) {
      const { data } = await supabase
        .from("mileage_entries")
        .select("id, content, category, created_at")
        .eq("user_email", userEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data) setEntries((prev) => [data as MileageEntry, ...prev]);
      setContent("");
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    const { error } = await supabase.from("mileage_entries").delete().eq("id", id);
    if (!error) setEntries((prev) => prev.filter((x) => x.id !== id));
  };

  const handleEditStart = (e: MileageEntry) => {
    setEditingId(e.id);
    setEditContent(e.content);
    setEditCategory(e.category);
  };

  const handleEditSave = async () => {
    if (!editingId || !editContent.trim()) return;
    const { error } = await supabase
      .from("mileage_entries")
      .update({ content: editContent.trim(), category: editCategory })
      .eq("id", editingId);
    if (!error) {
      setEntries((prev) =>
        prev.map((x) =>
          x.id === editingId ? { ...x, content: editContent.trim(), category: editCategory } : x
        )
      );
      setEditingId(null);
      setEditContent("");
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditContent("");
    setEditCategory(MILEAGE_CATEGORIES[0].key);
  };

  const handleMoveToCategory = async (entryId: string, newCategory: string) => {
    const entry = entries.find((x) => x.id === entryId);
    if (!entry || entry.category === newCategory) return;
    const { error } = await supabase
      .from("mileage_entries")
      .update({ category: newCategory })
      .eq("id", entryId);
    if (!error) {
      setEntries((prev) =>
        prev.map((x) => (x.id === entryId ? { ...x, category: newCategory } : x))
      );
      setRecentlyMovedAt((prev) => ({ ...prev, [entryId]: Date.now() }));
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: { active: { data: { current?: { entry?: MileageEntry } } } }) => {
    const entry = event.active.data?.current?.entry;
    if (entry) setActiveDragEntry(entry);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragEntry(null);
    const { active, over } = event;
    if (!over) return;
    const draggableId = String(active.id);
    if (!draggableId.startsWith("entry-")) return;
    const entryId = draggableId.replace("entry-", "");

    let targetCategory: string | null = null;
    const overId = String(over.id);
    if (overId.startsWith("drop-")) {
      targetCategory = (over.data?.current as { categoryKey?: string })?.categoryKey ?? null;
    } else if (overId.startsWith("entry-")) {
      const overEntry = entries.find((x) => x.id === overId.replace("entry-", ""));
      if (overEntry) targetCategory = overEntry.category;
    }
    if (targetCategory) handleMoveToCategory(entryId, targetCategory);
  };

  const isRecentlyMoved = (entryId: string) =>
    Date.now() - (recentlyMovedAt[entryId] ?? 0) < MOVED_ENTRY_DURATION_MS;

  const entriesByCategory = MILEAGE_CATEGORIES.reduce(
    (acc, c) => {
      acc[c.key] = sortEntriesByActivityDate(
        entries.filter((e) => e.category === c.key)
      );
      return acc;
    },
    {} as Record<string, MileageEntry[]>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-white px-4 py-10 flex items-center justify-center">
        <p className="text-sm text-slate-500">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white px-4 py-4">
      <div className="mx-auto flex min-h-0 flex-1 flex-col gap-3 max-w-4xl">
        <header className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex shrink-0 items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드
          </Link>
          <div className="flex flex-1 items-center justify-center gap-3">
            <div className="rounded-2xl bg-violet-100 p-2.5 text-violet-600">
              <NotebookPen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
                목적지 마일리지
              </h1>
              <p className="text-xs text-slate-500">역량 개발 실천 기록을 간편하게 누적 관리합니다.</p>
            </div>
          </div>
        </header>

        {/* 기록 추가 카드 — 높이 약 1/3, 텍스트칸 위·아래에 항목 선택·AI 스위치·확인 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 px-3 py-2 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-[-4mm]">기록 추가</h2>
          <Textarea
            placeholder={`[직접 작성 예시] 25.02.15(토) 양재천 달리기 10km / 25.02.14(금) 교육과정 도서 독서 2시간

[AI 어시스트 ON] 여러 활동을 한 번에 적으면 6가지 영역(연수·수업공개·공동체·서적·건강·기타)으로 자동 분류되어 저장됩니다.
              예: 오늘 양재천에서 달리기 10km 했고, 어제 교육과정 도서 2시간 읽었어.`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-0 mb-[-4mm] min-h-[5.5rem] resize-none rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-sm leading-normal placeholder:text-slate-400"
            rows={5}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-0">
            <p className="text-[11px] text-slate-500">*작성된 내용 드래그 앤 드롭으로 항목간 이동 가능합니다.</p>
            <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={aiAssistOn}
              className={`rounded-lg border px-2.5 py-1.5 text-xs text-slate-800 ${aiAssistOn ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500" : "border-slate-200 bg-white"}`}
            >
              {MILEAGE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600">AI 어시스트</span>
              <button
                type="button"
                role="switch"
                aria-checked={aiAssistOn}
                onClick={() => setAiAssistOn((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                  aiAssistOn ? "border-violet-400 bg-violet-500" : "border-slate-200 bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                    aiAssistOn ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={adding || !content.trim()}
              className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] px-4 text-xs font-semibold text-white hover:opacity-90"
            >
              {adding ? "저장 중..." : "확인"}
            </Button>
            </div>
          </div>
        </Card>

        {/* 6개 분야 카드 */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {MILEAGE_CATEGORIES.map((c) => {
            const count = entriesByCategory[c.key]?.length ?? 0;
            const goalNum = planGoals[c.key] ?? 0;
            const progress = goalNum > 0 ? Math.min(100, (count / goalNum) * 100) : 0;
            const unit = c.key === "training" ? "시간"
              : c.key === "health" ? healthGoalUnit
              : c.key === "class_open" || c.key === "community" || c.key === "book_edutech" ? "회"
              : "건";
            return (
              <Card
                key={c.key}
                className="flex max-h-[min(400px,calc((100vh-180px)/2))] min-h-0 flex-col overflow-hidden rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm"
              >
                <div className="mb-2 mt-[2mm] flex shrink-0 items-center gap-2 overflow-visible">
                  <h3 className="w-1/2 shrink-0 text-sm font-semibold text-slate-800">{c.label}</h3>
                  <div className="mt-[1mm] flex min-w-0 flex-1 items-center gap-2">
                    <div className="relative h-[4.8px] min-w-0 flex-1 overflow-visible rounded-full bg-[#e0e2e7]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-[#6366f1] transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%`, minWidth: progress > 0 ? 2 : 0 }}
                    />
                    <div
                      className="absolute bottom-full left-0 mb-0.5 transition-all duration-500"
                      style={{
                        left: `${Math.min(100, Math.max(0, progress))}%`,
                        transform: "translate(-50%, 0) rotate(20deg)",
                      }}
                    >
                      <Plane className="h-[16px] w-[16px] text-[#6366f1]" strokeWidth={2} />
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-slate-600">
                      {goalNum > 0 ? `${goalNum} ${unit}` : "-"}
                    </span>
                  </div>
                </div>
                <DroppableArea
                  id={`drop-${c.key}`}
                  categoryKey={c.key}
                  className="min-h-[2rem] flex-1 flex flex-col"
                >
                {entriesByCategory[c.key]?.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">기록 없음</p>
                ) : (
                  <ul className="min-h-0 flex-1 space-y-px overflow-y-auto">
                    {entriesByCategory[c.key]?.map((e) => (
                      <DraggableEntryItem
                        key={e.id}
                        entry={e}
                        isEditing={editingId === e.id}
                        isNew={isNewEntry(e.created_at)}
                        isMoved={isRecentlyMoved(e.id)}
                      >
                        {editingId === e.id ? (
                          <>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <select
                                value={editCategory}
                                onChange={(ev) => setEditCategory(ev.target.value)}
                                className="w-full max-w-[140px] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-800"
                              >
                                {MILEAGE_CATEGORIES.map((cat) => (
                                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                                ))}
                              </select>
                              <textarea
                                value={editContent}
                                onChange={(ev) => setEditContent(ev.target.value)}
                                className="min-h-0 flex-1 resize-none rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
                                rows={2}
                                autoFocus
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleEditSave}
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-violet-600 hover:bg-violet-50"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={handleEditCancel}
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 text-slate-700 line-clamp-2 whitespace-pre-wrap">
                              {e.content}
                            </span>
                            <div className="flex shrink-0 gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleEditStart(e)}
                                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                title="수정"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(e.id)}
                                className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                                title="삭제"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </DraggableEntryItem>
                    ))}
                  </ul>
                )}
                </DroppableArea>
              </Card>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDragEntry ? (
            <div
              className="flex items-center gap-1 rounded-sm border border-violet-200 bg-white px-2 py-0.5 text-xs shadow-lg"
              style={{ minWidth: 200 }}
            >
              <span className="min-w-0 flex-1 text-slate-700 line-clamp-2 whitespace-pre-wrap">
                {activeDragEntry.content}
              </span>
            </div>
          ) : null}
        </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
