"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Text,
} from "recharts";
import { Card } from "@/components/ui/card";

type RadarComparePoint = { name: string; 사전: number; 사후: number };
/** 사후 보고서: 대영역별 막대그래프 행 (항목명 + 사전/사후 0~100) */
type BarComparePoint = { name: string; 사전: number; 사후: number };
type DomainAvg = { name: string; score: number };
/** 대영역별 막대 데이터 (카드당 1개) */
type BarChartDataByDomain = { label: string; rows: BarComparePoint[] }[];

const CARD_HEIGHT_MIN = 110;
const CARD_HEIGHT_MAX = 560;
const CARD_HEIGHT_PER_ROW = 46;

function cardHeight(rows: BarComparePoint[]): number {
  return Math.min(CARD_HEIGHT_MAX, Math.max(CARD_HEIGHT_MIN, rows.length * CARD_HEIGHT_PER_ROW));
}

const CARD_GAP = 12;

/** 소영역 개수(rows.length)가 같은 카드끼리 묶고, 묶음 단위로 왼쪽·오른쪽 열에 나누어 전체 세로 길이 최소화. */
function distributeIntoTwoColumns(items: { label: string; rows: BarComparePoint[] }[]): [{ label: string; rows: BarComparePoint[] }[], { label: string; rows: BarComparePoint[] }[]] {
  if (items.length === 0) return [[], []];
  // 소영역 개수별로 묶기 (2개짜리 끼리, 3개짜리 끼리, …)
  const bySize = new Map<number, { label: string; rows: BarComparePoint[] }[]>();
  for (const d of items) {
    const n = d.rows.length;
    if (!bySize.has(n)) bySize.set(n, []);
    bySize.get(n)!.push(d);
  }
  // 묶음별 높이 = 카드높이 * 장수 + (장수-1)*gap. 묶음 높이 큰 순으로 정렬.
  const groups = Array.from(bySize.entries()).map(([rowCount, cards]) => {
    const h = cardHeight(cards[0].rows);
    const groupHeight = h * cards.length + (cards.length - 1) * CARD_GAP;
    return { cards, groupHeight };
  });
  groups.sort((a, b) => b.groupHeight - a.groupHeight);
  const left: { label: string; rows: BarComparePoint[] }[] = [];
  const right: { label: string; rows: BarComparePoint[] }[] = [];
  let leftH = 0;
  let rightH = 0;
  for (const { cards } of groups) {
    if (leftH <= rightH) {
      left.push(...cards);
      leftH += cardHeight(cards[0].rows) * cards.length + (cards.length - 1) * CARD_GAP;
    } else {
      right.push(...cards);
      rightH += cardHeight(cards[0].rows) * cards.length + (cards.length - 1) * CARD_GAP;
    }
  }
  return [left, right];
}

type Props = {
  isPost: boolean;
  radarCompareData: RadarComparePoint[] | null;
  barChartDataByDomain?: BarChartDataByDomain | null;
  domainAverages: DomainAvg[];
  preDateStr: string;
  postDateStr: string;
};

export default function DiagnosisResultCharts({
  isPost,
  radarCompareData,
  barChartDataByDomain = null,
  domainAverages,
  preDateStr,
  postDateStr,
}: Props) {
  if (isPost && radarCompareData && barChartDataByDomain && barChartDataByDomain.length > 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* 좌측 1/2: 높이는 오른쪽 세로 최대값에 맞추고, 방사형 그래프는 세로 중앙 */}
        <Card className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 px-4 py-3 h-full flex flex-col min-h-0">
          <h2 className="text-base font-semibold text-slate-800 mb-1 shrink-0">역량 진단 결과 (사전·사후 비교)</h2>
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div className="w-full h-80 max-h-full print:min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart outerRadius="70%" data={radarCompareData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} />
                  <Radar name={preDateStr ? `사전 (${preDateStr})` : "사전"} dataKey="사전" stroke="#9ca3af" fill="#9ca3af" fillOpacity={0.25} />
                  <Radar name={postDateStr ? `사후 (${postDateStr})` : "사후"} dataKey="사후" stroke="#6366f1" strokeWidth={2} fill="transparent" fillOpacity={0} />
                  <Legend wrapperStyle={{ marginTop: "400px" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
        {/* 우측 1/2: 왼쪽 열에 긴 카드, 오른쪽 열에 짧은 카드 → 전체 세로 길이 최소 */}
        {(() => {
          const [leftCol, rightCol] = distributeIntoTwoColumns(barChartDataByDomain);
          const renderCard = ({ label, rows }: { label: string; rows: BarComparePoint[] }) => (
            <Card key={label} className="rounded-2xl border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/50 px-3 pt-1 pb-0.5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 leading-tight mb-0">{label}</h3>
              {/* 제목~그래프·카드 하단 여백 최소화, 그래프 크기는 유지 */}
              <div className="-mx-3 w-[calc(100%+1.5rem)] shrink-0 overflow-visible -mt-0.5 -mb-0.5" style={{ height: cardHeight(rows) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rows}
                    layout="vertical"
                    margin={{ top: 6, right: 6, left: 6, bottom: 6 }}
                    barCategoryGap="14%"
                    barGap={2}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tick={(props) => {
                        const value = props.payload?.value ?? props.payload ?? "";
                        return (
                          <Text {...props} width={88} maxLines={1} style={{ fontSize: 11 }}>{String(value)}</Text>
                        );
                      }}
                    />
                    <Tooltip
                      formatter={(value: number | undefined, name: string): [string, string] => [
                        value != null ? `${Number(value)}점` : "-",
                        name === "사전" ? "사전 (100점 환산)" : "사후 (100점 환산)",
                      ]}
                    />
                    <Bar name="사전" dataKey="사전" radius={[0, 2, 2, 0]} barSize={8} fill="#9ca3af" />
                    <Bar name="사후" dataKey="사후" radius={[0, 2, 2, 0]} barSize={8} fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          );
          return (
            <div className="grid grid-cols-2 gap-3 items-start">
              <div className="flex flex-col gap-3">{leftCol.map(renderCard)}</div>
              <div className="flex flex-col gap-3">{rightCol.map(renderCard)}</div>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="h-72 w-full mb-0 print:min-h-[16rem] print:h-[16rem]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart
          outerRadius="58%"
          data={domainAverages}
          margin={{ top: 24, right: 48, bottom: 24, left: 48 }}
        >
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 22, fontWeight: 700 }} />
          <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} />
          <Radar name="역량 진단" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
