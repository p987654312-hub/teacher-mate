"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type CardPageHeaderProps = {
  backHref?: string;
  backLabel?: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
};

/** 마일리지 페이지와 동일한 형식: 왼쪽 대시보드 링크, 오른쪽 아이콘+제목+설명 (모바일 안정 표기) */
export function CardPageHeader({
  backHref = "/dashboard",
  backLabel = "대시보드",
  icon,
  title,
  subtitle,
}: CardPageHeaderProps) {
  return (
    <header className="flex items-center gap-4">
      <Link
        href={backHref}
        className="inline-flex shrink-0 items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        <div className="shrink-0 rounded-2xl bg-violet-100 p-2.5 text-violet-600">
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">
            {title}
          </h1>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}
