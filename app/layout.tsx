import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NAVi로 찾아가는 목적지",
  description: "교사를 위한 맞춤형 역량 개발 서비스. 사전·사후 역량 진단, 자기역량개발계획, 목적지 마일리지, 성찰 기록장을 한곳에서 관리합니다.",
  icons: { icon: "/icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-white antialiased`}>
        <div className="flex min-h-screen flex-1 flex-col">
          <main className="flex-1 pb-6">{children}</main>
        </div>
        <footer className="fixed bottom-0 left-0 right-0 py-1 text-center text-[10px] text-slate-400 bg-transparent print:hidden">
          © 2026 Shingu.es. All rights reserved. Crafted with care by SG_NAVI Research Team
        </footer>
      </body>
    </html>
  );
}
