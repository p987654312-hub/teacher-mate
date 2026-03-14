export default function ResultReportLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent" />
      <p className="text-center font-medium text-slate-700">보고서 페이지를 불러오는 중입니다.</p>
      <p className="text-sm text-slate-500">잠시만 기다려 주세요.</p>
    </div>
  );
}
