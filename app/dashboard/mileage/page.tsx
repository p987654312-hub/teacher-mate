"use client";

import { useEffect, useRef, useState } from "react";
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
import { parseValueFromContent, hasValidMileageFormat } from "@/lib/mileageProgress";
import { ArrowLeft, Calendar, Maximize2, Minimize2, NotebookPen, Pencil, Plane, Plus, Trash2 } from "lucide-react";

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

type DailyReflectionEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  createdAt: string; // ISO
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

function sortDailyReflections(entries: DailyReflectionEntry[]): DailyReflectionEntry[] {
  return [...entries].sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (!isNaN(da) && !isNaN(db) && da !== db) return db - da; // 최신 날짜 우선
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function getKoreanWeekdayShort(d: Date) {
  const w = ["일", "월", "화", "수", "목", "금", "토"] as const;
  return w[d.getDay()] ?? "";
}

function formatYyMmDdWithWeekday(dateStr: string) {
  // dateStr: YYYY-MM-DD
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}(${getKoreanWeekdayShort(d)})`;
}

function stripLeadingDatePrefix(text: string) {
  // 25.02.15(토) ... 또는 25.02.15 ...
  return text.replace(/^\s*\d{2}\.\d{2}\.\d{2}(\([^)]+\))?\s*/, "");
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
  isInvalidFormat,
  children,
}: {
  entry: MileageEntry;
  isEditing: boolean;
  isNew: boolean;
  isMoved: boolean;
  isInvalidFormat: boolean;
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
      title={isInvalidFormat ? "기록합산 불가, 적절한 양식으로 수정요망." : undefined}
      className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs ${getEntryItemStyle({
        isNew,
        isMoved,
      })} ${!isEditing ? "cursor-grab active:cursor-grabbing transition-colors hover:border-violet-300 hover:bg-violet-50/70 hover:shadow-sm" : ""} ${isDragging ? "opacity-30" : ""}`}
    >
      {children}
    </li>
  );
}

