"use client";

import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

type ComparePoint = { name: string; 사전: number; 사후: number };
type AvgPoint = { name: string; score: number };

type Props = {
  radarCompareData: ComparePoint[] | null;
  domainAverages: AvgPoint[];
  hasPrePost: boolean;
};

export default function ReflectionRadarCharts({ radarCompareData, domainAverages, hasPrePost }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      {hasPrePost && radarCompareData ? (
        <RadarChart data={radarCompareData} outerRadius="62%" margin={{ top: 24, right: 80, bottom: 24, left: 36 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="name" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} />
          <Radar name="사전" dataKey="사전" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.25} strokeWidth={1} />
          <Radar name="사후" dataKey="사후" stroke="#6366f1" fill="transparent" fillOpacity={0} strokeWidth={1.5} />
        </RadarChart>
      ) : (
        <RadarChart data={domainAverages} outerRadius="62%" margin={{ top: 24, right: 80, bottom: 24, left: 36 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="name" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} />
          <Radar name="역량" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
        </RadarChart>
      )}
    </ResponsiveContainer>
  );
}
