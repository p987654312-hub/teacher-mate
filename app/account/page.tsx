"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft } from "lucide-react";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [gradeClass, setGradeClass] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isGoogleOnly, setIsGoogleOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace("/");
        return;
      }
      const u = data.user;
      setEmail(u.email ?? null);
      const meta = (u.user_metadata ?? {}) as { name?: string; schoolName?: string; gradeClass?: string };
      setName(meta.name ?? "");
      setSchoolName(meta.schoolName ?? "");
      setGradeClass(meta.gradeClass ?? "");

      const identities = (u as any).identities as Array<{ provider: string }> | undefined;
      const hasOAuthProvider = identities?.some((id) => id.provider === "google" || id.provider === "oauth") ?? false;
      const hasEmailPassword = identities?.some((id) => id.provider === "email") ?? false;
      setIsGoogleOnly(hasOAuthProvider && !hasEmailPassword);
    })();
  }, [router]);

  const handleSaveProfile = async () => {
    if (!name.trim() || !schoolName.trim()) {
      setMessage("이름과 학교명을 모두 입력해 주세요.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({
      data: { name: name.trim(), schoolName: schoolName.trim(), gradeClass: gradeClass.trim() },
    });
    setLoading(false);
    if (error) {
      setMessage(`프로필 저장 중 오류: ${error.message}`);
    } else {
      setMessage("프로필이 저장되었습니다.");
    }
  };

  const handleChangePassword = async () => {
    if (!email) {
      setMessage("이메일 정보를 불러오지 못했습니다.");
      return;
    }
    if (!currentPassword || !newPassword) {
      setMessage("현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setMessage("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const signInRes = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInRes.error) {
      setLoading(false);
      setMessage("현재 비밀번호가 올바르지 않습니다.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      setMessage(`비밀번호 변경 중 오류: ${error.message}`);
    } else {
      setMessage("비밀번호가 변경되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    }
  };

  const handleResetData = async () => {
    if (!confirm("나의 진단/계획/마일리지/성찰 데이터가 모두 삭제됩니다. 계속하시겠습니까?")) return;
    setLoading(true);
    setMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/account/reset-data", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setMessage(j?.error ?? "데이터 초기화 중 오류가 발생했습니다.");
    } else {
      setMessage("나의 앱 데이터가 초기화되었습니다.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("정말 회원탈퇴 하시겠습니까? 계정과 모든 데이터가 삭제됩니다.")) return;
    setLoading(true);
    setMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setMessage(j?.error ?? "회원탈퇴 처리 중 오류가 발생했습니다.");
    } else {
      alert("회원탈퇴가 완료되었습니다.");
      router.replace("/");
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl space-y-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden />
          <span>대시보드로 돌아가기</span>
        </button>

        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">내 계정 설정</h1>
          {email && <p className="text-xs text-slate-500">이메일: {email}</p>}
        </div>

        {message && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
            {message}
          </div>
        )}

        <section className="space-y-3 border rounded-2xl border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">개인정보 변경</h2>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="school">학교명 (정식학교명)</Label>
              <Input
                id="school"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gradeClass">학년 반 / 교과</Label>
              <Input
                id="gradeClass"
                value={gradeClass}
                onChange={(e) => setGradeClass(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">성명</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-2xl"
              />
            </div>
            <Button
              type="button"
              disabled={loading}
              onClick={handleSaveProfile}
              className="mt-1 rounded-2xl"
            >
              개인정보 저장
            </Button>
          </div>
        </section>

        {!isGoogleOnly && (
          <section className="space-y-3 border rounded-2xl border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-800">비밀번호 변경</h2>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">현재 비밀번호</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="rounded-2xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">새 비밀번호</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-2xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPasswordConfirm">새 비밀번호 확인</Label>
                <Input
                  id="newPasswordConfirm"
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  className="rounded-2xl"
                />
              </div>
              <Button
                type="button"
                disabled={loading}
                onClick={handleChangePassword}
                className="mt-1 rounded-2xl"
              >
                비밀번호 변경
              </Button>
            </div>
          </section>
        )}

        <section className="space-y-3 border rounded-2xl border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">데이터 초기화</h2>
          <p className="text-xs text-slate-500">
            교원역량진단, 실천계획, 마일리지, 성찰 관련 나의 데이터만 모두 삭제합니다. 계정은 유지됩니다.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={handleResetData}
            className="rounded-2xl border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            나의 앱 데이터 초기화
          </Button>
        </section>

        <section className="space-y-3 border rounded-2xl border-rose-200 bg-rose-50/40 p-4">
          <h2 className="text-sm font-semibold text-rose-800">회원탈퇴</h2>
          <p className="text-xs text-rose-700">
            계정과 함께 모든 데이터가 영구 삭제됩니다. 되돌릴 수 없습니다.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={handleDeleteAccount}
            className="rounded-2xl border-rose-400 text-rose-800 hover:bg-rose-100"
          >
            회원탈퇴
          </Button>
        </section>
      </div>
    </div>
  );
}

