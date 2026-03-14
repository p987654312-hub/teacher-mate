"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Text,
} from "recharts";
import { Card } from "@/components/ui/card";

export type BarComparePoint = { name: string; 사전: number; 사후: number };
type BarChartDataByDomain = { label: string; rows: BarComparePoint[] }[];

const CARD_HEIGHT_MIN = 110;
const CARD_HEIGHT_MAX = 560;
const CARD_HEIGHT_PER_ROW = 46;

function cardHeight(rows: BarComparePoint[]): number {
  return Math.min(CARD_HEIGHT_MAX, Math.max(CARD_HEIGHT_MIN, rows.length * CARD_HEIGHT_PER_ROW));
}

const CARD_GAP = 12;

function distributeIntoTwoColumns(items: { label: string; rows: BarComparePoint[] }[]): [BarChartDataByDomain, BarChartDataByDomain] {
  if (items.length === 0) return [[], []];
  const bySize = new Map<number, { label: string; rows: BarComparePoint[] }[]>();
  for (const d of items) {
    const n = d.rows.length;
    if (!bySize.has(n)) bySize.set(n, []);
    bySize.get(n)!.push(d);
  }
  const groups = Array.from(bySize.entries()).map(([rowCount, cards]) => {
    const h = cardHeight(cards[0].rows);
    const groupHeight = h * cards.length + (cards.length - 1) * CARD_GAP;
    return { cards, groupHeight };
  });
  groups.sort((a, b) => b.groupHeight - a.groupHeight);
  const left: BarChartDataByDomain = [];
  const right: BarChartDataByDomain = [];
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
  barChartDataByDomain: BarChartDataByDomain;
  className?: string;
};

export default function SubDomainBarCharts({ barChartDataByDomain, className = "" }: Props) {
  if (!barChartDataByDomain?.length) return null;
  const [leftCol, rightCol] = distributeIntoTwoColumns(barChartDataByDomain);
  const renderCard = ({ label, rows }: { label: string; rows: BarComparePoint[] }) => (
    <Card key={label} className="rounded-xl border-slate-200 bg-slate-50/50 px-3 pt-1 pb-0.5 shadow-sm print:shadow-none">
      <h3 className="text-sm font-semibold text-slate-800 leading-tight mb-0">{label}</h3>
      <div className="-mx-3 w-[calc(100%+1.5rem)] shrink-0 overflow-visible -mt-0.5 -mb-0.5" style={{ height: cardHeight(rows), minHeight: 120 }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={120} minWidth={200}>
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
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 items-start ${className}`}>
      <div className="flex flex-col gap-3">{leftCol.map(renderCard)}</div>
      <div className="flex flex-col gap-3">{rightCol.map(renderCard)}</div>
    </div>
  );
}
