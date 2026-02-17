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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // URL 파라미터에서 에러 확인
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      if (error) {
        setErrorMessage(decodeURIComponent(error));
        // URL에서 에러 파라미터 제거
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

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

  // 구글 로그인 처리
  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account", // 계정 선택 화면 표시
          },
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        setErrorMessage(`구글 로그인 오류: ${error.message}`);
        setIsLoading(false);
        return;
      }

      // OAuth 리다이렉트가 시작되면 로딩 상태 유지
      // 실제 검증은 콜백 페이지에서 수행
    } catch (error) {
      console.error("Google sign in error:", error);
      setErrorMessage("구글 로그인 중 오류가 발생했습니다.");
      setIsLoading(false);
    }
  };

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

        let pointMsg = "";
        const token = data.session?.access_token;
        if (token) {
          try {
            const res = await fetch("/api/points/login", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const j = await res.json();
              if (j.added > 0) pointMsg = `\n로그인 성공과 함께 열정 포인트 +${j.added}점 획득했습니다.`;
            }
          } catch {
            // ignore
          }
        }
        alert(`${displayName}님 로그인 되었습니다.${pointMsg}`);
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

        const token = data.session?.access_token;
        if (token) {
          try {
            await fetch("/api/points/init", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            });
          } catch {
            // ignore
          }
        }
        alert(`${displayName}님 가입되었습니다. 열정 포인트 100점으로 시작합니다.`);
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
                      <Label htmlFor="teacher-school">학교명 (정식학교명)</Label>
                      <Input
                        id="teacher-school"
                        placeholder="예: 서울00초등학교"
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

                {isLogin && (
                  <>
                    <div className="relative mt-2">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-300" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-slate-500">또는</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      구글로 로그인 (@shingu.sen.es.kr)
                    </Button>
                  </>
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
                      <Label htmlFor="admin-school">학교명 (정식학교명)</Label>
                      <Input
                        id="admin-school"
                        placeholder="예: 서울00초등학교"
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
