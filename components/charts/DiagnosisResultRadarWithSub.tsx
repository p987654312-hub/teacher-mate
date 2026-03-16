"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

type DomainAvg = { name: string; score: number };
type SubDomainScore = { name: string; avg: number };

type Props = {
  domainAverages: DomainAvg[];
  subDomainScoresByDomain: Record<string, SubDomainScore[]>;
  domainLabels: Record<string, string>;
  /** 영역 키 순서 (예: ["domain1","domain2",...]). 없으면 domain1~4 사용 */
  domainOrder?: readonly string[];
};

const DEFAULT_DOMAIN_ORDER = ["domain1", "domain2", "domain3", "domain4"] as const;
const BAR_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#c084fc"];

function SubBarBlock({
  domainKey,
  label,
  items,
  color,
}: {
  domainKey: string;
  label: string;
  items: SubDomainScore[];
  color: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col rounded-lg border border-slate-200/80 bg-white/80 py-1 px-2 shadow-sm min-w-0 overflow-visible">
      <span className="text-[12px] font-semibold text-slate-600 mb-0.5 truncate" title={label}>
        {label}
      </span>
      <div className="flex flex-col gap-1.5 py-0.5 pl-3">
        {items.map((s) => {
          const score = Math.round(s.avg * 10) / 10;
          const pct = Math.min(100, (score / 5) * 100);
          return (
            <div key={s.name} className="flex items-center gap-2 min-h-[20px]">
              <span
                className="shrink-0 min-w-[72px] max-w-[140px] text-[11px] text-slate-700 font-medium whitespace-normal break-words"
                title={s.name}
              >
                {s.name}
              </span>
              <div className="flex-1 min-w-0 h-[6px] rounded-sm bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }}
                />
              </div>
              <span className="shrink-0 text-[11px] text-slate-500 w-6 text-right">{score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DiagnosisResultRadarWithSub({
  domainAverages,
  subDomainScoresByDomain,
  domainLabels,
  domainOrder = DEFAULT_DOMAIN_ORDER,
}: Props) {
  const baseOrder = domainOrder.length ? domainOrder : DEFAULT_DOMAIN_ORDER;
  const order = [...baseOrder]
    .map((key, i) => ({ key, score: domainAverages[i]?.score ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.key);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4 w-full items-start overflow-visible">
      {/* 좌측 2/3: 대영역 방사형 (크기/텍스트 80% 수준으로 축소) */}
      <div className="w-full pt-0 px-0 overflow-visible flex items-start justify-center -mt-1">
        <div className="w-full aspect-square max-w-[440px] sm:max-w-[520px] max-sm:max-w-[440px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              data={domainAverages}
              outerRadius="63%"
              margin={{ top: 20, right: 48, bottom: 20, left: 48 }}
            >
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis
                dataKey="name"
                tick={(props) => {
                  const { x, y, payload } = props as any;
                  const value: string = String(payload?.value ?? "");
                  // 최대 너비를 정해서 긴 텍스트는 2~3줄로 줄바꿈 (가운데 정렬)
                  const maxCharsPerLine = 7;
                  const words = value.split(/\s+/);
                  const lines: string[] = [];
                  let current = "";
                  for (const w of words) {
                    if ((current + " " + w).trim().length > maxCharsPerLine && current) {
                      lines.push(current);
                      current = w;
                    } else {
                      current = current ? current + " " + w : w;
                    }
                  }
                  if (current) lines.push(current);
                  const maxLines = 3;
                  const sliced = lines.slice(0, maxLines);
                  const lineHeight = 1.1;
                  const startDy = -((sliced.length - 1) * lineHeight) / 2;
                  return (
                    <text x={x} y={y} textAnchor="middle" fill="#6b7280" fontSize={13} fontWeight={600}>
                      {sliced.map((line, idx) => (
                        <tspan key={idx} x={x} dy={`${idx === 0 ? startDy : lineHeight}em`}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  );
                }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 5]}
                tick={false}
              />
              <Radar name="대영역" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 우측 1/4: 대영역별 소영역 막대그래프 (점수 높은 순 정렬) */}
      <div className="flex flex-col gap-1.5 min-w-[200px] w-full">
        {order.map((key, i) => (
          <SubBarBlock
            key={key}
            domainKey={key}
            label={domainLabels[key] ?? key}
            items={subDomainScoresByDomain[key] ?? []}
            color={BAR_COLORS[i % BAR_COLORS.length]}
          />
        ))}
      </div>
    </div>
  );
}
