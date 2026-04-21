"use client";

import { useState } from "react";
import { format, subMonths, subYears } from "date-fns";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DataPoint {
  date: string;
  price: number;
  title?: string;
  listing_url?: string;
}

interface BuyPoint {
  date: string;
  price: number;
  label: string;
}

interface PriceChartProps {
  data: DataPoint[];
  buyPoints?: BuyPoint[];
  height?: number;
}

interface ChartRow {
  ts: number;
  price: number;
  title?: string;
}

interface WeekRow {
  ts: number;
  avg: number;
  count: number;
}

type TimeRange = "1m" | "3m" | "6m" | "1y" | "all";

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "1M",  value: "1m"  },
  { label: "3M",  value: "3m"  },
  { label: "6M",  value: "6m"  },
  { label: "1Y",  value: "1y"  },
  { label: "All", value: "all" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function rangeStart(range: TimeRange): number {
  const now = new Date();
  switch (range) {
    case "1m":  return subMonths(now, 1).getTime();
    case "3m":  return subMonths(now, 3).getTime();
    case "6m":  return subMonths(now, 6).getTime();
    case "1y":  return subYears(now, 1).getTime();
    default:    return 0;
  }
}

function monthlyTicks(minTs: number, maxTs: number): number[] {
  const ticks: number[] = [];
  const end = new Date(maxTs);
  let d = new Date(new Date(minTs).getFullYear(), new Date(minTs).getMonth(), 1);
  while (d.getTime() < minTs) d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  while (d <= end) {
    ticks.push(d.getTime());
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return ticks;
}

function medianOf(prices: number[]): number {
  const s = [...prices].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function iqrCap(prices: number[]): { cap: number; outlierCount: number } {
  const s = [...prices].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  const iqr = q3 - q1;
  const cap = q3 + iqr * 3;
  const outlierCount = s.filter((v) => v > cap).length;
  return { cap, outlierCount };
}

function weekStart(ts: number): number {
  const d = new Date(ts);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

function buildWeeklyAvg(rows: ChartRow[]): WeekRow[] {
  const map = new Map<number, number[]>();
  for (const row of rows) {
    const wk = weekStart(row.ts);
    if (!map.has(wk)) map.set(wk, []);
    map.get(wk)!.push(row.price);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, prices]) => ({
      ts,
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length,
    }));
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface WeekTooltipProps {
  active?: boolean;
  payload?: { payload: WeekRow }[];
}

function WeekTooltip({ active, payload }: WeekTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-zinc-900 border border-indigo-800/50 rounded-lg p-3 text-sm shadow-xl shadow-black/40">
      <p className="text-indigo-400 font-bold text-base">Avg ${d.avg.toFixed(2)}</p>
      <p className="text-slate-400 text-xs mt-1">
        Week of {format(new Date(d.ts), "MMM d, yyyy")}
      </p>
      <p className="text-slate-500 text-xs">{d.count} sale{d.count > 1 ? "s" : ""}</p>
    </div>
  );
}

// ── Chart ─────────────────────────────────────────────────────────────────────

export function PriceChart({
  data,
  buyPoints = [],
  height = 300,
}: PriceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-slate-500 text-sm" style={{ height }}>
        No price history data
      </div>
    );
  }

  const allRows: ChartRow[] = data
    .map((d) => ({ ts: new Date(d.date).getTime(), price: d.price, title: d.title }))
    .sort((a, b) => a.ts - b.ts);

  const cutoff = rangeStart(timeRange);
  const chartData = cutoff > 0 ? allRows.filter((r) => r.ts >= cutoff) : allRows;

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center text-slate-500 text-sm" style={{ height }}>
        No data in selected time range
      </div>
    );
  }

  const minTs = chartData[0].ts;
  const maxTs = chartData[chartData.length - 1].ts;

  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const { cap, outlierCount } = iqrCap(prices);
  const visibleMax = Math.max(...prices.filter((p) => p <= cap));

  // Include buy price levels in Y domain so horizontal lines are visible
  const buyPrices = buyPoints.map((b) => b.price);
  const effectiveMax = Math.max(visibleMax, ...buyPrices);
  const effectiveMin = Math.min(minPrice, ...buyPrices);

  const pad  = (effectiveMax - effectiveMin) * 0.12 || effectiveMax * 0.12 || 5;
  const minY = Math.max(0, Math.floor(effectiveMin - pad));
  const maxY = Math.ceil(effectiveMax + pad);

  const median = medianOf(prices);
  const ticks  = monthlyTicks(minTs, maxTs);
  const weeklyData = buildWeeklyAvg(chartData);

  return (
    <div>
      {/* Time range pills + outlier badge */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {TIME_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setTimeRange(r.value)}
            className={`text-xs px-2.5 py-1 rounded border transition-all ${
              timeRange === r.value
                ? "bg-gradient-to-r from-indigo-600 to-blue-600 border-indigo-500/60 text-white shadow-sm shadow-indigo-500/20"
                : "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="text-xs text-slate-600 ml-2">{chartData.length} sales</span>
        {outlierCount > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 ml-1"
            title={`${outlierCount} extreme outlier${outlierCount > 1 ? "s" : ""} hidden from chart`}
          >
            {outlierCount} outlier{outlierCount > 1 ? "s" : ""} hidden
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-0.5 bg-indigo-400" />
          Weekly avg
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 border-t border-dashed border-slate-500" />
          Median ${median.toFixed(0)}
        </span>
        {buyPoints.map((bp, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="inline-block w-6 border-t-2 border-dashed border-red-500" />
            {bp.label}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[minTs, maxTs]}
            ticks={ticks}
            tickFormatter={(ts: number) => format(new Date(ts), "MMM ''yy")}
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
            allowDuplicatedCategory={false}
          />

          <YAxis
            domain={[minY, maxY]}
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={60}
          />

          {/* Median reference line */}
          <ReferenceLine
            y={median}
            stroke="#475569"
            strokeDasharray="4 4"
            strokeWidth={1}
          />

          {/* Buy price — horizontal line with label inside the chart */}
          {buyPoints.map((bp, i) => (
            <ReferenceLine
              key={i}
              y={bp.price}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              label={{
                value: `Buy $${bp.price}`,
                position: "insideTopRight",
                fill: "#ef4444",
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          ))}

          {/* Weekly average line */}
          <Line
            data={weeklyData}
            dataKey="avg"
            type="monotone"
            stroke="#818cf8"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: "#818cf8", stroke: "#fff", strokeWidth: 1.5 }}
            isAnimationActive={false}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              return <WeekTooltip active={active} payload={payload as { payload: WeekRow }[]} />;
            }}
            cursor={{ stroke: "#334155", strokeWidth: 1, strokeDasharray: "4 4" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
