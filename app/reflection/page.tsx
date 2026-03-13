"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CardPageHeader } from "@/components/CardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/lib/supabaseClient";
import { FileDown, MessageCircle, Printer, Save, Sparkles } from "lucide-react";

const SELF_EVAL_PERIOD = "2026년 3월 1일부터 2027년 2월 28일까지(학년도 단위)";
type SelfEvalRating = "" | "만족" | "보통" | "미흡";
const SELF_EVAL_RATINGS: SelfEvalRating[] = ["만족", "보통", "미흡"];

interface SelfEvalFormState {
  affiliation: string;
  position: string;
  evaluatorName: string;
  gradeClass: string;
  subject: string;
  isHomeroom: string;
  assignedDuties: string;
  isPositionTeacher: string;
  hoursPerWeek: string;
  openClassResult: string;
  studentCounselResult: string;
  parentCounselResult: string;
  otherResult: string;
  learningGoal: string;
  learningResult: string;
  lifeGoal: string;
  lifeResult: string;
  professionalGoal: string;
  professionalResult: string;
  dutyGoal: string;
  dutyResult: string;
  creativeImprovement: string;
  goalAchievement: SelfEvalRating;
  creativity: SelfEvalRating;
  timeliness: SelfEvalRating;
  effort: SelfEvalRating;
  preparerName: string;
  signature: string;
  dateYear: string;
  dateMonth: string;
  dateDay: string;
}

const initialSelfEvalForm: SelfEvalFormState = {
  affiliation: "초등학교",
  position: "교사",
  evaluatorName: "",
  gradeClass: "",
  subject: "",
  isHomeroom: "",
  assignedDuties: "",
  isPositionTeacher: "",
  hoursPerWeek: "",
  openClassResult: "",
  studentCounselResult: "",
  parentCounselResult: "",
  otherResult: "",
  learningGoal: "",
  learningResult: "",
  lifeGoal: "",
  lifeResult: "",
  professionalGoal: "",
  professionalResult: "",
  dutyGoal: "",
  dutyResult: "",
  creativeImprovement: "",
  goalAchievement: "",
  creativity: "",
  timeliness: "",
  effort: "",
  preparerName: "",
  signature: "",
  dateYear: "",
  dateMonth: "",
  dateDay: "",
};

const CATEGORY_LABELS: Record<string, string> = {
  training: "연수(직무·자율)",
  class_open: "수업 공개",
  community: "교원학습 공동체",
  book_edutech: "전문 서적/에듀테크",
  health: "건강/체력",
  other: "기타",
};

function formatPlanSummary(plan: Record<string, unknown> | null, categories?: { key: string; label: string; unit: string }[]): string {
  if (!plan) return "계획서가 없습니다.";
  const labels: Record<string, string> = categories?.length === 6
    ? Object.fromEntries(categories.map((c) => [c.key, c.label]))
    : { training: "연수(직무·자율)", class_open: "수업 공개", community: "교원학습 공동체", book_edutech: "전문 서적/에듀테크", health: "건강/체력", other: "기타" };
  const units: Record<string, string> = categories?.length === 6
    ? Object.fromEntries(categories.map((c) => [c.key, c.unit]))
    : { training: "시간", class_open: "회", community: "회", book_edutech: "회", health: "시간", other: "건" };
  if (categories?.length === 6 && (plan.education_annual_goal_unit as string) === "거리") units.health = "km";
  const lines: string[] = [];
  const goal = (plan.development_goal as string)?.trim();
  if (goal) lines.push("[자기역량 개발 목표]\n" + goal);
  const annual = (plan.annual_goal as string)?.trim();
  const expense = (plan.expense_annual_goal as string)?.trim();
  const community = (plan.community_annual_goal as string)?.trim();
  const book = (plan.book_annual_goal as string)?.trim();
  const education = (plan.education_annual_goal as string)?.trim();
  const other = (plan.other_annual_goal as string)?.trim();
  if (annual || expense || community || book || education || other) {
    lines.push("\n[연간 목표]");
    if (annual) lines.push("- " + (labels.training ?? "연수") + ": " + annual + " " + (units.training ?? "시간"));
    if (expense) lines.push("- " + (labels.class_open ?? "수업 공개") + ": " + expense + " " + (units.class_open ?? "회"));
    if (community) lines.push("- " + (labels.community ?? "교원학습 공동체") + ": " + community + " " + (units.community ?? "회"));
    if (book) lines.push("- " + (labels.book_edutech ?? "전문 서적/에듀테크") + ": " + book + " " + (units.book_edutech ?? "회"));
    if (education) lines.push("- " + (labels.health ?? "건강/체력") + ": " + education + " " + ((plan.education_annual_goal_unit as string) || units.health || "시간"));
    if (other) lines.push("- " + (labels.other ?? "기타") + ": " + other + " " + (units.other ?? "건"));
  }
  const trainingPlans = (plan.training_plans as { name?: string; period?: string; duration?: string; remarks?: string }[]) ?? [];
  if (trainingPlans.length > 0) {
    lines.push("\n[" + (labels.training ?? "연수(직무·자율)") + " 계획]");
    trainingPlans.forEach((r) => {
      if (r?.name?.trim()) lines.push(`- ${r.name} (${r.period ?? ""}, ${r.duration ?? ""}) ${r.remarks ?? ""}`);
    });
  }
  const bookPlans = (plan.book_plans as { title?: string; period?: string; method?: string }[]) ?? [];
  if (bookPlans.length > 0) {
    lines.push("\n[" + (labels.book_edutech ?? "전문 서적/에듀테크") + " 계획]");
    bookPlans.forEach((r) => {
      if (r?.title?.trim()) lines.push(`- ${r.title} (${r.period ?? ""}) ${r.method ?? ""}`);
    });
  }
  const expenseRequests = (plan.expense_requests as { activity?: string; period?: string; method?: string }[]) ?? [];
  if (expenseRequests.length > 0) {
    lines.push("\n[" + (labels.class_open ?? "수업 공개") + " 계획]");
    expenseRequests.forEach((r) => {
      if (r?.activity?.trim()) lines.push(`- ${r.activity} (${r.period ?? ""}) ${r.method ?? ""}`);
    });
  }
  const communityPlans = (plan.community_plans as { activity?: string; period?: string; method?: string }[]) ?? [];
  if (communityPlans.length > 0) {
    lines.push("\n[" + (labels.community ?? "교원학습 공동체") + " 계획]");
    communityPlans.forEach((r) => {
      if (r?.activity?.trim()) lines.push(`- ${r.activity} (${r.period ?? ""}) ${r.method ?? ""}`);
    });
  }
  const educationPlans = (plan.education_plans as { area?: string; period?: string; duration?: string }[]) ?? [];
  if (educationPlans.length > 0) {
    lines.push("\n[" + (labels.health ?? "건강/체력") + " 계획]");
    educationPlans.forEach((r) => {
      if (r?.area?.trim()) lines.push(`- ${r.area} (${r.period ?? ""}, ${r.duration ?? ""})`);
    });
  }
  const otherPlans = (plan.other_plans as { text?: string }[]) ?? [];
  if (otherPlans.length > 0) {
    lines.push("\n[" + (labels.other ?? "기타") + " 계획]");
    otherPlans.forEach((r) => {
      if (r?.text?.trim()) lines.push("- " + r.text);
    });
  }
  return lines.length ? lines.join("\n") : "계획서에 작성된 내용이 없습니다.";
}

