"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

type Props = {
  data: { name: string; score: number }[];
};

export default function DashboardDiagnosisRadar({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={176} minWidth={200}>
      <RadarChart outerRadius="76%" data={data}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fill: "#6b7280", fontSize: 11 }}
        />
        <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} />
        <Radar
          name="역량 진단"
          dataKey="score"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.35}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
