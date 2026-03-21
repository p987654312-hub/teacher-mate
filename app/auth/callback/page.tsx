"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const handleCallback = async () => {
      const code = searchParams.get("code");
      const errorParam = searchParams.get("error");

      if (errorParam) {
        router.replace(`/?error=${encodeURIComponent(errorParam)}`);
        return;
      }

      try {
        // 로그인 유지 체크값은 로그인 페이지에서 리다이렉트 전에 이미 저장됨.
        // Supabase 클라이언트는 이 값을 보고 localStorage/sessionStorage를 선택하므로
        // exchangeCodeForSession 전에 한 번 더 읽어 두면 올바른 저장소에 세션이 저장됨.
        let user = null;
        let session = null;

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            router.replace(`/?error=${encodeURIComponent(exchangeError.message || "exchange_failed")}`);
            return;
          }

          user = data.user;
          session = data.session;
        } else {
          const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            router.replace(`/?error=${encodeURIComponent("세션을 확인할 수 없습니다.")}`);
            return;
          }

          if (!existingSession) {
            router.replace(`/?error=${encodeURIComponent("세션이 없습니다. 다시 로그인해 주세요.")}`);
            return;
          }

          session = existingSession;
          user = existingSession.user;
        }

        if (!user) {
          router.replace(`/?error=${encodeURIComponent("사용자 정보를 가져올 수 없습니다.")}`);
          return;
        }

        // 첫 가입 여부 확인 (user_metadata에 role이 없으면 첫 가입)
        const metadata = user.user_metadata as { role?: string } | undefined;

        if (!metadata?.role) {
          window.location.href = "/auth/complete-profile";
          return;
        }

        // 기존 사용자: API로 저장된 개인정보를 user_metadata에 반영 시도 (실패해도 로그인은 진행)
        try {
          const token = session?.access_token;
          if (token) {
            const res = await fetch("/api/account/profile-overrides", { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
              const overrides = (await res.json()) as { name?: string | null; schoolName?: string | null; gradeClass?: string | null };
              if (overrides && (overrides.name != null || overrides.schoolName != null || overrides.gradeClass != null)) {
                const next = { ...(user.user_metadata || {}), ...overrides };
                await supabase.auth.updateUser({ data: next });
              }
            }
          }
        } catch {
          // 프로필 복원 실패해도 로그인은 정상 진행
        }

        window.location.href = "/dashboard";
      } catch (err) {
        router.replace(`/?error=${encodeURIComponent(`인증 처리 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`)}`);
      }
    };

    handleCallback();
  }, [router, searchParams.get("code") ?? "", searchParams.get("error") ?? ""]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-slate-600">로그인 처리 중...</div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-slate-600">로그인 처리 중...</div>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
