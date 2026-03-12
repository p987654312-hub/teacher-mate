"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useReactToPrint } from "react-to-print";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { Printer, FileDown, X } from "lucide-react";

const ReflectionRadarCharts = dynamic(
  () => import("@/components/charts/ReflectionRadarCharts"),
  { ssr: false }
);

const FALLBACK_DOMAIN_LABELS: Record<string, string> = {
  domain1: "영역1",
  domain2: "영역2",
  domain3: "영역3",
  domain4: "영역4",
  domain5: "영역5",
  domain6: "영역6",
};

const CATEGORY_LABELS: Record<string, string> = {
  training: "연수(직무·자율)",
  class_open: "수업 공개",
  community: "교원학습 공동체",
  book_edutech: "전문 서적/에듀테크",
  health: "건강/체력",
  other: "기타",
};

const SELF_EVAL_PERIOD = "2026년 3월 1일부터 2027년 2월 28일까지(학년도 단위)";

type DiagnosisRow = {
  id: string;
  user_email: string;
  domain1: number;
  domain2: number;
  domain3: number;
  domain4: number;
  domain5: number;
  domain6: number;
  total_score: number;
  created_at: string;
  diagnosis_type?: string | null;
  raw_answers?: Record<string, unknown> & { _schema?: string };
  category_scores?: Record<string, { score?: number; count?: number }>;
};

type MileageEntry = { id: string; content: string; category: string; created_at: string };

function ResultReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contentRef = useRef<HTMLDivElement>(null);
  const [userName, setUserName] = useState("");
  const [userSchool, setUserSchool] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [preResult, setPreResult] = useState<DiagnosisRow | null>(null);
  const [postResult, setPostResult] = useState<DiagnosisRow | null>(null);
  const [mileageByCategory, setMileageByCategory] = useState<Record<string, MileageEntry[]>>({});
  const [goalAchievementText, setGoalAchievementText] = useState("");
  const [reflectionText, setReflectionText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [nextYearGoalText, setNextYearGoalText] = useState("");
  const [loading, setLoading] = useState(true);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>(CATEGORY_LABELS);
  const [domainLabels, setDomainLabels] = useState<Record<string, string>>(FALLBACK_DOMAIN_LABELS);
  const [domainCount, setDomainCount] = useState<number>(6);
  const [selfEvalForm, setSelfEvalForm] = useState<any | null>(null);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: "자기역량 개발 결과 보고서",
    pageStyle: `@page { size: A4; margin: 12mm; } html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .print-content-area { background: #fff !important; }`,
  });

  useEffect(() => {
    const load = async () => {
      await supabase.auth.refreshSession();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.replace("/");
        return;
      }
      const role = (user.user_metadata as { role?: string })?.role;
      let email: string;

      if (role === "admin" && searchParams.get("email")) {
        const viewEmail = searchParams.get("email")!.trim();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          router.replace("/");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/admin/result-report-by-email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: viewEmail }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err?.error ?? "해당 교원 성찰 결과를 볼 수 없습니다.");
          router.replace("/dashboard");
          setLoading(false);
          return;
        }
        const j = await res.json();
        setUserName(j.name ?? viewEmail ?? "");
        setUserSchool(j.schoolName ?? "");
        setUserEmail(j.email ?? viewEmail);
        if (j.preResult) setPreResult(j.preResult as DiagnosisRow);
        if (j.postResult) setPostResult(j.postResult as DiagnosisRow);
        const byCat: Record<string, MileageEntry[]> = {};
        (j.mileageEntries ?? []).forEach((r: MileageEntry) => {
          const c = r.category || "other";
          if (!byCat[c]) byCat[c] = [];
          byCat[c].push(r);
        });
        setMileageByCategory(byCat);
        setGoalAchievementText(j.goalAchievementText ?? "");
        setReflectionText(j.reflectionText ?? "");
        setEvidenceText(j.evidenceText ?? "");
        setNextYearGoalText(j.nextYearGoalText ?? "");
        if (j.selfEvalForm) {
          try {
            const parsed = typeof j.selfEvalForm === "string" ? JSON.parse(j.selfEvalForm) : j.selfEvalForm;
            setSelfEvalForm(parsed);
          } catch {
            setSelfEvalForm(null);
          }
        }
        const { data: { session: adminSession } } = await supabase.auth.getSession();
        if (adminSession?.access_token) {
          try {
            const catRes = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${adminSession.access_token}` } });
            if (catRes.ok) {
              const catJ = await catRes.json();
              if (Array.isArray(catJ.categories) && catJ.categories.length === 6) {
                setCategoryLabels(Object.fromEntries((catJ.categories as { key: string; label: string }[]).map((c) => [c.key, c.label])));
              }
            }
            const diagRes = await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${adminSession.access_token}` }, cache: "no-store" });
            if (diagRes.ok) {
              const diagJ = await diagRes.json();
              if (Array.isArray(diagJ.domains) && diagJ.domains.length >= 2 && diagJ.domains.length <= 6) {
                const defKeys = ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const;
                const labels: Record<string, string> = { ...FALLBACK_DOMAIN_LABELS };
                for (let i = 0; i < diagJ.domains.length; i++) {
                  const key = defKeys[i];
                  const name = (diagJ.domains[i]?.name ?? "").trim() || FALLBACK_DOMAIN_LABELS[key];
                  if (key) labels[key] = name;
                }
                setDomainLabels(labels);
                setDomainCount(diagJ.domains.length);
              }
            }
          } catch {
            // ignore
          }
        }
        setLoading(false);
        return;
      }

      // 관리자도 교원 권한을 가지므로 자신의 데이터를 볼 수 있음
      if (role === "teacher" || role === "admin") {
        email = user.email!;
        const meta = (user.user_metadata || {}) as { name?: string; schoolName?: string };
        setUserName(meta.name ?? user.email ?? "");
        setUserSchool(meta.schoolName ?? "");
        setUserEmail(email);
      } else {
        router.replace("/");
        setLoading(false);
        return;
      }

      const { data: preData } = await supabase.from("diagnosis_results").select("*").eq("user_email", email).or("diagnosis_type.is.null,diagnosis_type.eq.pre").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (preData) setPreResult(preData as DiagnosisRow);

      const { data: postData } = await supabase.from("diagnosis_results").select("*").eq("user_email", email).eq("diagnosis_type", "post").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (postData) setPostResult(postData as DiagnosisRow);

      const { data: mileageData } = await supabase.from("mileage_entries").select("id, content, category, created_at").eq("user_email", email).order("created_at", { ascending: false });
      const byCat: Record<string, MileageEntry[]> = {};
      (mileageData ?? []).forEach((r: MileageEntry) => {
        const c = r.category || "other";
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(r);
      });
      setMileageByCategory(byCat);

      const { data: draftRow } = await supabase.from("reflection_drafts").select("goal_achievement_text, reflection_text").eq("user_email", email).maybeSingle();
      if (draftRow) {
        setGoalAchievementText((draftRow.goal_achievement_text as string) ?? "");
        setReflectionText((draftRow.reflection_text as string) ?? "");
      } else if (typeof window !== "undefined") {
        setGoalAchievementText(localStorage.getItem("teacher_mate_goal_achievement_" + email) ?? "");
        setReflectionText(localStorage.getItem("teacher_mate_reflection_text_" + email) ?? "");
      }
      const { data: evidenceRow } = await supabase.from("user_preferences").select("pref_value").eq("user_email", email).eq("pref_key", "reflection_evidence_text").maybeSingle();
      if (evidenceRow?.pref_value != null) setEvidenceText(String(evidenceRow.pref_value));
      const { data: nextYearRow } = await supabase.from("user_preferences").select("pref_value").eq("user_email", email).eq("pref_key", "reflection_next_year_goal").maybeSingle();
      if (nextYearRow?.pref_value != null) setNextYearGoalText(String(nextYearRow.pref_value));
      const { data: selfEvalRow } = await supabase
        .from("user_preferences")
        .select("pref_value")
        .eq("user_email", email)
        .eq("pref_key", "reflection_self_eval_form")
        .maybeSingle();
      if (selfEvalRow?.pref_value != null) {
        try {
          const parsed = JSON.parse(String(selfEvalRow.pref_value));
          setSelfEvalForm(parsed);
        } catch {
          setSelfEvalForm(null);
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const catRes = await fetch("/api/school-category-settings", { headers: { Authorization: `Bearer ${session.access_token}` } });
          if (catRes.ok) {
            const catJ = await catRes.json();
            if (Array.isArray(catJ.categories) && catJ.categories.length === 6) {
              setCategoryLabels(Object.fromEntries((catJ.categories as { key: string; label: string }[]).map((c) => [c.key, c.label])));
            }
          }
          const diagRes = await fetch("/api/diagnosis-settings", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
          if (diagRes.ok) {
            const diagJ = await diagRes.json();
            if (Array.isArray(diagJ.domains) && diagJ.domains.length >= 2 && diagJ.domains.length <= 6) {
              const defKeys = ["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const;
              const labels: Record<string, string> = { ...FALLBACK_DOMAIN_LABELS };
              for (let i = 0; i < diagJ.domains.length; i++) {
                const key = defKeys[i];
                const name = (diagJ.domains[i]?.name ?? "").trim() || FALLBACK_DOMAIN_LABELS[key];
                if (key) labels[key] = name;
              }
              setDomainLabels(labels);
              setDomainCount(diagJ.domains.length);
            }
          }
        } catch {
          // ignore
        }
      }
      setLoading(false);
    };
    load();
  }, [router, searchParams]);

  const typeParam = searchParams.get("type") || "2";
  const isSelfEvalPreview = typeParam === "1";

  const buildSelfEvalHtml = (f: any | null) => {
    if (!f) return "";
    const esc = (s: any) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const blockLines = (s: any) =>
      String(s ?? "")
        .trim()
        .split(/\r?\n/)
        .filter((l: string) => l.trim())
        .map((l: string) => `<p class="bul">- ${esc(l.trim())}</p>`)
        .join("") || '<p class="bul">- </p>';
    const homeroomLabel =
      f.isHomeroom === "예" ? "담임교사" : f.isHomeroom === "아니오" ? "해당 없음" : esc(f.isHomeroom);
    const positionLabel =
      f.isPositionTeacher === "예"
        ? "보직교사"
        : f.isPositionTeacher === "아니오"
        ? "해당 없음"
        : esc(f.isPositionTeacher);
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
    return html;
  };

  const result = postResult ?? preResult;
  const is4Domain = result?.raw_answers?._schema === "v4";
  const cat = result?.category_scores;
  const getCount = (key: string) => (cat?.[key]?.count ?? 5);
  const domainKeys = is4Domain
    ? ["domain1", "domain2", "domain3", "domain4"]
    : (["domain1", "domain2", "domain3", "domain4", "domain5", "domain6"] as const).slice(0, Math.min(domainCount, 6));
  const totalQuestionCount = result
    ? domainKeys.reduce((sum, key) => sum + (getCount(key) || 5), 0)
    : 30;
  const domainAverages = result
    ? domainKeys.map((key) => ({
        name: domainLabels[key] ?? FALLBACK_DOMAIN_LABELS[key as keyof typeof FALLBACK_DOMAIN_LABELS],
        score: (result[key as keyof DiagnosisRow] as number) / (getCount(key) || 1),
      }))
    : [];
  const radarCompareData =
    preResult && postResult
      ? domainKeys.map((key) => {
          const preVal = (preResult[key as keyof DiagnosisRow] as number) / (getCount(key) || 1);
          const postVal = (postResult[key as keyof DiagnosisRow] as number) / (getCount(key) || 1);
          return { name: domainLabels[key] ?? FALLBACK_DOMAIN_LABELS[key as keyof typeof FALLBACK_DOMAIN_LABELS], 사전: preVal, 사후: postVal };
        })
      : null;
  const maxTotal = totalQuestionCount * 5;
  const totalNorm = result && maxTotal > 0 ? (result.total_score / maxTotal) * 100 : 0;
  const preTotalNorm = preResult && maxTotal > 0 ? (preResult.total_score / maxTotal) * 100 : 0;
  const categoryOrder = ["training", "class_open", "community", "book_edutech", "health", "other"];

  function toShortYear(text: string): string {
    return text.replace(/\b20(\d{2})\./g, "$1.");
  }
  function summarizeGoalAchievementText(raw: string): string {
    if (!raw || !raw.trim()) return raw || "";
    const lines = raw.split(/\r?\n/);
    const out: string[] = [];
    let title = "";
    const bullets: string[] = [];
    let includeRest = true;
    const flush = (): boolean => {
      if (title) {
        if (bullets.length > 0) {
          const first = bullets[0].trim();
          const restCount = bullets.length - 1;
          const bulletSuffix = restCount > 0 ? ` 외 ${restCount}건` : "";
          let category = "";
          let goalPart = "";
          const alreadyBracket = title.match(/^\[\s*(.+?)\s*\]\s*목표\s*:\s*(.+)$/);
          if (alreadyBracket) {
            category = alreadyBracket[1].trim();
            goalPart = alreadyBracket[2].trim();
          } else {
            const m = title.match(/^(.+?)\s+목표\s*:\s*(.+)$/);
            if (m) {
              category = m[1].trim();
              goalPart = m[2].trim();
            }
          }
          if (category && goalPart) {
            out.push(`[ ${category} ] 목표 : ${goalPart} - ${first}${bulletSuffix}`);
          } else {
            out.push(`[ ${title} ] - ${first}${bulletSuffix}`);
          }
        } else {
          const alreadyBracket = title.match(/^\[\s*(.+?)\s*\]\s*목표\s*:\s*(.+)$/);
          if (alreadyBracket) {
            out.push(`[ ${alreadyBracket[1].trim()} ] 목표 : ${alreadyBracket[2].trim()}`);
          } else {
            const m = title.match(/^(.+?)\s+목표\s*:\s*(.+)$/);
            if (m) {
              out.push(`[ ${m[1].trim()} ] 목표 : ${m[2].trim()}`);
            } else {
              out.push(`[ ${title} ]`);
            }
          }
        }
        const isLastReportBlock = /기타/.test(title);
        title = "";
        bullets.length = 0;
        if (isLastReportBlock) return false;
      }
      return true;
    };
    for (const line of lines) {
      if (!includeRest) break;
      const trimmed = line.trim();
      if (trimmed.startsWith("목표 :") || trimmed.startsWith("목표:")) {
        includeRest = flush();
        if (!includeRest) break;
        title = trimmed.replace(/^목표\s*:\s*(.+?):\s*/, "$1 목표 : ");
      } else if (/^\[\s*.+?\s*\]\s*목표\s*:\s*.+$/.test(trimmed) && !trimmed.includes(" - ")) {
        includeRest = flush();
        if (!includeRest) break;
        title = trimmed;
      } else if (trimmed && title) {
        bullets.push(trimmed.replace(/^\s*[-–—]\s*/, ""));
      } else if (trimmed) {
        includeRest = flush();
        if (includeRest) out.push(line);
      }
    }
    flush();
    return out.join("\n");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">불러오는 중...</p>
      </div>
    );
  }

  const selfEvalHtml = isSelfEvalPreview && selfEvalForm ? buildSelfEvalHtml(selfEvalForm) : "";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-4xl px-[1cm] print:px-[1cm]">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
          <Button type="button" size="sm" variant="outline" onClick={() => handlePrint()} className="rounded-full border-slate-300">
            <Printer className="mr-1.5 h-3.5 w-3.5" /> 인쇄
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => handlePrint()} title="PDF로 저장" className="rounded-full border-slate-300">
            <FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF 저장
          </Button>
          <Link href="/dashboard">
            <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-300">
              <X className="mr-1.5 h-3.5 w-3.5" /> 닫기
            </Button>
          </Link>
        </div>
        <div
          ref={contentRef}
          className={
            isSelfEvalPreview
              ? "print-content-area bg-white p-0 shadow-none print:shadow-none print:p-0"
              : "print-content-area rounded-lg bg-white p-6 shadow-sm print:shadow-none print:p-0"
          }
        >
          {isSelfEvalPreview ? (
            selfEvalHtml ? (
              <iframe
                title="교사 자기실적평가서"
                srcDoc={selfEvalHtml}
                className="h-[1000px] w-full border-none"
              />
            ) : (
              <p className="text-sm text-slate-500">저장된 자기실적평가서 데이터가 없습니다.</p>
            )
          ) : (
            <>
          <h1 className="mb-4 text-center font-bold text-slate-800 print:mb-4" style={{ fontSize: "120%" }}>자기역량 개발 결과 보고서</h1>
          <div className="mb-6 flex items-baseline justify-between border-b border-slate-200 pb-3">
            <p className="text-left text-xs text-slate-600" style={{ fontSize: "80%" }}>
              작성일 : {(() => {
                const now = new Date();
                const y = String(now.getFullYear()).slice(-2);
                const m = String(now.getMonth() + 1).padStart(2, "0");
                const d = String(now.getDate()).padStart(2, "0");
                const 요일 = ["일", "월", "화", "수", "목", "금", "토"][now.getDay()];
                return `${y}.${m}.${d}.(${요일})`;
              })()}
            </p>
            <p className="text-base font-medium text-slate-800" style={{ fontSize: "90%" }}>{userSchool} {userName} 선생님</p>
          </div>
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-bold text-slate-800">역량 성장 변화</h2>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {domainAverages.length > 0 && (
                <div className="w-full min-w-[280px] max-w-[320px] shrink-0 ml-0 sm:ml-[1cm] print:ml-[1cm] overflow-visible pr-2">
                  <ReflectionRadarCharts
                    radarCompareData={radarCompareData ?? null}
                    domainAverages={domainAverages}
                    hasPrePost={!!(radarCompareData && preResult && postResult)}
                  />
                  {radarCompareData && preResult && postResult && (
                    <div className="-mt-[7mm] flex justify-center gap-6 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="rounded-sm bg-[#94a3b8]" style={{ width: 16, height: 2 }} /> 사전
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="rounded-sm bg-[#6366f1]" style={{ width: 16, height: 2.5 }} /> 사후
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1 max-w-[50%] ml-[1cm] print:ml-[1cm]">
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1.5 text-left font-medium">영역</th>
                      {preResult && postResult ? (
                        <><th className="border border-slate-300 px-2 py-1.5 text-center font-medium">사전</th><th className="border border-slate-300 px-2 py-1.5 text-center font-medium">사후</th></>
                      ) : (
                        <th className="border border-slate-300 px-2 py-1.5 text-center font-medium">점수</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preResult && postResult
                      ? domainAverages.map((d, i) => {
                          const key = domainKeys[i];
                          const div = getCount(key) || 1;
                          return (
                            <tr key={d.name}>
                              <td className="border border-slate-300 px-2 py-1">{d.name}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center">{(((preResult[key as keyof DiagnosisRow] as number) ?? 0) / div).toFixed(1)}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center">{(((postResult[key as keyof DiagnosisRow] as number) ?? 0) / div).toFixed(1)}</td>
                            </tr>
                          );
                        })
                      : domainAverages.map((d) => (
                          <tr key={d.name}>
                            <td className="border border-slate-300 px-2 py-1">{d.name}</td>
                            <td className="border border-slate-300 px-2 py-1 text-center">{d.score.toFixed(1)}</td>
                          </tr>
                        ))}
                    <tr className="bg-slate-50 font-medium">
                      <td className="border border-slate-300 px-2 py-1">총점(100점 환산)</td>
                      {preResult && postResult ? (
                        <><td className="border border-slate-300 px-2 py-1 text-center">{preTotalNorm.toFixed(1)}</td><td className="border border-slate-300 px-2 py-1 text-center">{totalNorm.toFixed(1)}</td></>
                      ) : (
                        <td className="border border-slate-300 px-2 py-1 text-center">{totalNorm.toFixed(1)}</td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-slate-800">실천 내용</h2>
            <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
              <div className="space-y-2 text-xs text-slate-700">
                {categoryOrder.map((key) => {
                  const items = mileageByCategory[key] ?? [];
                  if (items.length === 0) return null;
                  const first = items[0].content;
                  const rest = items.length - 1;
                  return (
                    <p key={key}>
                      <span className="font-semibold text-slate-800">[{categoryLabels[key] ?? key}] </span>
                      {rest > 0 ? `${toShortYear(first)} 외 ${rest}건` : toShortYear(first)}
                    </p>
                  );
                })}
                {categoryOrder.every((k) => (mileageByCategory[k] ?? []).length === 0) && <p className="text-slate-500">실천 기록이 없습니다.</p>}
              </div>
            </div>
          </div>
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-slate-800">목표 달성도</h2>
            <div className="rounded border border-slate-200 bg-slate-50/50 p-3">
              <div className="space-y-2 text-xs text-slate-700">
                {goalAchievementText
                  ? toShortYear(summarizeGoalAchievementText(goalAchievementText))
                      .split(/\n/)
                      .filter((line) => line.trim())
                      .map((line, i) => {
                        const m = line.match(/^\[\s*([^\]]+?)\s*\]\s*(.*)$/);
                        if (m) {
                          return (
                            <p key={i}>
                              <strong>[ {m[1]} ]</strong>{m[2] ? `   ${m[2]}` : ""}
                            </p>
                          );
                        }
                        return <p key={i}>{line}</p>;
                      })
                  : <p className="text-slate-500">(작성된 내용 없음)</p>}
              </div>
            </div>
          </div>
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-slate-800">자기 성찰</h2>
            <div className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-700">
              {reflectionText || "(작성된 내용 없음)"}
            </div>
          </div>
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-slate-800">내년도 목표</h2>
            <div className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-700">
              {nextYearGoalText || "(작성된 내용 없음)"}
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-bold text-slate-800">(구)자기실적 평가서</h2>
            <div className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-700">
              {(evidenceText ?? "").trim() ? evidenceText : "별첨"}
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResultReportPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-slate-500">로딩 중...</div>}>
      <ResultReportContent />
    </Suspense>
  );
}
