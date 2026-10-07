"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { maskDisplayName } from "@/lib/displayName";
import { supabase } from "@/lib/supabaseClient";

type Member = {
  id: string;
  name: string;
  email: string;
  gradeClass: string;
  kind: "permanent" | "temporary" | "teacher";
  adminExpiresAt: string | null;
  adminGrantedBy: string | null;
};

function formatKst(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function kstYmd(offsetDays: number): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function memberLabel(member: Member): string {
  const name = member.name ? maskDisplayName(member.name) : "이름 없음";
  const grade = member.gradeClass || "소속 없음";
  return `${grade} ${name}`;
}

export default function TemporaryAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId] = useState("");
  const [period, setPeriod] = useState("7");
  const [until, setUntil] = useState(kstYmd(7));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("로그인 세션이 없습니다.");
        setMembers([]);
        return;
      }
      const res = await fetch("/api/admin/temporary-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "list" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "구성원 목록을 불러오지 못했습니다.");
        setMembers([]);
        return;
      }
      const list = Array.isArray(json.members) ? (json.members as Member[]) : [];
      setMembers(list);
      setUserId((current) => (list.some((m) => m.id === current && m.kind !== "permanent") ? current : ""));
    } catch {
      setError("구성원 목록을 불러오지 못했습니다.");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("로그인 세션이 없습니다.");
      return false;
    }
    const res = await fetch("/api/admin/temporary-admins", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json?.error === "string" ? json.error : "처리하지 못했습니다.");
      return false;
    }
    if (Array.isArray(json.members)) setMembers(json.members as Member[]);
    setError(null);
    return true;
  };

  const grant = async () => {
    const target = members.find((m) => m.id === userId);
    if (!target) {
      setError("권한을 줄 구성원을 선택해 주세요.");
      return;
    }
    const periodLabel = period === "date" ? `${until} 23:59까지` : `${period}일`;
    if (!window.confirm(`${memberLabel(target)} 선생님에게 관리자 권한을 ${periodLabel} 부여할까요?`)) return;
    setSaving(true);
    try {
      const body = period === "date"
        ? { action: "grant", userId, until }
        : { action: "grant", userId, days: Number(period) };
      const ok = await post(body);
      if (ok) {
        alert("임시 관리자 권한을 부여했습니다. 상대방이 새로고침하면 관리자 화면을 사용할 수 있습니다.");
      }
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (member: Member) => {
    if (!window.confirm(`${memberLabel(member)} 선생님의 임시 관리자 권한을 지금 회수할까요?`)) return;
    setSaving(true);
    try {
      const ok = await post({ action: "revoke", userId: member.id });
      if (ok) alert("임시 관리자 권한을 회수했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const permanent = members.filter((m) => m.kind === "permanent");
  const temporary = members.filter((m) => m.kind === "temporary");
  const candidates = members.filter((m) => m.kind !== "permanent");

  return (
    <Card className="rounded-xl border-amber-200/80 bg-amber-50/40 p-3 shadow-sm">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-800">임시 관리자 권한</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            슈퍼관리자 코드로 등록된 상설 관리자만 같은 학교 구성원에게 기한이 있는 관리자 권한을 줄 수 있습니다. 기간이 끝나면 교사 권한으로 돌아갑니다. 임시 관리자는 이 메뉴를 사용할 수 없습니다.
          </p>
        </div>

        {loading && <p className="text-[11px] text-slate-500">구성원을 불러오는 중입니다...</p>}
        {error && <p className="text-[11px] text-rose-600">{error}</p>}

        {!loading && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-amber-100 bg-white p-2.5">
                <p className="text-[11px] font-semibold text-slate-700">상설 관리자</p>
                {permanent.length === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-400">없습니다.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {permanent.map((m) => (
                      <li key={m.id} className="text-[11px] text-slate-600">{memberLabel(m)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-amber-100 bg-white p-2.5">
                <p className="text-[11px] font-semibold text-slate-700">임시 관리자</p>
                {temporary.length === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-400">부여된 임시 권한이 없습니다.</p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {temporary.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span>
                          {memberLabel(m)}
                          <span className="ml-1 text-amber-700">{formatKst(m.adminExpiresAt)}까지</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 rounded-md border-rose-200 px-2 text-[10px] text-rose-700 hover:bg-rose-50"
                          disabled={saving}
                          onClick={() => void revoke(m)}
                        >
                          회수
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-[11px] text-slate-600">
                구성원
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                >
                  <option value="">선택</option>
                  {candidates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberLabel(m)}{m.kind === "temporary" ? " (임시, 기간 변경)" : ""} · {m.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                기간
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                >
                  <option value="1">1일</option>
                  <option value="3">3일</option>
                  <option value="7">7일</option>
                  <option value="30">30일</option>
                  <option value="90">90일</option>
                  <option value="date">날짜 지정</option>
                </select>
              </label>
              {period === "date" && (
                <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                  만료일
                  <input
                    type="date"
                    value={until}
                    min={kstYmd(0)}
                    max={kstYmd(90)}
                    onChange={(e) => setUntil(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                  />
                </label>
              )}
              <Button
                type="button"
                size="sm"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700"
                disabled={saving || !userId}
                onClick={() => void grant()}
              >
                {saving ? "처리 중..." : "권한 부여"}
              </Button>
            </div>
            <p className="text-[10px] text-slate-400">
              화면의 성명은 가려 표시하고, 선택 목록에는 이메일을 함께 보여 대상을 구분합니다. 날짜 지정은 그날 23:59(한국 시간)에 끝납니다. 최대 90일입니다.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
