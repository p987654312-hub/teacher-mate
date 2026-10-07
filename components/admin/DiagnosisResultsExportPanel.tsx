"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { maskDisplayName } from "@/lib/displayName";
import type { DiagnosisExportPayload } from "@/lib/diagnosisResultExport";
import { supabase } from "@/lib/supabaseClient";

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toFixed(2);
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export default function DiagnosisResultsExportPanel() {
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiagnosisExportPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("로그인 세션이 없습니다.");
        setData(null);
        return;
      }
      const res = await fetch("/api/admin/diagnosis-results-export", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "검사 결과를 불러오지 못했습니다.");
        setData(null);
        return;
      }
      setData(json as DiagnosisExportPayload);
    } catch {
      setError("검사 결과를 불러오지 못했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("로그인 세션이 없습니다.");
        return;
      }
      const res = await fetch("/api/admin/diagnosis-results-export", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ format: "xlsx" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(typeof json?.error === "string" ? json.error : "엑셀 파일을 만들지 못했습니다.");
        return;
      }
      const blob = await res.blob();
      const today = new Date();
      const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      const fallback = `사전사후검사결과_${ymd}.xlsx`;
      const filename = filenameFromDisposition(res.headers.get("Content-Disposition"), fallback);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("엑셀 파일을 내려받지 못했습니다.");
    } finally {
      setDownloading(false);
    }
  };

  const preCount = data?.rows.filter((r) => r.pre).length ?? 0;
  const postCount = data?.rows.filter((r) => r.post).length ?? 0;
  const bothCount = data?.rows.filter((r) => r.pre && r.post).length ?? 0;

  return (
    <Card className="rounded-xl border-emerald-200/80 bg-emerald-50/40 p-3 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800">사전·사후 검사 결과 추출</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              검사를 실시한 교원의 사전·사후 결과를 엑셀로 내려받습니다. 영역 평균, 100점 환산 총점, 문항별 선택값과 보정 점수가 들어 있습니다.
              {data?.title ? ` 검사 제목: ${data.title}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-md border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              disabled={loading || downloading}
              onClick={() => void load()}
            >
              다시 불러오기
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
              disabled={loading || downloading || !data || data.rows.length === 0}
              onClick={() => void download()}
            >
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {downloading ? "만드는 중..." : "엑셀 내려받기"}
              </span>
            </Button>
          </div>
        </div>

        {loading && <p className="text-[11px] text-slate-500">검사 결과를 불러오는 중입니다...</p>}
        {error && <p className="text-[11px] text-rose-600">{error}</p>}

        {!loading && data && data.rows.length === 0 && (
          <p className="text-[11px] text-slate-500">검사를 실시한 교원이 없습니다.</p>
        )}

        {!loading && data && data.rows.length > 0 && (
          <>
            <p className="text-[11px] text-slate-600">
              {data.rows.length}명 · 사전 {preCount}명 · 사후 {postCount}명 · 사전·사후 모두 {bothCount}명
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border border-emerald-100 bg-white">
              <table className="min-w-full border-collapse text-[11px] text-slate-700">
                <thead className="sticky top-0 z-10 bg-emerald-50 text-slate-600">
                  <tr>
                    <th rowSpan={2} className="border-b border-emerald-100 px-2 py-1.5 text-left font-semibold">학년반</th>
                    <th rowSpan={2} className="border-b border-emerald-100 px-2 py-1.5 text-left font-semibold">성명</th>
                    <th rowSpan={2} className="border-b border-emerald-100 px-2 py-1.5 text-left font-semibold">사전</th>
                    <th rowSpan={2} className="border-b border-emerald-100 px-2 py-1.5 text-left font-semibold">사후</th>
                    {data.domains.map((d) => (
                      <th key={d.key} colSpan={2} className="border-b border-l border-emerald-100 px-2 py-1.5 text-center font-semibold">
                        {d.name}
                      </th>
                    ))}
                    <th rowSpan={2} className="border-b border-l border-emerald-100 px-2 py-1.5 text-right font-semibold">사전총점</th>
                    <th rowSpan={2} className="border-b border-emerald-100 px-2 py-1.5 text-right font-semibold">사후총점</th>
                  </tr>
                  <tr>
                    {data.domains.map((d) => (
                      <Fragment key={`${d.key}-pair`}>
                        <th className="border-b border-l border-emerald-100 px-2 py-1 text-center font-medium">사전</th>
                        <th className="border-b border-emerald-100 px-2 py-1 text-center font-medium">사후</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.email} className="odd:bg-white even:bg-slate-50/70">
                      <td className="whitespace-nowrap px-2 py-1.5">{row.gradeClass || "-"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{row.name ? maskDisplayName(row.name) : "-"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{row.pre?.examDate || "미실시"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{row.post?.examDate || "미실시"}</td>
                      {data.domains.map((d) => (
                        <Fragment key={d.key}>
                          <td className="whitespace-nowrap border-l border-emerald-50 px-2 py-1.5 text-center tabular-nums">{fmt(row.pre?.domainAvgs[d.key])}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-center tabular-nums">{fmt(row.post?.domainAvgs[d.key])}</td>
                        </Fragment>
                      ))}
                      <td className="whitespace-nowrap border-l border-emerald-50 px-2 py-1.5 text-right tabular-nums">{fmt(row.pre?.totalNorm)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{fmt(row.post?.totalNorm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400">
              화면의 성명은 가려 표시합니다. 엑셀 파일에는 성명, 이메일, 학년반과 문항별 점수가 포함됩니다. 평균은 1~5점, 총점은 100점 환산입니다.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
