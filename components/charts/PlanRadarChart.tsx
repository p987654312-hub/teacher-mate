"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

type Props = {
  data: { name: string; score: number }[];
};

export default function PlanRadarChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => b.score - a.score);
  const strengthNames = new Set(sorted.slice(0, 3).map((d) => d.name));
  const weaknessNames = new Set(sorted.slice(-3).map((d) => d.name));

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={176} minWidth={200}>
      <RadarChart outerRadius="64%" data={data}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="name"
          tick={(props) => {
            const p = props as { x?: number; y?: number; cx?: number; cy?: number; payload?: { value?: string } };
            const { x, y, cx, cy, payload } = p;
            const pushOut = 1.25;
            const numX = typeof x === "number" ? x : 0;
            const numY = typeof y === "number" ? y : 0;
            const dx = numX - (cx ?? numX);
            const dy = numY - (cy ?? numY);
            const outX = (cx ?? numX) + dx * pushOut;
            const outY = (cy ?? numY) + dy * pushOut;
            const name = payload?.value ?? "";
            const isStrength = strengthNames.has(name);
            const isWeakness = weaknessNames.has(name);
            const color = isStrength ? "#1d4ed8" : isWeakness ? "#c2410c" : "#6b7280";
            return (
              <g transform={`translate(${outX}, ${outY})`}>
                <foreignObject
                  x={-48}
                  y={-8}
                  width={96}
                  height={20}
                  style={{ overflow: "visible" }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color,
                      fontWeight: 700,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </div>
                </foreignObject>
              </g>
            );
          }}
        />
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
