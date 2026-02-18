"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const errorParam = searchParams.get("error");

      if (errorParam) {
        router.replace(`/?error=${encodeURIComponent(errorParam)}`);
        return;
      }

      try {
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

        // 도메인 검증 (학교 구글 계정: .sen.go.kr 또는 .sen.es.kr로 끝나는 도메인 허용)
        const email = user.email;
        if (!email || (!email.endsWith(".sen.go.kr") && !email.endsWith(".sen.es.kr"))) {
          await supabase.auth.signOut();
          router.replace(`/?error=${encodeURIComponent(`학교 구글 계정(.sen.go.kr 또는 .sen.es.kr)만 로그인할 수 있습니다.`)}`);
          return;
        }

        // 첫 가입 여부 확인 (user_metadata에 role이 없으면 첫 가입)
        const metadata = user.user_metadata as { role?: string } | undefined;

        if (!metadata?.role) {
          window.location.href = "/auth/complete-profile";
          return;
        }

        // 기존 사용자: 로그인 포인트는 비동기로 요청만 하고 대기하지 않음 (대시보드로 바로 이동)
        const token = session?.access_token;
        if (token) {
          fetch("/api/points/login", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }

        window.location.href = "/dashboard";
      } catch (err) {
        router.replace(`/?error=${encodeURIComponent(`인증 처리 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`)}`);
      }
    };

    handleCallback();
  }, [router, searchParams]);

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
