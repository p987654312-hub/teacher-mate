"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";

type RadarComparePoint = { name: string; 사전: number; 사후: number };
type BarPoint = { name: string; 점수: number };
type DomainAvg = { name: string; score: number };

type Props = {
  isPost: boolean;
  radarCompareData: RadarComparePoint[] | null;
  barChartData: BarPoint[] | null;
  domainAverages: DomainAvg[];
  preDateStr: string;
  postDateStr: string;
  improvedDomains?: string[];
};

export default function DiagnosisResultCharts({
  isPost,
  radarCompareData,
  barChartData,
  domainAverages,
  preDateStr,
  postDateStr,
  improvedDomains = [],
}: Props) {
  if (isPost && radarCompareData && barChartData) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 px-4 py-3 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-1">역량 진단 결과 (사전·사후 비교)</h2>
          <div className="-mt-[1cm] h-96 w-full print:min-h-[21rem] print:h-[21rem]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart outerRadius="70%" data={radarCompareData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 14, fontWeight: 600 }} />
              <Radar name={preDateStr ? `사전 (${preDateStr})` : "사전"} dataKey="사전" stroke="#9ca3af" fill="#9ca3af" fillOpacity={0.25} />
              <Radar name={postDateStr ? `사후 (${postDateStr})` : "사후"} dataKey="사후" stroke="#6366f1" strokeWidth={2} fill="transparent" fillOpacity={0} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
          </div>
        </Card>
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 px-4 py-3 shadow-sm flex flex-col">
          <h2 className="text-base font-semibold text-slate-800 mb-2">향상된 영역</h2>
          <p className="text-xs text-slate-700 mb-4 leading-relaxed">
            {improvedDomains.length > 0 ? improvedDomains.join(" / ") : "향상된 영역 없음"}
          </p>
          <h2 className="text-base font-semibold text-slate-800 mb-1">총점 비교</h2>
          <div className="flex-1 min-h-[100px] w-full print:min-h-[6rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} layout="vertical" margin={{ top: 4, right: 20, left: 36, bottom: 4 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={32} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number | undefined): [string, string] => [
                    value != null ? `${Number(value).toFixed(1)}점` : "-",
                    "총점(100점 환산)",
                  ]}
                />
                <Bar name="총점(100점 환산)" dataKey="점수" radius={[0, 4, 4, 0]} barSize={24}>
                  {barChartData?.map((entry) => (
                    <Cell key={entry.name} fill={entry.name === "사전" ? "#9ca3af" : "#6366f1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-72 w-full mb-0 print:min-h-[16rem] print:h-[16rem]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart
          outerRadius="70%"
          data={domainAverages}
        >
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 19, fontWeight: 700 }} />
          <Radar name="역량 진단" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