export default function MileagePage() {
  const router = useRouter();
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const [addDate, setAddDate] = useState<string>("");
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
  const [schoolCategories, setSchoolCategories] = useState<{ key: string; label: string; unit: string }[]>([]);
  const [userSchool, setUserSchool] = useState<string | null>(null);
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});

  // 일일 성찰 기록 (기본 닫힘)
  const [dailyReflectionOn, setDailyReflectionOn] = useState(false);
  const [dailyReflectionDate, setDailyReflectionDate] = useState<string>("");
  const [dailyReflectionContent, setDailyReflectionContent] = useState<string>("");
  const [dailyReflections, setDailyReflections] = useState<DailyReflectionEntry[]>([]);
  const [dailyReflectionsLoaded, setDailyReflectionsLoaded] = useState(false);
  const [editingDailyId, setEditingDailyId] = useState<string | null>(null);
  const [editDailyDate, setEditDailyDate] = useState<string>("");
  const [editDailyContent, setEditDailyContent] = useState<string>("");

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
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
      const meta = user.user_metadata as { role?: string; schoolName?: string } | undefined;
      // 관리자는 교원 권한도 가집니다
      if (meta?.role !== "teacher" && meta?.role !== "admin") {
        router.replace("/");
        return;
      }
      setUserEmail(user.email);
      const schoolName = (meta?.schoolName ?? "").trim() || null;
      setUserSchool(schoolName);

      // 관리자 설정 단위 로드 (API 우선, 실패 시 localStorage)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && schoolName) {
        try {
          const res = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${session.access_token}` } });
          if (res.ok) {
            const j = await res.json();
            if (Array.isArray(j.categories) && j.categories.length === 6) {
              setSchoolCategories(j.categories);
              // localStorage에도 저장하여 다음 로드 시 빠르게 반영
              localStorage.setItem(`teacher_mate_category_settings_${schoolName}`, JSON.stringify(j.categories));
              // healthGoalUnit도 업데이트
              const healthCat = j.categories.find((c: { key: string; unit: string }) => c.key === "health");
              if (healthCat?.unit === "km") {
                setHealthGoalUnit("거리");
              } else if (healthCat?.unit === "시간") {
                setHealthGoalUnit("시간");
              }
            }
          }
        } catch {
          // API 실패 시 localStorage 확인
          try {
            const cached = localStorage.getItem(`teacher_mate_category_settings_${schoolName}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length === 6) {
                setSchoolCategories(parsed);
                const healthCat = parsed.find((c: { key: string; unit: string }) => c.key === "health");
                if (healthCat?.unit === "km") {
                  setHealthGoalUnit("거리");
                } else if (healthCat?.unit === "시간") {
                  setHealthGoalUnit("시간");
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }

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
      // healthGoalUnit은 plan에서 먼저 설정 (schoolCategories는 비동기로 로드되므로 나중에 업데이트됨)
      setHealthGoalUnit(plan?.education_annual_goal_unit === "거리" ? "거리" : "시간");
      setLoading(false);
    };
    fetchData();
  }, [router]);

  // 관리자 설정 단위를 주기적으로 다시 로드하여 실시간 반영
  useEffect(() => {
    if (!userEmail || !userSchool) return;
    const reloadSchoolCategories = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      
      try {
        const res = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j.categories) && j.categories.length === 6) {
            setSchoolCategories(j.categories);
            // localStorage에도 저장
            localStorage.setItem(`teacher_mate_category_settings_${userSchool}`, JSON.stringify(j.categories));
            // healthGoalUnit도 업데이트
            const healthCat = j.categories.find((c: { key: string; unit: string }) => c.key === "health");
            if (healthCat?.unit === "km") {
              setHealthGoalUnit("거리");
            } else if (healthCat?.unit === "시간") {
              setHealthGoalUnit("시간");
            }
          }
        }
      } catch {
        // API 실패 시 localStorage 확인
        try {
          const cached = localStorage.getItem(`teacher_mate_category_settings_${userSchool}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length === 6) {
              setSchoolCategories(parsed);
              const healthCat = parsed.find((c: { key: string; unit: string }) => c.key === "health");
              if (healthCat?.unit === "km") {
                setHealthGoalUnit("거리");
              } else if (healthCat?.unit === "시간") {
                setHealthGoalUnit("시간");
              }
            }
          }
        } catch {
          // ignore
        }
      }
    };
    
    reloadSchoolCategories();
    // 60초마다 재조회 (가벼운 폴링, 관리자 설정 변경 반영)
    const interval = setInterval(reloadSchoolCategories, 60000);
    
    // storage 이벤트 리스너 추가 (다른 탭에서 저장한 경우 즉시 반영)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `teacher_mate_category_settings_${userSchool}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length === 6) {
            setSchoolCategories(parsed);
            const healthCat = parsed.find((c: { key: string; unit: string }) => c.key === "health");
            if (healthCat?.unit === "km") {
              setHealthGoalUnit("거리");
            } else if (healthCat?.unit === "시간") {
              setHealthGoalUnit("시간");
            }
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [userEmail, userSchool]);

  useEffect(() => {
    if (!userEmail) return;
    const loadDailyReflections = async () => {
      try {
        const { data, error } = await supabase
          .from("daily_reflections")
          .select("*")
          .eq("user_email", userEmail)
          .order("reflection_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          console.error("일일성찰기록 로드 오류:", error);
          setDailyReflections([]);
        } else {
          const entries: DailyReflectionEntry[] = (data || []).map((row) => ({
            id: row.id,
            date: row.reflection_date,
            content: row.content,
            createdAt: row.created_at,
          }));
          setDailyReflections(entries);
        }
      } catch (err) {
        console.error("일일성찰기록 로드 중 오류:", err);
        setDailyReflections([]);
      } finally {
        setDailyReflectionsLoaded(true);
      }
    };
    loadDailyReflections();
  }, [userEmail]);

  const handleAddMileage = async () => {
    const trimmed = content.trim();
    if (!trimmed || !userEmail) return;

    // 영역별 수동 기록은 날짜 선택이 필수
    if (!aiAssistOn && !addDate.trim()) {
      alert("날짜를 먼저 선택해 주세요.");
      return;
    }
    setAdding(true);

    if (aiAssistOn) {
      try {
        const res = await fetch("/api/ai-classify-mileage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text: trimmed, 
            categories: displayCategories,
            currentDate: new Date().toISOString().split('T')[0] // YYYY-MM-DD 형식
          }),
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

  const handleAddDailyReflection = async () => {
    const trimmed = stripLeadingDatePrefix(dailyReflectionContent).trim();
    const date = dailyReflectionDate.trim();
    if (!date) {
      alert("날짜를 먼저 선택해 주세요.");
      return;
    }
    if (!trimmed || !userEmail) return;

    try {
      const { data, error } = await supabase
        .from("daily_reflections")
        .insert({
          user_email: userEmail,
          reflection_date: date,
          content: trimmed,
        })
        .select()
        .single();

      if (error) {
        console.error("일일성찰기록 저장 오류:", error);
        alert("일일성찰기록 저장 중 오류가 발생했습니다.");
        return;
      }

      const next: DailyReflectionEntry = {
        id: data.id,
        date: data.reflection_date,
        content: data.content,
        createdAt: data.created_at,
      };
      setDailyReflections((prev) => sortDailyReflections([next, ...prev]));
      setDailyReflectionContent("");
    } catch (err) {
      console.error("일일성찰기록 저장 중 오류:", err);
      alert("일일성찰기록 저장 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteDailyReflection = async (id: string) => {
    if (!confirm("이 성찰 기록을 삭제할까요?")) return;

    try {
      const { error } = await supabase.from("daily_reflections").delete().eq("id", id);

      if (error) {
        console.error("일일성찰기록 삭제 오류:", error);
        alert("일일성찰기록 삭제 중 오류가 발생했습니다.");
        return;
      }

      setDailyReflections((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      console.error("일일성찰기록 삭제 중 오류:", err);
      alert("일일성찰기록 삭제 중 오류가 발생했습니다.");
    }
  };

  const handleEditDailyStart = (e: DailyReflectionEntry) => {
    setEditingDailyId(e.id);
    setEditDailyDate(e.date);
    setEditDailyContent(e.content);
  };

  const handleEditDailySave = async () => {
    if (!editingDailyId || !editDailyDate.trim() || !editDailyContent.trim()) return;

    try {
      const trimmedContent = stripLeadingDatePrefix(editDailyContent).trim();
      const { data, error } = await supabase
        .from("daily_reflections")
        .update({
          reflection_date: editDailyDate.trim(),
          content: trimmedContent,
        })
        .eq("id", editingDailyId)
        .select()
        .single();

      if (error) {
        console.error("일일성찰기록 수정 오류:", error);
        alert("일일성찰기록 수정 중 오류가 발생했습니다.");
        return;
      }

      setDailyReflections((prev) =>
        sortDailyReflections(
          prev.map((x) =>
            x.id === editingDailyId
              ? {
                  id: data.id,
                  date: data.reflection_date,
                  content: data.content,
                  createdAt: data.created_at,
                }
              : x
          )
        )
      );
      setEditingDailyId(null);
      setEditDailyDate("");
      setEditDailyContent("");
    } catch (err) {
      console.error("일일성찰기록 수정 중 오류:", err);
      alert("일일성찰기록 수정 중 오류가 발생했습니다.");
    }
  };

  const handleEditDailyCancel = () => {
    setEditingDailyId(null);
    setEditDailyDate("");
    setEditDailyContent("");
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

  const defaultUnitByKey: Record<string, string> = { training: "시간", class_open: "회", community: "회", book_edutech: "회", health: "시간", other: "건" };
  const displayCategories =
    schoolCategories.length === 6
      ? schoolCategories
      : MILEAGE_CATEGORIES.map((c) => ({
          key: c.key,
          label: c.label,
          unit: c.key === "health" ? (healthGoalUnit === "거리" ? "km" : "시간") : (defaultUnitByKey[c.key] ?? "회"),
        }));

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
    <div className="flex min-h-screen flex-col bg-white px-3 py-4 sm:px-4">
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 md:w-[60vw] md:max-w-[60vw]">
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
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 px-4 py-2 shadow-sm w-full">
          <div className="mb-[-4mm] flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-800">기록 추가</h2>
            {/* 모드 선택: 활동기록추가 / 일일성찰기록 */}
            <div
              className="inline-flex rounded-full border border-slate-200 bg-white p-0.5"
              role="tablist"
              aria-label="기록 모드 선택"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!dailyReflectionOn}
                onClick={() => {
                  setDailyReflectionOn(false);
                }}
                className={`h-7 rounded-full px-3 text-xs font-semibold transition-colors ${
                  !dailyReflectionOn ? "bg-violet-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                활동기록추가
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dailyReflectionOn}
                onClick={() => {
                  setAiAssistOn(false);
                  setDailyReflectionOn(true);
                }}
                className={`h-7 rounded-full px-3 text-xs font-semibold transition-colors ${
                  dailyReflectionOn
                    ? "bg-violet-500 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                일일성찰기록
              </button>
            </div>
          </div>

          {/* 날짜 선택: AI 어시스트가 꺼져 있을 때만 표시 (활동기록 + 일일성찰 공통) */}
          <div className="mt-2 mb-[-4mm] flex items-start gap-2 w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%' }}>
            {!aiAssistOn && (
              <div className="shrink-0 flex flex-col items-center gap-0.5" style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    const el = dateInputRef.current;
                    if (!el) return;
                    try {
                      (el as unknown as { showPicker?: () => void }).showPicker?.();
                    } catch {
                      // ignore
                    }
                    el.focus();
                    el.click();
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  title={
                    dailyReflectionOn
                      ? (dailyReflectionDate ? formatYyMmDdWithWeekday(dailyReflectionDate) : "날짜 선택")
                      : (addDate ? formatYyMmDdWithWeekday(addDate) : "날짜 선택")
                  }
                  aria-label="날짜 선택"
                >
                  <Calendar className="h-4 w-4" />
                </button>
                {(dailyReflectionOn ? dailyReflectionDate : addDate) ? (
                  <span className="text-[10px] font-medium text-slate-600 whitespace-nowrap leading-tight">
                    {formatYyMmDdWithWeekday(dailyReflectionOn ? dailyReflectionDate : addDate)}
                  </span>
                ) : null}
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dailyReflectionOn ? dailyReflectionDate : addDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (dailyReflectionOn) {
                      setDailyReflectionDate(v);
                      return;
                    }
                    setAddDate(v);
                    if (!v) return;
                    const prefix = formatYyMmDdWithWeekday(v);
                    if (!prefix) return;
                    const alreadyHasDateAtStart = /^\s*\d{2}\.\d{2}\.\d{2}/.test(content);
                    if (!alreadyHasDateAtStart) {
                      setContent((prev) => {
                        const p = prev.trimStart();
                        if (!p) return `${prefix} `;
                        return `${prefix} ${p}`;
                      });
                    }
                  }}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                />
              </div>
            )}

            {(() => {
              const isDateReady = dailyReflectionOn ? !!dailyReflectionDate.trim() : aiAssistOn ? true : !!addDate.trim();
              const isDisabled = !isDateReady;
              const value = dailyReflectionOn ? dailyReflectionContent : content;
              const placeholder = dailyReflectionOn
                ? `선택한 날짜의 성찰을 간단히 적어 주세요.\n예: 오늘 수업에서 좋았던 점 / 개선할 점 / 내일 할 일`
                : `[직접 작성 예시] 25.02.15(토) 양재천 달리기 10km / 25.02.14(금) 교육과정 도서 독서 2시간
[AI 어시스트] 날짜를 달리하여, 여러 활동을 한 번에 적으면 자동 분류되어 저장. 예) 오늘 양재천에서 달리기 10km 했고, 어제 교육과정 도서 2시간 읽었어.`;
              return (
                <div className="relative flex-1 min-w-0" style={{ maxWidth: '100%' }}>
                  <Textarea
                    placeholder={placeholder}
                    value={value}
                    onChange={(ev) => {
                      if (dailyReflectionOn) setDailyReflectionContent(ev.target.value);
                      else setContent(ev.target.value);
                    }}
                    disabled={isDisabled}
                    className="resize-none rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-sm leading-normal placeholder:text-slate-400 disabled:opacity-60 w-full"
                    rows={3}
                    style={{ 
                      minHeight: '4.2rem',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box'
                    }}
                  />
                  {isDisabled && (
                    <button
                      type="button"
                      onClick={() => {
                        if (aiAssistOn) return;
                        const el = dateInputRef.current;
                        if (!el) return;
                        try {
                          (el as unknown as { showPicker?: () => void }).showPicker?.();
                        } catch {
                          // ignore
                        }
                        el.focus();
                        el.click();
                      }}
                      className="absolute inset-0 flex items-center justify-center rounded-lg text-xs font-semibold text-slate-500"
                      aria-label="날짜 선택"
                    />
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-0">
            <div />
            <div className="flex flex-wrap items-center gap-2">
            {!dailyReflectionOn && (
              <>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={aiAssistOn}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs text-slate-800 ${
                    aiAssistOn ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500" : "border-slate-200 bg-white"
                  }`}
                >
                  {displayCategories.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-600">AI 어시스트</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={aiAssistOn}
                    disabled={dailyReflectionOn}
                    title={dailyReflectionOn ? "일일성찰기록 모드에서는 AI 어시스트를 사용할 수 없습니다." : undefined}
                    onClick={() => {
                      if (dailyReflectionOn) return;
                      setAiAssistOn((v) => !v);
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                      dailyReflectionOn
                        ? "cursor-not-allowed border-slate-200 bg-slate-200 opacity-60"
                        : aiAssistOn
                          ? "border-violet-400 bg-violet-500"
                          : "border-slate-200 bg-slate-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                        aiAssistOn ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </>
            )}
            <Button
              type="button"
              size="sm"
              onClick={dailyReflectionOn ? handleAddDailyReflection : handleAddMileage}
              disabled={
                adding ||
                (dailyReflectionOn ? !dailyReflectionDate.trim() || !dailyReflectionContent.trim() : !content.trim())
              }
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
          {displayCategories.map((c) => {
            const expanded = !!expandedByKey[c.key];
            const list = entriesByCategory[c.key] ?? [];
            const sum = list.reduce(
              (acc, e) => acc + parseValueFromContent(e.content, c.key, healthGoalUnit, c.unit),
              0
            );
            const goalNum = planGoals[c.key] ?? 0;
            const progress = goalNum > 0 ? Math.min(100, (sum / goalNum) * 100) : 0;
            const unit = c.unit;
            return (
              <Card
                key={c.key}
                className={`flex min-h-0 flex-col rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-4 shadow-sm ${
                  expanded
                    ? "overflow-visible max-h-none md:col-span-2 lg:col-span-3"
                    : "overflow-hidden max-h-[min(400px,calc((100vh-180px)/2))] md:col-span-1 lg:col-span-1"
                }`}
              >
                <div className="mb-2 mt-[2mm] flex shrink-0 items-center gap-2 overflow-visible">
                  <div className="w-1/2 shrink-0 flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedByKey((prev) => ({ ...prev, [c.key]: !expanded }))}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      title={expanded ? "축소" : "확대"}
                      aria-label={expanded ? "축소" : "확대"}
                    >
                      {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </button>
                    <h3 className="min-w-0 truncate text-sm font-semibold text-slate-800">{c.label}</h3>
                  </div>
                  <div className="mt-[1mm] flex min-w-0 flex-1 items-center gap-2">
                    <div className="relative h-[4.8px] min-w-0 flex-1 overflow-visible rounded-full bg-[#e0e2e7]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-[#6366f1] transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%`, minWidth: progress > 0 ? 2 : 0 }}
                      />
                      <div
                        className="absolute bottom-full left-0 mb-0.5 flex items-center gap-0.5 transition-all duration-500"
                        style={{
                          left: `${Math.min(100, Math.max(0, progress))}%`,
                          transform: "translate(-50%, 0)",
                        }}
                      >
                        <span className="rotate-[20deg]">
                          <Plane className="h-[16px] w-[16px] text-[#6366f1]" strokeWidth={2} />
                        </span>
                        <span className="text-[12px] font-medium text-[#6366f1] whitespace-nowrap">
                          {goalNum > 0 || sum > 0 ? sum.toFixed(sum % 1 === 0 ? 0 : 1) : ""}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[12px] font-medium text-slate-600">
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
                  <ul className={`min-h-0 flex-1 space-y-px ${expanded ? "overflow-visible" : "overflow-y-auto"}`}>
                    {entriesByCategory[c.key]?.map((e) => (
                      <DraggableEntryItem
                        key={e.id}
                        entry={e}
                        isEditing={editingId === e.id}
                        isNew={isNewEntry(e.created_at)}
                        isMoved={isRecentlyMoved(e.id)}
                        isInvalidFormat={!hasValidMileageFormat(e.content, c.key, healthGoalUnit, c.unit)}
                      >
                        {editingId === e.id ? (
                          <>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <select
                                value={editCategory}
                                onChange={(ev) => setEditCategory(ev.target.value)}
                                className="w-full max-w-[140px] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-800"
                              >
                                {displayCategories.map((cat) => (
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
                            <span
                              className={`min-w-0 flex-1 line-clamp-2 whitespace-pre-wrap ${
                                !hasValidMileageFormat(e.content, c.key, healthGoalUnit, c.unit) ? "text-slate-500" : "text-slate-700"
                              }`}
                              title={!hasValidMileageFormat(e.content, c.key, healthGoalUnit, c.unit) ? "기록합산 불가, 적절한 양식으로 수정요망." : undefined}
                            >
                              {!hasValidMileageFormat(e.content, c.key, healthGoalUnit, c.unit) ? `⚠️ ${e.content}` : e.content}
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

        {/* 페이지 맨 하단: 일일 성찰 카드 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/40 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-violet-100 p-2 text-violet-600">
                <NotebookPen className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">일일성찰 기록</h2>
                <p className="text-[11px] text-slate-500">날짜별로 자동 정렬됩니다. (수정/삭제 가능)</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              {dailyReflections.length.toLocaleString()}개
            </span>
          </div>

          {dailyReflections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 p-3 text-center text-xs text-slate-500">
              아직 일일성찰 기록이 없습니다. 위에서 <span className="font-semibold text-slate-700">일일성찰기록</span>을 선택하고 작성해 보세요.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/70">
              <div className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 border-b border-slate-200/80 bg-slate-50/60 px-3 py-2 text-[11px] font-semibold text-slate-600">
                <div>날짜</div>
                <div>내용</div>
                <div className="text-right">관리</div>
              </div>
              <ul className="divide-y divide-slate-200/70">
                {sortDailyReflections(dailyReflections).map((e) => {
                  const pretty = formatYyMmDdWithWeekday(e.date);
                  const isEditing = editingDailyId === e.id;
                  return (
                    <li key={e.id} className="px-3 py-2">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={editDailyDate}
                              onChange={(ev) => setEditDailyDate(ev.target.value)}
                              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800"
                            />
                            <div className="flex flex-1 items-center justify-end gap-2">
                              <Button type="button" size="sm" onClick={handleEditDailySave} className="rounded-full px-4 text-xs">
                                저장
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={handleEditDailyCancel} className="rounded-full px-4 text-xs">
                                취소
                              </Button>
                            </div>
                          </div>
                          <textarea
                            value={editDailyContent}
                            onChange={(ev) => setEditDailyContent(ev.target.value)}
                            className="min-h-[3.2rem] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                            rows={2}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-[7.5rem_1fr_3rem] items-start gap-2">
                          <div className="text-[11px] font-semibold text-slate-700">
                            {pretty || e.date}
                          </div>
                          <div className="min-w-0 text-sm text-slate-800 whitespace-pre-wrap break-words">
                            {e.content}
                          </div>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditDailyStart(e)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              title="수정"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDailyReflection(e.id)}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                              title="삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
