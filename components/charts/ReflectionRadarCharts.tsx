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
    <div className="min-h-[280px] min-w-[200px]" style={{ width: "100%" }}>
    <ResponsiveContainer width="100%" height={280} minHeight={280} minWidth={200}>
      {hasPrePost && radarCompareData ? (
        <RadarChart data={radarCompareData} outerRadius="70%" margin={{ top: 20, right: 80, bottom: 20, left: 36 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="name"
            tick={(props) => {
              const { x, y, payload } = props as any;
              const value = String(payload?.value ?? "");
              const parts = value.split(/\s+/);
              const first = parts[0] ?? "";
              const rest = parts.slice(1).join(" ");
              return (
                <text x={x} y={y} textAnchor="middle" fill="#475569" fontSize={10}>
                  <tspan x={x} dy="-0.3em">{first}</tspan>
                  {rest && <tspan x={x} dy="1.1em">{rest}</tspan>}
                </text>
              );
            }}
            tickLine={false}
          />
          <Radar name="사전" dataKey="사전" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.25} strokeWidth={1} />
          <Radar name="사후" dataKey="사후" stroke="#6366f1" fill="transparent" fillOpacity={0} strokeWidth={1.5} />
        </RadarChart>
      ) : (
        <RadarChart data={domainAverages} outerRadius="70%" margin={{ top: 20, right: 80, bottom: 20, left: 36 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="name"
            tick={(props) => {
              const { x, y, payload } = props as any;
              const value = String(payload?.value ?? "");
              const parts = value.split(/\s+/);
              const first = parts[0] ?? "";
              const rest = parts.slice(1).join(" ");
              return (
                <text x={x} y={y} textAnchor="middle" fill="#475569" fontSize={10}>
                  <tspan x={x} dy="-0.3em">{first}</tspan>
                  {rest && <tspan x={x} dy="1.1em">{rest}</tspan>}
                </text>
              );
            }}
            tickLine={false}
          />
          <Radar name="역량" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
        </RadarChart>
      )}
    </ResponsiveContainer>
    </div>
  );
}
