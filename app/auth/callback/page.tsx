"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const errorParam = searchParams.get("error");

      console.log("Callback page loaded, code:", !!code, "error:", errorParam);

      if (errorParam) {
        console.error("OAuth error:", errorParam);
        router.replace(`/?error=${encodeURIComponent(errorParam)}`);
        return;
      }

      try {
        let user = null;
        let session = null;

        if (code) {
          // code가 있으면 세션으로 교환
          console.log("Exchanging code for session...");
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error("Exchange error:", exchangeError);
            router.replace(`/?error=${encodeURIComponent(exchangeError.message || "exchange_failed")}`);
            return;
          }

          user = data.user;
          session = data.session;
        } else {
          // code가 없으면 기존 세션 확인 (Supabase가 이미 세션을 생성한 경우)
          console.log("No code parameter, checking existing session...");
          await new Promise(resolve => setTimeout(resolve, 500)); // Supabase 세션 저장 대기
          
          const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            console.error("Session error:", sessionError);
            router.replace(`/?error=${encodeURIComponent("세션을 확인할 수 없습니다.")}`);
            return;
          }

          if (!existingSession) {
            console.error("No existing session found");
            router.replace(`/?error=${encodeURIComponent("세션이 없습니다. 다시 로그인해 주세요.")}`);
            return;
          }

          session = existingSession;
          user = existingSession.user;
        }

        if (!user) {
          console.error("No user data");
          router.replace(`/?error=${encodeURIComponent("사용자 정보를 가져올 수 없습니다.")}`);
          return;
        }

        console.log("User email:", user.email);
        console.log("Session:", !!session);

        // 도메인 검증 (학교 구글 계정: .sen.go.kr 또는 .sen.es.kr로 끝나는 도메인 허용)
        const email = user.email;
        if (!email || (!email.endsWith(".sen.go.kr") && !email.endsWith(".sen.es.kr"))) {
          console.error("Invalid domain:", email);
          await supabase.auth.signOut();
          router.replace(`/?error=${encodeURIComponent(`학교 구글 계정(.sen.go.kr 또는 .sen.es.kr)만 로그인할 수 있습니다.`)}`);
          return;
        }

        console.log("Domain validated");

        // 첫 가입 여부 확인 (user_metadata에 role이 없으면 첫 가입)
        const metadata = user.user_metadata as { role?: string } | undefined;
        console.log("User metadata:", metadata);
        
        if (!metadata?.role) {
          console.log("First time user, redirecting to complete-profile");
          // 세션이 저장되도록 대기
          await new Promise(resolve => setTimeout(resolve, 500));
          window.location.href = "/auth/complete-profile";
          return;
        }

        console.log("Existing user, role:", metadata.role);

        // 기존 사용자: 로그인 포인트 추가
        const token = session?.access_token;
        if (token) {
          try {
            await fetch("/api/points/login", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            });
          } catch (err) {
            console.error("Points login error:", err);
          }
        }

        console.log("Redirecting to dashboard");
        // 세션이 저장되도록 대기 후 대시보드로 리다이렉트
        await new Promise(resolve => setTimeout(resolve, 500));
        window.location.href = "/dashboard";
      } catch (err) {
        console.error("Callback error:", err);
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
