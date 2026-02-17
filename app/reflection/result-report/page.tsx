"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useReactToPrint } from "react-to-print";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { Printer, FileDown, X } from "lucide-react";

const DOMAIN_LABELS: Record<string, string> = {
  domain1: "수업 설계·운영",
  domain2: "학생 이해·생활지도",
  domain3: "평가·피드백",
  domain4: "학급경영·안전",
  domain5: "전문성 개발·성찰",
  domain6: "소통·협력 및 포용",
};

const CATEGORY_LABELS: Record<string, string> = {
  training: "연수(직무·자율)",
  class_open: "수업 공개",
  community: "교원학습 공동체",
  book_edutech: "전문 서적/에듀테크",
  health: "건강/체력",
  other: "기타",
};

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
        } catch {
          // ignore
        }
      }
      setLoading(false);
    };
    load();
  }, [router, searchParams]);

  const result = postResult ?? preResult;
  const domainAverages = result
    ? [
        { name: DOMAIN_LABELS.domain1, score: result.domain1 / 5 },
        { name: DOMAIN_LABELS.domain2, score: result.domain2 / 5 },
        { name: DOMAIN_LABELS.domain3, score: result.domain3 / 5 },
        { name: DOMAIN_LABELS.domain4, score: result.domain4 / 5 },
        { name: DOMAIN_LABELS.domain5, score: result.domain5 / 5 },
        { name: DOMAIN_LABELS.domain6, score: result.domain6 / 5 },
      ]
    : [];
  const radarCompareData =
    preResult && postResult
      ? domainAverages.map((d, i) => {
          const key = `domain${i + 1}` as keyof DiagnosisRow;
          return { name: d.name, 사전: (preResult[key] as number) / 5, 사후: (postResult[key] as number) / 5 };
        })
      : null;
  const totalNorm = result ? (result.total_score / (30 * 100)) * 100 : 0;
  const preTotalNorm = preResult ? (preResult.total_score / (30 * 100)) * 100 : 0;
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
        <div ref={contentRef} className="print-content-area rounded-lg bg-white p-6 shadow-sm print:shadow-none print:p-0">
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
                  <ResponsiveContainer width="100%" height={220}>
                    {radarCompareData && preResult && postResult ? (
                      <RadarChart data={radarCompareData} outerRadius="62%" margin={{ top: 24, right: 80, bottom: 24, left: 36 }}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="name" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} />
                        <Radar name="사전" dataKey="사전" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.25} strokeWidth={1} />
                        <Radar name="사후" dataKey="사후" stroke="#6366f1" fill="transparent" fillOpacity={0} strokeWidth={1.5} />
                      </RadarChart>
                    ) : (
                      <RadarChart data={domainAverages} outerRadius="62%" margin={{ top: 24, right: 80, bottom: 24, left: 36 }}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="name" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} />
                        <Radar name="역량" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                      </RadarChart>
                    )}
                  </ResponsiveContainer>
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
                          const key = `domain${i + 1}` as keyof DiagnosisRow;
                          return (
                            <tr key={d.name}>
                              <td className="border border-slate-300 px-2 py-1">{d.name}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center">{((preResult[key] as number) / 5).toFixed(1)}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center">{((postResult[key] as number) / 5).toFixed(1)}</td>
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
            <h2 className="mb-2 text-sm font-bold text-slate-800">증빙서류</h2>
            <div className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-700">
              {(evidenceText ?? "").trim() ? evidenceText : "별첨"}
            </div>
          </div>
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
