"use client";

import { useState, useEffect } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Compass } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [teacherSchool, setTeacherSchool] = useState("");
  const [teacherGradeClass, setTeacherGradeClass] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [isAdminSignup, setIsAdminSignup] = useState(false);
  const [saveEmail, setSaveEmail] = useState(true);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
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
    setKeepLoggedIn(localStorage.getItem("teacher-mate-remember") === "1");
  }, []);

  // 구글 로그인 처리
  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("teacher-mate-remember", keepLoggedIn ? "1" : "0");
      }
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
    const email = teacherEmail;
    const password = teacherPassword;
    const name = teacherName;
    const schoolName = teacherSchool;
    const gradeClass = teacherGradeClass;

    if (!email || !password) {
      alert("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }

    try {
      setIsLoading(true);

      if (isLogin) {
        // 로그인 모드
        let data: { user?: { user_metadata?: { name?: string }; email?: string } | null; session?: { access_token?: string } | null };
        let signInError: { message: string } | null = null;
        try {
          const result = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          data = result.data;
          signInError = result.error;
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          if (msg === "Failed to fetch" || msg.includes("fetch") || msg.includes("network")) {
            alert("서버에 연결할 수 없습니다. 인터넷 연결과 환경 변수(NEXT_PUBLIC_SUPABASE_URL)를 확인해 주세요.");
          } else {
            alert(`로그인 요청 중 오류: ${msg}`);
          }
          return;
        }

        if (signInError) {
          alert(signInError.message);
          return;
        }
        if (!data?.user) {
          alert("로그인 응답을 받지 못했습니다. 다시 시도해 주세요.");
          return;
        }

        if (typeof window !== "undefined") {
          if (saveEmail) {
            localStorage.setItem("teacher_mate_email", email);
            localStorage.setItem("teacher_mate_save_email", "1");
          } else {
            localStorage.removeItem("teacher_mate_email");
            localStorage.setItem("teacher_mate_save_email", "0");
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
        // 학교 관리자 체크 시에만 슈퍼관리자 코드 검증 및 관리자 수 제한 확인
        if (isAdminSignup) {
          const betaCode = adminCode.trim();
          if (!betaCode) {
            alert("학교 관리자용 슈퍼관리자 코드를 입력해 주세요.");
            setIsLoading(false);
            return;
          }
          try {
            const res = await fetch("/api/admin/verify-code", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: betaCode,
                schoolName: (schoolName ?? "").trim(),
              }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) {
              const msg = json?.error ?? "인증코드가 올바르지 않습니다.";
              alert(msg);
              setIsLoading(false);
              return;
            }
            if (json?.adminCount != null && Number(json.adminCount) >= 3) {
              alert("해당 학교는 관리자가 3명으로 이미 만원입니다.");
              setIsLoading(false);
              return;
            }
          } catch (error) {
            console.error(error);
            alert("인증코드 확인 중 오류가 발생했습니다.");
            setIsLoading(false);
            return;
          }
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: isAdminSignup ? "admin" : "teacher", // 관리자 체크 여부로 역할 구분
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
              로그인
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAuth();
              }}
              className="mt-6 space-y-4"
            >
              <>
                <Button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white shadow-md hover:shadow-lg hover:opacity-95 transition disabled:opacity-70 flex items-center justify-center gap-2"
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
                  {isLogin ? "구글로 로그인 (@shingu.sen.es.kr)" : "구글로 가입하기 (@shingu.sen.es.kr)"}
                </Button>
                {isLogin && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={keepLoggedIn}
                      onChange={(e) => setKeepLoggedIn(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-600 focus:ring-slate-400 focus:ring-offset-0"
                    />
                    <span>로그인 유지 (브라우저를 닫아도 로그인 상태 유지)</span>
                  </label>
                )}
                <div className="relative mt-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-300" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-slate-500">또는</span>
                  </div>
                </div>
              </>

              {!isLogin && (
                <>
                  <div className="space-y-1.5 mt-4">
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
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={isAdminSignup}
                      onChange={(e) => setIsAdminSignup(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-600 focus:ring-slate-400 focus:ring-offset-0"
                    />
                    학교 관리자입니다
                  </label>
                  {isAdminSignup && (
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-code">슈퍼관리자 코드</Label>
                      <Input
                        id="admin-code"
                        type="password"
                        autoComplete="one-time-code"
                        placeholder="슈퍼관리자 코드를 입력하세요"
                        className="rounded-2xl"
                        value={adminCode}
                        onChange={(e) => setAdminCode(e.target.value)}
                        maxLength={32}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1.5 mt-4">
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
              {isLogin && (
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 transition disabled:opacity-70"
                >
                  {isLoading ? "처리 중..." : "이메일로 로그인하기"}
                </Button>
              )}
              {!isLogin && (
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 transition disabled:opacity-70"
                >
                  {isLoading ? "처리 중..." : "이메일로 회원가입하기"}
                </Button>
              )}

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
          </div>
        </div>
      </div>
    </div>
  );
}
