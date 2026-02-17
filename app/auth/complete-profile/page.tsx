"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from "@/components/ui/tabs";
import { Compass } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function CompleteProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"teacher" | "admin">("teacher");
  const [schoolName, setSchoolName] = useState("");
  const [gradeClass, setGradeClass] = useState("");
  const [name, setName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [teacherBetaCode, setTeacherBetaCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (!user) {
        router.replace("/");
        return;
      }

      // 이미 프로필이 완성된 사용자는 대시보드로 리다이렉트
      const metadata = user.user_metadata as { role?: string } | undefined;
      if (metadata?.role) {
        router.replace("/dashboard");
        return;
      }

      setUserEmail(user.email ?? null);
      setIsChecking(false);
    };

    checkSession();
  }, [router]);

  const handleCompleteProfile = async () => {
    if (!name.trim() || !schoolName.trim()) {
      setErrorMessage("이름과 학교명을 모두 입력해 주세요.");
      return;
    }

    if (activeTab === "teacher" && !teacherBetaCode.trim()) {
      setErrorMessage("베타버전 이용코드를 입력해 주세요.");
      return;
    }

    if (activeTab === "admin" && !adminCode.trim()) {
      setErrorMessage("관리자 인증코드를 입력해 주세요.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      // 베타코드/관리자코드 검증
      const code = activeTab === "teacher" ? teacherBetaCode.trim() : adminCode.trim();
      const res = await fetch("/api/admin/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const msg = (json?.error) ?? "인증코드가 올바르지 않습니다.";
        setErrorMessage(msg);
        setIsLoading(false);
        return;
      }

      // 관리자인 경우 학교당 관리자 수 확인
      if (activeTab === "admin") {
        try {
          const countRes = await fetch("/api/admin/count-by-school", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ schoolName: schoolName.trim() }),
          });
          if (countRes.ok) {
            const { adminCount } = await countRes.json();
            if (Number(adminCount) >= 3) {
              setErrorMessage("해당 학교는 관리자가 3명으로 이미 만원입니다.");
              setIsLoading(false);
              return;
            }
          }
        } catch (e) {
          console.error(e);
        }
      }

      // 프로필 완성 API 호출
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErrorMessage("세션이 만료되었습니다. 다시 로그인해 주세요.");
        setIsLoading(false);
        return;
      }

      const completeRes = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          role: activeTab,
          name: name.trim(),
          schoolName: schoolName.trim(),
          gradeClass: gradeClass.trim(),
        }),
      });

      if (!completeRes.ok) {
        const json = await completeRes.json().catch(() => null);
        const msg = (json?.error) ?? "프로필 저장 중 오류가 발생했습니다.";
        setErrorMessage(msg);
        setIsLoading(false);
        return;
      }

      // 포인트 초기화 (신규 가입)
      try {
        await fetch("/api/points/init", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      } catch {
        // ignore
      }

      alert(`${name.trim()}님 가입되었습니다. 열정 포인트 100점으로 시작합니다.`);
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      setErrorMessage("문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-slate-600">확인 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <div className="flex items-center gap-3">
            <Compass className="h-7 w-7 shrink-0 text-slate-500" aria-hidden />
            <span className="text-2xl font-semibold tracking-tight text-slate-800">
              <span className="text-orange-500">N</span>
              <span className="mx-1 inline-block h-1 w-1 shrink-0 rounded-sm bg-slate-400 align-middle" aria-hidden />
              <span className="text-amber-800">A</span>
              <span className="mx-1 inline-block h-1 w-1 shrink-0 rounded-sm bg-slate-400 align-middle" aria-hidden />
              <span className="text-rose-500">V</span>
              <span className="mx-1 inline-block h-1 w-1 shrink-0 rounded-sm bg-slate-400 align-middle" aria-hidden />
              <span className="text-blue-800">i</span>
              <span className="text-slate-700">로 찾아가는 목적지</span>
            </span>
          </div>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 p-8 shadow-xl backdrop-blur-sm border border-slate-200/80">
          <header className="mb-6 space-y-1">
            <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
              추가 정보 입력
            </h2>
            <p className="text-sm text-slate-500">
              구글 계정으로 로그인하셨습니다. 아래 정보를 입력해 주세요.
            </p>
            {userEmail && (
              <p className="text-xs text-slate-400 mt-1">
                이메일: {userEmail}
              </p>
            )}
          </header>

          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-800">{errorMessage}</p>
            </div>
          )}

          <div className="w-full">
            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as "teacher" | "admin")
              }
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 rounded-full bg-slate-100 p-1">
                <TabsTrigger
                  value="teacher"
                  className="rounded-full data-[state=active]:bg-white data-[state=active]:text-slate-900"
                >
                  교사
                </TabsTrigger>
                <TabsTrigger
                  value="admin"
                  className="rounded-full data-[state=active]:bg-white data-[state=active]:text-slate-900"
                >
                  관리자
                </TabsTrigger>
              </TabsList>

              {/* 교사 탭 */}
              <TabsContent value="teacher" className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-school">학교명 (정식학교명)</Label>
                  <Input
                    id="teacher-school"
                    placeholder="예: 서울00초등학교"
                    className="rounded-2xl"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-grade-class">학년 반 / 교과</Label>
                  <Input
                    id="teacher-grade-class"
                    placeholder="예: 4-1 / 영어교과"
                    className="rounded-2xl"
                    value={gradeClass}
                    onChange={(e) => setGradeClass(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-name">성명</Label>
                  <Input
                    id="teacher-name"
                    placeholder="이름을 입력하세요"
                    className="rounded-2xl"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-beta-code">베타버전 이용코드</Label>
                  <Input
                    id="teacher-beta-code"
                    placeholder="발급받은 코드를 입력하세요"
                    className="rounded-2xl"
                    value={teacherBetaCode}
                    onChange={(e) => setTeacherBetaCode(e.target.value)}
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleCompleteProfile}
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white shadow-md hover:shadow-lg hover:opacity-95 transition disabled:opacity-70"
                >
                  {isLoading ? "처리 중..." : "가입 완료"}
                </Button>
              </TabsContent>

              {/* 관리자 탭 */}
              <TabsContent value="admin" className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-school">학교명 (정식학교명)</Label>
                  <Input
                    id="admin-school"
                    placeholder="예: 서울00초등학교"
                    className="rounded-2xl"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-grade-class">학년 반 / 교과</Label>
                  <Input
                    id="admin-grade-class"
                    placeholder="예: 4-1 / 영어교과"
                    className="rounded-2xl"
                    value={gradeClass}
                    onChange={(e) => setGradeClass(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-name">관리자 성명</Label>
                  <Input
                    id="admin-name"
                    placeholder="이름을 입력하세요"
                    className="rounded-2xl"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-code">슈퍼관리자 코드</Label>
                  <Input
                    id="admin-code"
                    placeholder="슈퍼관리자 코드를 입력하세요"
                    className="rounded-2xl"
                    value={adminCode}
                    onChange={(e) => setAdminCode(e.target.value)}
                    maxLength={3}
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleCompleteProfile}
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white shadow-md hover:shadow-lg hover:opacity-95 transition disabled:opacity-70"
                >
                  {isLoading ? "처리 중..." : "가입 완료"}
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
