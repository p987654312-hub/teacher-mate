"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CardPageHeader } from "@/components/CardPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";
import { MessageCircle, Save, Sparkles } from "lucide-react";

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
  const saveDraftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveEvidenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNextYearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChangesRef = useRef(false);

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
      const res = await fetch("/api/ai-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setGoalAchievementText("보고서 생성에 실패했습니다. " + (json.error || ""));
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
      const res = await fetch("/api/ai-summarize-reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const saveEvidence = async () => {
    if (!userEmail) return;
    setSavingStatus((prev) => ({ ...prev, evidence: "saving" }));
    try {
      await supabase.from("user_preferences").upsert(
        { user_email: userEmail, pref_key: "reflection_evidence_text", pref_value: evidenceText, updated_at: new Date().toISOString() },
        { onConflict: "user_email,pref_key" }
      );
      hasUnsavedChangesRef.current = false;
      setSavingStatus((prev) => ({ ...prev, evidence: "saved" }));
      setTimeout(() => setSavingStatus((prev) => ({ ...prev, evidence: "idle" })), 2000);
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
      setSavingStatus((prev) => ({ ...prev, evidence: "idle" }));
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
              subtitle="교사 성찰 기록장 · 성장의 결과를 서식에 맞게 작성하기 위한 기초 자료입니다."
            />
          </div>
          <Link href="/reflection/result-report" className="shrink-0">
            <Button type="button" size="sm" className="rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white shadow-sm hover:opacity-90">보고서 만들기</Button>
          </Link>
        </div>
        <Tabs defaultValue="goals" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-5 rounded-xl bg-slate-100 p-1">
            <TabsTrigger value="goals" className="rounded-lg text-sm font-medium">나의 목표</TabsTrigger>
            <TabsTrigger value="report" className="rounded-lg text-sm font-medium">목표 달성도</TabsTrigger>
            <TabsTrigger value="reflection" className="rounded-lg text-sm font-medium">성찰</TabsTrigger>
            <TabsTrigger value="nextYear" className="rounded-lg text-sm font-medium">내년 목표</TabsTrigger>
            <TabsTrigger value="evidence" className="rounded-lg text-sm font-medium">증빙서류</TabsTrigger>
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
                <h2 className="text-base font-semibold text-slate-800">목표 달성도</h2>
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
                placeholder="목표 달성도를 개조식으로 작성하세요."
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
                <h2 className="text-base font-semibold text-slate-800">증빙서류</h2>
                <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300" onClick={saveEvidence} disabled={savingStatus.evidence === "saving"}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {savingStatus.evidence === "saving" ? "저장 중..." : savingStatus.evidence === "saved" ? "저장됨" : "저장"}
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">증빙서류 목록이나 첨부 내용을 자유롭게 적어 주세요.</p>
              <Textarea
                placeholder="예: 연수 이수증, 수업 공개 계획서, 독서 기록 등"
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                className="mt-3 min-h-[140px] resize-y rounded-lg border-slate-200 bg-slate-50/50 text-sm"
              />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