export default function ReflectionPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [planSummary, setPlanSummary] = useState("");
  const [mileageText, setMileageText] = useState("");
  const [goalAchievementText, setGoalAchievementText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [reflectionText, setReflectionText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [nextYearGoalText, setNextYearGoalText] = useState("");
  const [reflectionAiLoading, setReflectionAiLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState<{ [key: string]: "idle" | "saving" | "saved" }>({});
  const [extraInputs, setExtraInputs] = useState({
    learning_goal: "",
    learning_result: "",
    life_goal: "",
    life_result: "",
    duty_goal: "",
    duty_result: "",
    creative_improvement: "",
  });
  const [selfEvalForm, setSelfEvalForm] = useState<SelfEvalFormState>(initialSelfEvalForm);
  const [selfEvalAiLoading, setSelfEvalAiLoading] = useState(false);
  const saveDraftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveEvidenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNextYearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const lastSavedSelfEvalRef = useRef<string | null>(null);

  useEffect(() => {
    const check = async () => {
      await supabase.auth.refreshSession();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.replace("/");
        return;
      }
      const role = (user.user_metadata as { role?: string })?.role;
      // 관리자는 교원 권한도 가집니다
      if (role !== "teacher" && role !== "admin") {
        router.replace("/");
        return;
      }
      setUserEmail(user.email ?? null);
      let schoolCategories: { key: string; label: string; unit: string }[] = [];
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const res = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${session.access_token}` } });
          if (res.ok) {
            const j = await res.json();
            if (Array.isArray(j.categories)) schoolCategories = j.categories;
          }
        } catch {
          // ignore
        }
      }
      const { data: planRow } = await supabase
        .from("development_plans")
        .select("*")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPlanSummary(formatPlanSummary(planRow as Record<string, unknown> | null, schoolCategories.length === 6 ? schoolCategories : undefined));
      const categoryLabels: Record<string, string> = schoolCategories.length === 6
        ? Object.fromEntries(schoolCategories.map((c) => [c.key, c.label]))
        : CATEGORY_LABELS;
      const { data: mileageData, error: mileageError } = await supabase
        .from("mileage_entries")
        .select("content, category, created_at")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false });
      if (mileageError) {
        setMileageText("마일리지를 불러오는데 실패했습니다.");
      } else {
        const lines = (mileageData ?? []).map(
          (r: { content?: string; category?: string; created_at?: string }) =>
            `[${categoryLabels[r.category ?? ""] ?? r.category ?? ""}] ${r.content ?? ""} (${r.created_at ? (() => { const d = new Date(r.created_at); return `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; })() : ""})`
        );
        setMileageText(lines.join("\n\n") || "마일리지에 기록된 내용이 없습니다.");
      }
      try {
        const emailKey = user.email ?? "";
        const { data: draftRow } = await supabase
          .from("reflection_drafts")
          .select("goal_achievement_text, reflection_text")
          .eq("user_email", emailKey)
          .maybeSingle();
        if (draftRow && ((draftRow.goal_achievement_text as string) || (draftRow.reflection_text as string))) {
          setGoalAchievementText((draftRow.goal_achievement_text as string) ?? "");
          setReflectionText((draftRow.reflection_text as string) ?? "");
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("teacher_mate_goal_achievement_" + emailKey, (draftRow.goal_achievement_text as string) ?? "");
              localStorage.setItem("teacher_mate_reflection_text_" + emailKey, (draftRow.reflection_text as string) ?? "");
            } catch (_) {}
          }
        } else {
          const savedGoal = typeof window !== "undefined" ? localStorage.getItem("teacher_mate_goal_achievement_" + emailKey) : null;
          const savedReflection = typeof window !== "undefined" ? localStorage.getItem("teacher_mate_reflection_text_" + emailKey) : null;
          if (savedGoal != null && savedGoal !== "") setGoalAchievementText(savedGoal);
          if (savedReflection != null) setReflectionText(savedReflection ?? "");
          if ((savedGoal ?? "") !== "" || (savedReflection ?? "") !== "") {
            void supabase.from("reflection_drafts").upsert(
              { user_email: emailKey, goal_achievement_text: savedGoal ?? "", reflection_text: savedReflection ?? "", updated_at: new Date().toISOString() },
              { onConflict: "user_email" }
            ).then(() => {}, () => {});
          }
        }
        const { data: evidenceRow } = await supabase
          .from("user_preferences")
          .select("pref_value")
          .eq("user_email", emailKey)
          .eq("pref_key", "reflection_evidence_text")
          .maybeSingle();
        if (evidenceRow?.pref_value != null) setEvidenceText(String(evidenceRow.pref_value));
        const { data: nextYearRow } = await supabase
          .from("user_preferences")
          .select("pref_value")
          .eq("user_email", emailKey)
          .eq("pref_key", "reflection_next_year_goal")
          .maybeSingle();
        if (nextYearRow?.pref_value != null) setNextYearGoalText(String(nextYearRow.pref_value));
        const { data: extraRow } = await supabase
          .from("user_preferences")
          .select("pref_value")
          .eq("user_email", emailKey)
          .eq("pref_key", "reflection_extra_inputs")
          .maybeSingle();
        if (extraRow?.pref_value != null) {
          try {
            const parsed = JSON.parse(String(extraRow.pref_value)) as Record<string, string>;
            setExtraInputs((prev) => ({
              ...prev,
              learning_goal: parsed.learning_goal ?? "",
              learning_result: parsed.learning_result ?? "",
              life_goal: parsed.life_goal ?? "",
              life_result: parsed.life_result ?? "",
              duty_goal: parsed.duty_goal ?? "",
              duty_result: parsed.duty_result ?? "",
              creative_improvement: parsed.creative_improvement ?? "",
            }));
          } catch (_) {}
        }
        const { data: selfEvalRow } = await supabase
          .from("user_preferences")
          .select("pref_value")
          .eq("user_email", emailKey)
          .eq("pref_key", "reflection_self_eval_form")
          .maybeSingle();
        if (selfEvalRow?.pref_value != null) {
          try {
            const parsed = JSON.parse(String(selfEvalRow.pref_value)) as Partial<SelfEvalFormState>;
            const merged = { ...initialSelfEvalForm, ...parsed };
            setSelfEvalForm(merged);
            lastSavedSelfEvalRef.current = JSON.stringify(merged);
          } catch (_) {}
        }
      } catch (_) {}
      setIsChecking(false);
    };
    check();
  }, [router]);

  useEffect(() => {
    if (!userEmail || goalAchievementText === undefined) return;
    try {
      localStorage.setItem("teacher_mate_goal_achievement_" + userEmail, goalAchievementText);
    } catch (_) {}
    hasUnsavedChangesRef.current = true;
  }, [userEmail, goalAchievementText]);

  useEffect(() => {
    if (!userEmail) return;
    try {
      localStorage.setItem("teacher_mate_reflection_text_" + userEmail, reflectionText);
    } catch (_) {}
    hasUnsavedChangesRef.current = true;
  }, [userEmail, reflectionText]);

  useEffect(() => {
    if (!userEmail) return;
    if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
    saveDraftTimeoutRef.current = setTimeout(() => {
      saveDraftTimeoutRef.current = null;
      supabase.from("reflection_drafts").upsert(
        { user_email: userEmail, goal_achievement_text: goalAchievementText, reflection_text: reflectionText, updated_at: new Date().toISOString() },
        { onConflict: "user_email" }
      ).then(() => {
        hasUnsavedChangesRef.current = false;
      }, () => {});
    }, 800);
    return () => { if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current); };
  }, [userEmail, goalAchievementText, reflectionText]);

  useEffect(() => {
    if (!userEmail || typeof window === "undefined") return;
    const saveToServer = () => {
      supabase.from("reflection_drafts").upsert(
        { user_email: userEmail, goal_achievement_text: goalAchievementText, reflection_text: reflectionText, updated_at: new Date().toISOString() },
        { onConflict: "user_email" }
      ).then(() => {
        hasUnsavedChangesRef.current = false;
      }, () => {});
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") saveToServer(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = "";
        saveToServer();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [userEmail, goalAchievementText, reflectionText]);

  useEffect(() => {
    if (!userEmail) return;
    if (saveEvidenceTimeoutRef.current) clearTimeout(saveEvidenceTimeoutRef.current);
    saveEvidenceTimeoutRef.current = setTimeout(() => {
      saveEvidenceTimeoutRef.current = null;
      supabase.from("user_preferences").upsert(
        { user_email: userEmail, pref_key: "reflection_evidence_text", pref_value: evidenceText, updated_at: new Date().toISOString() },
        { onConflict: "user_email,pref_key" }
      ).then(() => {
        hasUnsavedChangesRef.current = false;
      }, () => {});
    }, 800);
    return () => { if (saveEvidenceTimeoutRef.current) clearTimeout(saveEvidenceTimeoutRef.current); };
  }, [userEmail, evidenceText]);

  useEffect(() => {
    if (!userEmail) return;
    if (saveNextYearTimeoutRef.current) clearTimeout(saveNextYearTimeoutRef.current);
    saveNextYearTimeoutRef.current = setTimeout(() => {
      saveNextYearTimeoutRef.current = null;
      supabase.from("user_preferences").upsert(
        { user_email: userEmail, pref_key: "reflection_next_year_goal", pref_value: nextYearGoalText, updated_at: new Date().toISOString() },
        { onConflict: "user_email,pref_key" }
      ).then(() => {
        hasUnsavedChangesRef.current = false;
      }, () => {});
    }, 800);
    return () => { if (saveNextYearTimeoutRef.current) clearTimeout(saveNextYearTimeoutRef.current); };
  }, [userEmail, nextYearGoalText]);

  const generateReport = async () => {
    if (!planSummary.trim() && !mileageText.trim()) {
      alert("계획서 또는 마일리지 내용이 있어야 AI 보고서를 생성할 수 있습니다.");
      return;
    }
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "result_report", planSummary, mileageText }),
      });
      const json = await res.json();
      if (res.ok && json.recommendation) {
        const text = json.recommendation;
        setGoalAchievementText(text);
        if (userEmail && typeof window !== "undefined") {
          try { localStorage.setItem("teacher_mate_goal_achievement_" + userEmail, text); } catch (_) {}
        }
        await supabase.from("reflection_drafts").upsert(
          { user_email: userEmail!, goal_achievement_text: text, reflection_text: reflectionText, updated_at: new Date().toISOString() },
          { onConflict: "user_email" }
        );
      } else {
        const msg = json?.code === "QUOTA_EXCEEDED" ? json.error : ("보고서 생성에 실패했습니다. " + (json?.error || ""));
        setGoalAchievementText(msg);
      }
    } catch (e) {
      console.error(e);
      setGoalAchievementText("보고서 생성 중 오류가 발생했습니다.");
    } finally {
      setAiLoading(false);
    }
  };

  const generateReflectionSummary = async () => {
    if (!userEmail) {
      alert("로그인이 필요합니다.");
      return;
    }

    let reflectionsData: Array<{ date: string; content: string }> = [];
    try {
      const { data, error } = await supabase
        .from("daily_reflections")
        .select("reflection_date, content")
        .eq("user_email", userEmail)
        .order("reflection_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("일일성찰기록 로드 오류:", error);
        alert("일일성찰 기록을 불러오는 중 오류가 발생했습니다.");
        return;
      }

      reflectionsData = (data || [])
        .filter((r) => r?.content?.trim())
        .map((r) => ({
          date: r.reflection_date,
          content: r.content,
        }));
    } catch (err) {
      console.error("일일성찰기록 로드 중 오류:", err);
      alert("일일성찰 기록을 불러오는 중 오류가 발생했습니다.");
      return;
    }

    if (reflectionsData.length === 0) {
      alert("일일성찰 기록이 없습니다. 마일리지 페이지에서 일일성찰 기록을 작성해 주세요.");
      return;
    }
    const reflectionsText = reflectionsData
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((r) => {
        const d = new Date(r.date);
        const dateStr = `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
        return `[${dateStr}] ${r.content}`;
      })
      .join("\n\n");
    setReflectionAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("로그인이 필요합니다.");
        setReflectionAiLoading(false);
        return;
      }
      const res = await fetch("/api/ai-summarize-reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reflections: reflectionsText }),
      });
      const json = await res.json();
      if (res.ok && json.summary) {
        setReflectionText(json.summary);
        if (userEmail && typeof window !== "undefined") {
          try { localStorage.setItem("teacher_mate_reflection_text_" + userEmail, json.summary); } catch (_) {}
        }
        await supabase.from("reflection_drafts").upsert(
          { user_email: userEmail, goal_achievement_text: goalAchievementText, reflection_text: json.summary, updated_at: new Date().toISOString() },
          { onConflict: "user_email" }
        );
        hasUnsavedChangesRef.current = false;
      } else {
        alert("성찰 요약 생성에 실패했습니다. " + (json.error || ""));
      }
    } catch (e) {
      console.error(e);
      alert("성찰 요약 생성 중 오류가 발생했습니다.");
    } finally {
      setReflectionAiLoading(false);
    }
  };

  const saveGoalAchievementAndReflection = async () => {
    if (!userEmail) return;
    setSavingStatus((prev) => ({ ...prev, report: "saving" }));
    try {
      await supabase.from("reflection_drafts").upsert(
        { user_email: userEmail, goal_achievement_text: goalAchievementText, reflection_text: reflectionText, updated_at: new Date().toISOString() },
        { onConflict: "user_email" }
      );
      await supabase.from("user_preferences").upsert(
        { user_email: userEmail, pref_key: "reflection_extra_inputs", pref_value: JSON.stringify(extraInputs), updated_at: new Date().toISOString() },
        { onConflict: "user_email,pref_key" }
      );
      if (userEmail && typeof window !== "undefined") {
        try {
          localStorage.setItem("teacher_mate_goal_achievement_" + userEmail, goalAchievementText);
          localStorage.setItem("teacher_mate_reflection_text_" + userEmail, reflectionText);
        } catch (_) {}
      }
      hasUnsavedChangesRef.current = false;
      setSavingStatus((prev) => ({ ...prev, report: "saved" }));
      setTimeout(() => setSavingStatus((prev) => ({ ...prev, report: "idle" })), 2000);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
      setSavingStatus((prev) => ({ ...prev, report: "idle" }));
    }
  };

  const saveSelfEvalForm = async () => {
    if (!userEmail) return;
    setSavingStatus((prev) => ({ ...prev, evidence: "saving" }));
    try {
      await supabase.from("user_preferences").upsert(
        { user_email: userEmail, pref_key: "reflection_self_eval_form", pref_value: JSON.stringify(selfEvalForm), updated_at: new Date().toISOString() },
        { onConflict: "user_email,pref_key" }
      );
      lastSavedSelfEvalRef.current = JSON.stringify(selfEvalForm);
      hasUnsavedChangesRef.current = false;
      setSavingStatus((prev) => ({ ...prev, evidence: "saved" }));
      setTimeout(() => setSavingStatus((prev) => ({ ...prev, evidence: "idle" })), 2000);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
      setSavingStatus((prev) => ({ ...prev, evidence: "idle" }));
    }
  };

  useEffect(() => {
    const current = JSON.stringify(selfEvalForm);
    if (lastSavedSelfEvalRef.current === null) {
      lastSavedSelfEvalRef.current = current;
    } else if (current !== lastSavedSelfEvalRef.current) {
      hasUnsavedChangesRef.current = true;
    }
  }, [selfEvalForm]);

  const openSelfEvalPrint = () => {
    const f = selfEvalForm;
    const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const blockLines = (s: string) => String(s ?? "").trim().split(/\r?\n/).filter((l) => l.trim()).map((l) => `<p class="bul">- ${esc(l.trim())}</p>`).join("") || "<p class=\"bul\">- </p>";
    const homeroomLabel = f.isHomeroom === "예" ? "담임교사" : f.isHomeroom === "아니오" ? "해당 없음" : esc(f.isHomeroom);
    const positionLabel = f.isPositionTeacher === "예" ? "보직교사" : f.isPositionTeacher === "아니오" ? "해당 없음" : esc(f.isPositionTeacher);
    const sel = (val: string, opt: string) => (val === opt ? "○" : "");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>교사 자기실적평가서</title><style>
      body{font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;font-size:11px;line-height:1.4;max-width:700px;margin:20px auto;padding:18px;color:#000;}
      .outer{border:3px solid #000;padding:20px;}
      .sub{font-size:10px;color:#333;margin-bottom:4px;}
      h1{text-align:center;font-size:16px;font-weight:bold;margin:0 0 16px 0;}
      .sec{margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #000;}
      .sec:last-of-type{border-bottom:none;}
      .sec h2{font-size:11px;font-weight:bold;margin:0 0 6px 0;}
      .sec p{margin:2px 0;}
      .bul{margin:2px 0 2px 16px;padding:0;}
      .twocol{display:flex;gap:0;border:1px solid #000;}
      .twocol .col{flex:1;padding:8px 10px;border-right:1px solid #000;}
      .twocol .col:last-child{border-right:none;}
      .twocol .row{margin:4px 0;}
      .eval-item{margin:10px 0 6px 0;}
      .eval-item .tit{font-weight:bold;margin-bottom:4px;}
      .eval-item .cap{margin:4px 0 2px 0;}
      table.rating{border-collapse:collapse;width:100%;margin:8px 0;font-size:10px;}
      table.rating th,table.rating td{border:1px solid #000;padding:4px 6px;vertical-align:middle;}
      table.rating th{background:#f5f5f5;}
      table.rating .col-group{width:42px;text-align:center;font-weight:bold;}
      table.rating .col-item{width:90px;}
      table.rating .col-desc{min-width:180px;}
      table.rating .col-opt{width:42px;text-align:center;}
      .footer{margin-top:20px;padding-top:14px;}
      .footer-date{margin-bottom:10px;text-align:right;}
      .footer-row{display:flex;align-items:center;flex-wrap:wrap;gap:4px 0;}
      .footer .label{font-weight:normal;}
      .footer .line{display:inline-block;min-width:100px;border-bottom:1px solid #000;margin-left:4px;}
      @media print{ @page{size:A4;margin:12mm;} }
    </style></head><body><div class="outer">
      <p class="sub">교육공무원 승진규정 [별지 제3호의2서식]</p>
      <h1>교사 자기실적평가서</h1>
      <div class="sec">
        <h2>1. 평가 지침</h2>
        <p>근무성적평정의 신뢰성과 타당성이 보장되도록 객관적 근거에 따라 종합적으로 평가하여야 한다.</p>
      </div>
      <div class="sec">
        <h2>2. 평가 기간:</h2>
        <p>${esc(SELF_EVAL_PERIOD)}</p>
      </div>
      <div class="sec">
        <h2>3. 평가자 인적사항</h2>
        <p>○ 소속: ${esc(f.affiliation)} &nbsp; ○ 직위: ${esc(f.position)} &nbsp; ○ 성명: ${esc(f.evaluatorName)}</p>
      </div>
      <div class="sec">
        <h2>4. 평가자 기초 자료</h2>
        <div class="twocol">
          <div class="col">
            <div class="row">○ 담당 학년 및 학급: ${esc(f.gradeClass)}</div>
            <div class="row">○ 담당 과목: ${esc(f.subject)}</div>
            <div class="row">○ 담임 여부: ${homeroomLabel}</div>
            <div class="row">○ 담당 업무: ${esc(f.assignedDuties)}</div>
            <div class="row">○ 보직교사 여부: ${positionLabel}</div>
            <div class="row">○ 주당 수업시간 수: ${esc(f.hoursPerWeek)}</div>
          </div>
          <div class="col">
            <div class="row">○ 연간 수업공개 실적: ${esc(f.openClassResult)}</div>
            <div class="row">○ 연간 학생 상담 실적: ${esc(f.studentCounselResult)}</div>
            <div class="row">○ 연간 학부모 상담 실적: ${esc(f.parentCounselResult)}</div>
            <div class="row">○ 그 밖의 실적 사항: ${esc(f.otherResult)}</div>
          </div>
        </div>
      </div>
      <div class="sec">
        <h2>5. 자기실적 평가</h2>
        <div class="eval-item">
          <p class="tit">가. 학습지도</p>
          <p class="cap">○ 학습지도 추진 목표(학년 초에 계획되었던 학습지도 목표)</p>
          ${blockLines(f.learningGoal)}
          <p class="cap">○ 학습지도 추진 실적(학년 초에 목표한 내용과 대비하여 추진 실적을 구체적으로 작성)</p>
          ${blockLines(f.learningResult)}
        </div>
        <div class="eval-item">
          <p class="tit">나. 생활지도</p>
          <p class="cap">○ 생활지도 추진 목표</p>
          ${blockLines(f.lifeGoal)}
          <p class="cap">○ 생활지도 추진 실적</p>
          ${blockLines(f.lifeResult)}
        </div>
        <div class="eval-item">
          <p class="tit">다. 전문성계발</p>
          <p class="cap">○ 전문성개발 추진 목표:</p>
          ${blockLines(f.professionalGoal)}
          <p class="cap">○ 전문성개발 추진 실적:</p>
          ${blockLines(f.professionalResult)}
        </div>
        <div class="eval-item">
          <p class="tit">라. 담당 업무</p>
          <p class="cap">○ 담당 업무 추진 목표:</p>
          ${blockLines(f.dutyGoal)}
          <p class="cap">○ 담당 업무 추진 실적:</p>
          ${blockLines(f.dutyResult)}
          <p class="cap">○ 창의적 업무개선 사항:</p>
          ${blockLines(f.creativeImprovement)}
        </div>
      </div>
      <div class="sec">
        <h2>※ 자기 평가 종합 상황</h2>
        <table class="rating">
          <thead>
            <tr><th class="col-group"></th><th class="col-item">평가 항목</th><th class="col-desc">세부 내용</th><th class="col-opt">만족</th><th class="col-opt">보통</th><th class="col-opt">미흡</th></tr>
          </thead>
          <tbody>
            <tr><td class="col-group" rowspan="4">자기<br>평가</td><td class="col-item">목표달성도</td><td class="col-desc">설정한 목표에 대한 달성 정도</td><td class="col-opt">${sel(f.goalAchievement,"만족")}</td><td class="col-opt">${sel(f.goalAchievement,"보통")}</td><td class="col-opt">${sel(f.goalAchievement,"미흡")}</td></tr>
            <tr><td class="col-item">창의성</td><td class="col-desc">학습지도, 생활지도, 전문성계발, 담당 업무 등의 창의적인 수행 정도</td><td class="col-opt">${sel(f.creativity,"만족")}</td><td class="col-opt">${sel(f.creativity,"보통")}</td><td class="col-opt">${sel(f.creativity,"미흡")}</td></tr>
            <tr><td class="col-item">적시성</td><td class="col-desc">학습지도, 생활지도, 전문성계발, 담당 업무 등을 기한 내에 효과적으로 처리한 정도</td><td class="col-opt">${sel(f.timeliness,"만족")}</td><td class="col-opt">${sel(f.timeliness,"보통")}</td><td class="col-opt">${sel(f.timeliness,"미흡")}</td></tr>
            <tr><td class="col-item">노력도</td><td class="col-desc">목표 달성을 위한 노력, 공헌도</td><td class="col-opt">${sel(f.effort,"만족")}</td><td class="col-opt">${sel(f.effort,"보통")}</td><td class="col-opt">${sel(f.effort,"미흡")}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="sec footer">
        <div class="footer-date">${esc(f.dateYear)}년 ${esc(f.dateMonth)}월 ${esc(f.dateDay)}일</div>
        <div class="footer-row">
          <span class="label">작성자(본인) 성명</span><span class="line">${esc(f.preparerName)}</span>
          <span class="label" style="margin-left:20px">서명(인)</span><span class="line"></span>
        </div>
      </div>
    </div></body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      alert("팝업이 차단되었을 수 있습니다. 브라우저에서 팝업을 허용해 주세요.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.onafterprint = () => w.close();
    }, 300);
  };

  const generateSelfEvalSections = async () => {
    const missing: string[] = [];
    if (!selfEvalForm.gradeClass?.trim()) missing.push("담당 학년 및 학급");
    if (!selfEvalForm.isHomeroom) missing.push("담임 여부");
    if (!selfEvalForm.isPositionTeacher) missing.push("보직교사 여부");
    if (!selfEvalForm.assignedDuties?.trim()) missing.push("담당 업무");
    if (missing.length > 0) {
      alert("정보가 부족해서 AI로 작성해 드리기 어렵습니다.\n다음 항목을 먼저 기입해 주세요.\n\n· " + missing.join("\n· "));
      return;
    }
    setSelfEvalAiLoading(true);
    try {
      const { data: { session: selfEvalSession } } = await supabase.auth.getSession();
      const selfEvalToken = selfEvalSession?.access_token;
      if (!selfEvalToken) {
        alert("로그인이 필요합니다.");
        return;
      }
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${selfEvalToken}` },
        body: JSON.stringify({
          type: "self_eval_sections",
          planSummary,
          mileageText,
          context: {
            affiliation: selfEvalForm.affiliation,
            position: selfEvalForm.position,
            evaluatorName: selfEvalForm.evaluatorName,
            gradeClass: selfEvalForm.gradeClass,
            subject: selfEvalForm.subject,
            isHomeroom: selfEvalForm.isHomeroom,
            assignedDuties: selfEvalForm.assignedDuties,
            isPositionTeacher: selfEvalForm.isPositionTeacher,
            hoursPerWeek: selfEvalForm.hoursPerWeek,
            openClassResult: selfEvalForm.openClassResult,
            studentCounselResult: selfEvalForm.studentCounselResult,
            parentCounselResult: selfEvalForm.parentCounselResult,
            otherResult: selfEvalForm.otherResult,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.learningGoal != null) {
        setSelfEvalForm((prev) => ({
          ...prev,
          learningGoal: data.learningGoal ?? prev.learningGoal,
          learningResult: data.learningResult ?? prev.learningResult,
          lifeGoal: data.lifeGoal ?? prev.lifeGoal,
          lifeResult: data.lifeResult ?? prev.lifeResult,
          professionalGoal: data.professionalGoal ?? prev.professionalGoal,
          professionalResult: data.professionalResult ?? prev.professionalResult,
          dutyGoal: data.dutyGoal ?? prev.dutyGoal,
          dutyResult: data.dutyResult ?? prev.dutyResult,
        }));
      } else {
        alert(data?.error ?? "AI 작성에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("AI 작성 중 오류가 발생했습니다.");
    } finally {
      setSelfEvalAiLoading(false);
    }
  };

  const saveNextYearGoal = async () => {
    if (!userEmail) return;
    setSavingStatus((prev) => ({ ...prev, nextYear: "saving" }));
    try {
      await supabase.from("user_preferences").upsert(
        { user_email: userEmail, pref_key: "reflection_next_year_goal", pref_value: nextYearGoalText, updated_at: new Date().toISOString() },
        { onConflict: "user_email,pref_key" }
      );
      hasUnsavedChangesRef.current = false;
      setSavingStatus((prev) => ({ ...prev, nextYear: "saved" }));
      setTimeout(() => setSavingStatus((prev) => ({ ...prev, nextYear: "idle" })), 2000);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
      setSavingStatus((prev) => ({ ...prev, nextYear: "idle" }));
    }
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">확인 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-violet-50/30 px-4 py-4">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardPageHeader
              icon={<MessageCircle className="h-6 w-6" />}
              title="자기역량 개발 결과 보고서 작성 기초 정보"
              subtitle="교사 성찰 기록장 · 성장의 결과를 서식에 맞게 작성하여 자기역량 개발 결과 보고서를 완성합니다."
            />
          </div>
          <Link href="/reflection/result-report" className="shrink-0" onClick={(e) => { if (hasUnsavedChangesRef.current && !window.confirm("저장하지 않고 페이지를 나가시겠습니까?\n나가시면 입력한 내용이 저장되지 않을 수 있습니다.")) e.preventDefault(); }}>
            <Button type="button" size="sm" className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white shadow-sm hover:opacity-90">보고서 만들기</Button>
          </Link>
        </div>
        <Tabs defaultValue="goals" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-5 rounded-xl bg-slate-100 p-1">
            <TabsTrigger value="goals" className="rounded-lg text-sm font-medium">나의 목표</TabsTrigger>
            <TabsTrigger value="report" className="rounded-lg text-sm font-medium">정량 목표 달성도</TabsTrigger>
            <TabsTrigger value="reflection" className="rounded-lg text-sm font-medium">성찰</TabsTrigger>
            <TabsTrigger value="nextYear" className="rounded-lg text-sm font-medium">내년 목표</TabsTrigger>
            <TabsTrigger value="evidence" className="rounded-lg text-sm font-medium">(구)자기실적 평가서</TabsTrigger>
          </TabsList>
          <TabsContent value="goals" className="mt-0 space-y-4">
            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-800">나의 목표</h2>
              <p className="mt-1 text-xs text-slate-500">계획서에 작성한 목표와 내용을 불러와 정리합니다.</p>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-700">{planSummary}</pre>
            </Card>
          </TabsContent>
          <TabsContent value="report" className="mt-0 space-y-4">
            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-800">정량 목표 달성도</h2>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-90" onClick={generateReport} disabled={aiLoading}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {aiLoading ? "작성 중..." : goalAchievementText.trim() ? "AI 어시스트 재작성" : "AI 어시스트 활용하여 초안 작성"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300" onClick={saveGoalAchievementAndReflection} disabled={savingStatus.report === "saving"}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {savingStatus.report === "saving" ? "저장 중..." : savingStatus.report === "saved" ? "저장됨" : "저장"}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">개조식으로 작성해 주세요. AI 버튼을 누르면 계획·마일리지 정보를 바탕으로 초안을 채워 줍니다.</p>
              <Textarea
                placeholder="정량 목표 달성도를 개조식으로 작성하세요."
                value={goalAchievementText}
                onChange={(e) => setGoalAchievementText(e.target.value)}
                className="mt-3 min-h-[200px] resize-y rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm whitespace-pre-wrap"
                rows={10}
              />
            </Card>
            
          </TabsContent>
          <TabsContent value="reflection" className="mt-0 space-y-4">
            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-800">성찰</h2>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-90" onClick={generateReflectionSummary} disabled={reflectionAiLoading}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {reflectionAiLoading ? "작성 중..." : reflectionText.trim() ? "AI 어시스트 재작성" : "AI 어시스트 활용하여 초안 작성"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300" onClick={saveGoalAchievementAndReflection} disabled={savingStatus.report === "saving"}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {savingStatus.report === "saving" ? "저장 중..." : savingStatus.report === "saved" ? "저장됨" : "저장"}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">자기 성찰 내용을 서술해 주세요. AI 버튼을 누르면 마일리지 페이지에서 작성한 연간 일일성찰일지를 요약 정리해 줍니다.</p>
              <Textarea
                placeholder="성찰 내용을 작성하세요."
                value={reflectionText}
                onChange={(e) => setReflectionText(e.target.value)}
                className="mt-3 min-h-[140px] resize-y rounded-lg border-slate-200 text-sm"
              />
            </Card>
          </TabsContent>
          <TabsContent value="nextYear" className="mt-0 space-y-4">
            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-800">내년 목표</h2>
                <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300" onClick={saveNextYearGoal} disabled={savingStatus.nextYear === "saving"}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {savingStatus.nextYear === "saving" ? "저장 중..." : savingStatus.nextYear === "saved" ? "저장됨" : "저장"}
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">다음 해 목표를 작성해 주세요. 보고서의 「내년도 목표」란에 반영됩니다.</p>
              <Textarea
                placeholder="내년도 목표를 작성하세요."
                value={nextYearGoalText}
                onChange={(e) => setNextYearGoalText(e.target.value)}
                className="mt-3 min-h-[140px] resize-y rounded-lg border-slate-200 text-sm"
              />
            </Card>
          </TabsContent>
          <TabsContent value="evidence" className="mt-0 space-y-4">
            <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-800">교사 자기실적평가서</h2>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300" onClick={openSelfEvalPrint}>
                    <FileDown className="mr-1.5 h-3.5 w-3.5" />
                    PDF로 저장
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300" onClick={openSelfEvalPrint}>
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    프린트
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">근무성적평정의 신뢰성과 타당성이 보장되도록 객관적 근거에 따라 종합적으로 평가하여야 한다. PDF로 저장 시 인쇄 대화상자에서 대상을 「PDF로 저장」으로 선택하세요.</p>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 rounded border border-slate-200 bg-slate-50/50 px-2.5 py-1.5">
                  <span className="text-xs font-medium text-slate-600">평가 기간</span>
                  <span className="text-xs text-slate-700">{SELF_EVAL_PERIOD}</span>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-700">평가자 인적사항</p>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                    <div>
                      <Label className="text-xs text-slate-600">소속</Label>
                      <Input value={selfEvalForm.affiliation} onChange={(e) => setSelfEvalForm((p) => ({ ...p, affiliation: e.target.value }))} placeholder="예: 초등학교" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">직위</Label>
                      <Input value={selfEvalForm.position} onChange={(e) => setSelfEvalForm((p) => ({ ...p, position: e.target.value }))} placeholder="예: 교사" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">성명</Label>
                      <Input value={selfEvalForm.evaluatorName} onChange={(e) => setSelfEvalForm((p) => ({ ...p, evaluatorName: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-700">평가자 기초 자료</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
                    <div>
                      <Label className="text-xs text-slate-600">담당 학년·학급</Label>
                      <Input value={selfEvalForm.gradeClass} onChange={(e) => setSelfEvalForm((p) => ({ ...p, gradeClass: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">담당 과목</Label>
                      <Input value={selfEvalForm.subject} onChange={(e) => setSelfEvalForm((p) => ({ ...p, subject: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">담당 업무</Label>
                      <Input value={selfEvalForm.assignedDuties} onChange={(e) => setSelfEvalForm((p) => ({ ...p, assignedDuties: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">주당 수업시간</Label>
                      <Input type="number" value={selfEvalForm.hoursPerWeek} onChange={(e) => setSelfEvalForm((p) => ({ ...p, hoursPerWeek: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">담임 여부</Label>
                      <div className="flex gap-1">
                        {(["예", "아니오"] as const).map((opt) => (
                          <Button key={opt} type="button" variant={selfEvalForm.isHomeroom === opt ? "default" : "outline"} size="sm" className="h-8 rounded px-2 text-xs" onClick={() => setSelfEvalForm((p) => ({ ...p, isHomeroom: opt }))}>{opt}</Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">보직교사 여부</Label>
                      <div className="flex gap-1">
                        {(["예", "아니오"] as const).map((opt) => (
                          <Button key={opt} type="button" variant={selfEvalForm.isPositionTeacher === opt ? "default" : "outline"} size="sm" className="h-8 rounded px-2 text-xs" onClick={() => setSelfEvalForm((p) => ({ ...p, isPositionTeacher: opt }))}>{opt}</Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">수업공개(회)</Label>
                      <Input value={selfEvalForm.openClassResult} onChange={(e) => setSelfEvalForm((p) => ({ ...p, openClassResult: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">학생 상담(시간)</Label>
                      <Input value={selfEvalForm.studentCounselResult} onChange={(e) => setSelfEvalForm((p) => ({ ...p, studentCounselResult: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">학부모 상담(시간)</Label>
                      <Input value={selfEvalForm.parentCounselResult} onChange={(e) => setSelfEvalForm((p) => ({ ...p, parentCounselResult: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                    <div className="sm:col-span-3">
                      <Label className="text-xs text-slate-600">그 밖의 실적</Label>
                      <Input value={selfEvalForm.otherResult} onChange={(e) => setSelfEvalForm((p) => ({ ...p, otherResult: e.target.value }))} placeholder="기재" className="h-8 rounded border-slate-200 text-sm" />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">자기실적 평가</p>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-90"
                      onClick={generateSelfEvalSections}
                      disabled={selfEvalAiLoading}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      {selfEvalAiLoading ? "작성 중..." : "AI로 가~라 작성"}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">위 계획·마일리지·기초 자료를 참고해 목표와 실적을 연계해 초안을 채웁니다. 칸당 200자 내외, 개조식(~임·~함), 목표는 성장 지원·교수법 적용·조성함 등 간단한 어미로 작성됩니다.</p>
                  <div className="mt-3 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-slate-600">가. 학습지도</p>
                      <div className="mt-1 grid gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">학습지도 추진 목표(학년 초에 계획되었던 학습지도 목표)</Label>
                          <Textarea value={selfEvalForm.learningGoal} onChange={(e) => setSelfEvalForm((p) => ({ ...p, learningGoal: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">학습지도 추진 실적</Label>
                          <Textarea value={selfEvalForm.learningResult} onChange={(e) => setSelfEvalForm((p) => ({ ...p, learningResult: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-600">나. 생활지도</p>
                      <div className="mt-1 grid gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">생활지도 추진 목표</Label>
                          <Textarea value={selfEvalForm.lifeGoal} onChange={(e) => setSelfEvalForm((p) => ({ ...p, lifeGoal: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">생활지도 추진 실적</Label>
                          <Textarea value={selfEvalForm.lifeResult} onChange={(e) => setSelfEvalForm((p) => ({ ...p, lifeResult: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-600">다. 전문성계발</p>
                      <div className="mt-1 grid gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">전문성개발 추진 목표</Label>
                          <Textarea value={selfEvalForm.professionalGoal} onChange={(e) => setSelfEvalForm((p) => ({ ...p, professionalGoal: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">전문성개발 추진 실적</Label>
                          <Textarea value={selfEvalForm.professionalResult} onChange={(e) => setSelfEvalForm((p) => ({ ...p, professionalResult: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-600">라. 담당 업무</p>
                      <div className="mt-1 grid gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">담당 업무 추진 목표</Label>
                          <Textarea value={selfEvalForm.dutyGoal} onChange={(e) => setSelfEvalForm((p) => ({ ...p, dutyGoal: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">담당 업무 추진 실적</Label>
                          <Textarea value={selfEvalForm.dutyResult} onChange={(e) => setSelfEvalForm((p) => ({ ...p, dutyResult: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs text-slate-500">창의적 업무개선 사항</Label>
                          <Textarea value={selfEvalForm.creativeImprovement} onChange={(e) => setSelfEvalForm((p) => ({ ...p, creativeImprovement: e.target.value }))} placeholder="기재" className="min-h-[80px] resize-y rounded-lg border-slate-200 text-sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">자기 평가 종합 상황</p>
                  <p className="mt-1 text-xs text-slate-500">각 항목별로 만족·보통·미흡 중 하나를 선택하세요.</p>
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[400px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="p-2 text-left font-medium text-slate-700">평가 항목</th>
                          <th className="p-2 text-center font-medium text-slate-700">만족</th>
                          <th className="p-2 text-center font-medium text-slate-700">보통</th>
                          <th className="p-2 text-center font-medium text-slate-700">미흡</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="p-2 text-slate-600">목표달성도 (설정한 목표에 대한 달성 정도)</td>
                          <td className="p-2 text-center" colSpan={3}>
                            <RadioGroup value={selfEvalForm.goalAchievement} onValueChange={(v) => setSelfEvalForm((p) => ({ ...p, goalAchievement: v as SelfEvalRating }))} className="flex flex-row justify-center gap-6">
                              {SELF_EVAL_RATINGS.map((r) => (
                                <label key={r} className="flex cursor-pointer items-center gap-1.5">
                                  <RadioGroupItem value={r} />
                                  <span className="text-sm">{r}</span>
                                </label>
                              ))}
                            </RadioGroup>
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-2 text-slate-600">창의성 (학습지도·생활지도·전문성계발·담당 업무 등의 창의적 수행 정도)</td>
                          <td className="p-2 text-center" colSpan={3}>
                            <RadioGroup value={selfEvalForm.creativity} onValueChange={(v) => setSelfEvalForm((p) => ({ ...p, creativity: v as SelfEvalRating }))} className="flex flex-row justify-center gap-6">
                              {SELF_EVAL_RATINGS.map((r) => (
                                <label key={r} className="flex cursor-pointer items-center gap-1.5">
                                  <RadioGroupItem value={r} />
                                  <span className="text-sm">{r}</span>
                                </label>
                              ))}
                            </RadioGroup>
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-2 text-slate-600">적시성 (기한 내 효과적 처리 정도)</td>
                          <td className="p-2 text-center" colSpan={3}>
                            <RadioGroup value={selfEvalForm.timeliness} onValueChange={(v) => setSelfEvalForm((p) => ({ ...p, timeliness: v as SelfEvalRating }))} className="flex flex-row justify-center gap-6">
                              {SELF_EVAL_RATINGS.map((r) => (
                                <label key={r} className="flex cursor-pointer items-center gap-1.5">
                                  <RadioGroupItem value={r} />
                                  <span className="text-sm">{r}</span>
                                </label>
                              ))}
                            </RadioGroup>
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 text-slate-600">노력도 (목표 달성을 위한 노력·공헌도)</td>
                          <td className="p-2 text-center" colSpan={3}>
                            <RadioGroup value={selfEvalForm.effort} onValueChange={(v) => setSelfEvalForm((p) => ({ ...p, effort: v as SelfEvalRating }))} className="flex flex-row justify-center gap-6">
                              {SELF_EVAL_RATINGS.map((r) => (
                                <label key={r} className="flex cursor-pointer items-center gap-1.5">
                                  <RadioGroupItem value={r} />
                                  <span className="text-sm">{r}</span>
                                </label>
                              ))}
                            </RadioGroup>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4">
                  <div className="grid gap-1">
                    <Label className="text-xs text-slate-600">작성자(본인) 성명</Label>
                    <Input value={selfEvalForm.preparerName} onChange={(e) => setSelfEvalForm((p) => ({ ...p, preparerName: e.target.value }))} placeholder="기재" className="w-40 rounded-lg border-slate-200 text-sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-slate-600">년</Label>
                    <Input value={selfEvalForm.dateYear} onChange={(e) => setSelfEvalForm((p) => ({ ...p, dateYear: e.target.value }))} placeholder="2026" className="w-14 rounded-lg border-slate-200 text-sm" />
                    <Label className="text-xs text-slate-600">월</Label>
                    <Input value={selfEvalForm.dateMonth} onChange={(e) => setSelfEvalForm((p) => ({ ...p, dateMonth: e.target.value }))} placeholder="월" className="w-10 rounded-lg border-slate-200 text-sm" />
                    <Label className="text-xs text-slate-600">일</Label>
                    <Input value={selfEvalForm.dateDay} onChange={(e) => setSelfEvalForm((p) => ({ ...p, dateDay: e.target.value }))} placeholder="일" className="w-10 rounded-lg border-slate-200 text-sm" />
                  </div>
                </div>
                <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
                  <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300" onClick={saveSelfEvalForm} disabled={savingStatus.evidence === "saving"}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {savingStatus.evidence === "saving" ? "저장 중..." : savingStatus.evidence === "saved" ? "저장됨" : "저장"}
                </Button>
              </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
