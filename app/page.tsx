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

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"teacher" | "admin">("teacher");
  const [isLogin, setIsLogin] = useState(true);
  const [teacherSchool, setTeacherSchool] = useState("");
  const [teacherGradeClass, setTeacherGradeClass] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [adminSchool, setAdminSchool] = useState("");
  const [adminGradeClass, setAdminGradeClass] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [teacherBetaCode, setTeacherBetaCode] = useState("");
  const [saveEmail, setSaveEmail] = useState(true);
  const [saveAdminEmail, setSaveAdminEmail] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("teacher_mate_save_email");
    const wantSave = saved !== "0";
    setSaveEmail(wantSave);
    if (wantSave) {
      const email = localStorage.getItem("teacher_mate_email");
      if (email) setTeacherEmail(email);
    }
    const adminSaved = localStorage.getItem("teacher_mate_save_admin_email");
    const wantSaveAdmin = adminSaved !== "0";
    setSaveAdminEmail(wantSaveAdmin);
    if (wantSaveAdmin) {
      const adminEmailVal = localStorage.getItem("teacher_mate_admin_email");
      if (adminEmailVal) setAdminEmail(adminEmailVal);
    }
  }, []);

  const handleAuth = async () => {
    const email = activeTab === "teacher" ? teacherEmail : adminEmail;
    const password = activeTab === "teacher" ? teacherPassword : adminPassword;
    const name = activeTab === "teacher" ? teacherName : adminName;
    const schoolName =
      activeTab === "teacher" ? teacherSchool : adminSchool;
    const gradeClass =
      activeTab === "teacher" ? teacherGradeClass : adminGradeClass;

    if (!email || !password) {
      alert("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }

    try {
      setIsLoading(true);

      if (isLogin) {
        // 로그인 모드
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) {
          alert(signInError.message);
          return;
        }

        if (typeof window !== "undefined") {
          if (activeTab === "teacher") {
            if (saveEmail) {
              localStorage.setItem("teacher_mate_email", email);
              localStorage.setItem("teacher_mate_save_email", "1");
            } else {
              localStorage.removeItem("teacher_mate_email");
              localStorage.setItem("teacher_mate_save_email", "0");
            }
          } else {
            if (saveAdminEmail) {
              localStorage.setItem("teacher_mate_admin_email", email);
              localStorage.setItem("teacher_mate_save_admin_email", "1");
            } else {
              localStorage.removeItem("teacher_mate_admin_email");
              localStorage.setItem("teacher_mate_save_admin_email", "0");
            }
          }
        }

        const displayName =
          (data.user?.user_metadata?.name as string | undefined) ||
          data.user?.email ||
          "사용자";

        alert(`${displayName}님 로그인 되었습니다.`);
        router.push("/dashboard");
      } else {
        // 회원가입 모드
        // 교사·관리자 모두 베타 이용을 위한 슈퍼관리자 비번 검증
        const betaCode = activeTab === "teacher" ? teacherBetaCode.trim() : adminCode.trim();
        if (!betaCode) {
          alert(activeTab === "teacher" ? "베타버전 이용코드를 입력해 주세요." : "관리자 인증코드가 올바르지 않습니다.");
          setIsLoading(false);
          return;
        }
        try {
          const res = await fetch("/api/admin/verify-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: betaCode }),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => null);
            const msg = (json?.error) ?? "인증코드가 올바르지 않습니다.";
            alert(msg);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error(error);
          alert("인증코드 확인 중 오류가 발생했습니다.");
          setIsLoading(false);
          return;
        }
        if (activeTab === "admin") {
          try {
            const countRes = await fetch("/api/admin/count-by-school", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ schoolName: (schoolName ?? "").trim() }),
            });
            if (countRes.ok) {
              const { adminCount } = await countRes.json();
              if (Number(adminCount) >= 3) {
                alert("해당 학교는 관리자가 3명으로 이미 만원입니다.");
                setIsLoading(false);
                return;
              }
            }
          } catch (e) {
            console.error(e);
          }
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: activeTab, // teacher / admin 구분 정보 메타데이터로 저장
              name,
              schoolName,
              gradeClass,
            },
          },
        });

        if (signUpError) {
          alert(signUpError.message);
          return;
        }

        const displayName =
          (data.user?.user_metadata?.name as string | undefined) ||
          data.user?.email ||
          "사용자";

        alert(`${displayName}님 로그인 되었습니다.`);
        router.push("/dashboard");
      }
    } catch (error) {
      console.error(error);
      alert("문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

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
              로그인 / 회원가입
            </h2>
            <p className="text-sm text-slate-500">
              교사를 위한 맞춤형 역량 개발 서비스를 시작해 보세요.
            </p>
          </header>

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
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAuth();
                  }}
                  className="space-y-4"
                >
                {!isLogin && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="teacher-school">학교명</Label>
                      <Input
                        id="teacher-school"
                        placeholder="예: 서울 OO초등학교"
                        className="rounded-2xl"
                        value={teacherSchool}
                        onChange={(e) => setTeacherSchool(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="teacher-grade-class">학년 반 / 교과</Label>
                      <Input
                        id="teacher-grade-class"
                        placeholder="예: 4-1 / 영어교과"
                        className="rounded-2xl"
                        value={teacherGradeClass}
                        onChange={(e) => setTeacherGradeClass(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="teacher-name">성명</Label>
                      <Input
                        id="teacher-name"
                        placeholder="이름을 입력하세요"
                        className="rounded-2xl"
                        value={teacherName}
                        onChange={(e) => setTeacherName(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-email">이메일</Label>
                  <Input
                    id="teacher-email"
                    type="email"
                    placeholder="example@school.kr"
                    className="rounded-2xl"
                    value={teacherEmail}
                    onChange={(e) => setTeacherEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="teacher-password">비밀번호</Label>
                  <Input
                    id="teacher-password"
                    type="password"
                    placeholder="비밀번호를 입력하세요"
                    className="rounded-2xl"
                    value={teacherPassword}
                    onChange={(e) => setTeacherPassword(e.target.value)}
                  />
                </div>
                {isLogin && (
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={saveEmail}
                      onChange={(e) => setSaveEmail(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-600 focus:ring-slate-400 focus:ring-offset-0"
                    />
                    이메일 저장
                  </label>
                )}
                {!isLogin && (
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
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white shadow-md hover:shadow-lg hover:opacity-95 transition disabled:opacity-70"
                >
                  {isLoading
                    ? "처리 중..."
                    : isLogin
                    ? "로그인하기"
                    : "회원가입하기"}
                </Button>

                <p className="mt-3 text-center text-xs text-slate-400">
                  {isLogin ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}{" "}
                  <button
                    type="button"
                    onClick={() => setIsLogin((prev) => !prev)}
                    className="font-medium text-[#3B82F6] hover:underline"
                  >
                    {isLogin ? "회원가입하기" : "로그인하기"}
                  </button>
                </p>
                </form>
              </TabsContent>

              {/* 관리자 탭 */}
              <TabsContent value="admin" className="mt-6 space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAuth();
                  }}
                  className="space-y-4"
                >
                {!isLogin && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-school">학교명</Label>
                      <Input
                        id="admin-school"
                        placeholder="예: 서울 OO초등학교"
                        className="rounded-2xl"
                        value={adminSchool}
                        onChange={(e) => setAdminSchool(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-grade-class">학년 반 / 교과</Label>
                      <Input
                        id="admin-grade-class"
                        placeholder="예: 4-1 / 영어교과"
                        className="rounded-2xl"
                        value={adminGradeClass}
                        onChange={(e) => setAdminGradeClass(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-name">관리자 성명</Label>
                      <Input
                        id="admin-name"
                        placeholder="이름을 입력하세요"
                        className="rounded-2xl"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email">이메일</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="example@school.kr"
                    className="rounded-2xl"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-password">비밀번호</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    placeholder="비밀번호를 입력하세요"
                    className="rounded-2xl"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                  />
                </div>
                {isLogin && (
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={saveAdminEmail}
                      onChange={(e) => setSaveAdminEmail(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-600 focus:ring-slate-400 focus:ring-offset-0"
                    />
                    이메일 저장
                  </label>
                )}
                {!isLogin && (
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-code">관리자 인증코드</Label>
                    <Input
                      id="admin-code"
                      placeholder="발급받은 인증코드를 입력하세요"
                      className="rounded-2xl"
                      value={adminCode}
                      onChange={(e) => setAdminCode(e.target.value)}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white shadow-md hover:shadow-lg hover:opacity-95 transition disabled:opacity-70"
                >
                  {isLoading
                    ? "처리 중..."
                    : isLogin
                    ? "로그인하기"
                    : "회원가입하기"}
                </Button>

                <p className="mt-3 text-center text-xs text-slate-400">
                  {isLogin ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}{" "}
                  <button
                    type="button"
                    onClick={() => setIsLogin((prev) => !prev)}
                    className="font-medium text-[#3B82F6] hover:underline"
                  >
                    {isLogin ? "회원가입하기" : "로그인하기"}
                  </button>
                </p>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
