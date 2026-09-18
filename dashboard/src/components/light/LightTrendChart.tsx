"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Activity, Clock, ShieldCheck, TrendingUp, Calendar } from "lucide-react";

export type TimeRange = "7D" | "30D" | "90D" | "1Y" | "YTD";

interface TrendPoint {
  date: string;
  displayDate: string;
  overall_apix: number;
  domestic_apix: number;
  international_apix: number;
  status: "LIVE" | "MTD" | "FINALIZED";
}

// Generate high fidelity realistic time series for each tab range
function generateTrendData(range: TimeRange): TrendPoint[] {
  const points: TrendPoint[] = [];
  let count = 7;
  let stepDays = 1;

  if (range === "7D") count = 7;
  else if (range === "30D") count = 15;
  else if (range === "90D") count = 18;
  else if (range === "1Y") count = 24;
  else if (range === "YTD") count = 20;

  const baseDate = new Date(2026, 8, 18); // Sep 18, 2026

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(baseDate);
    const dayOffset = range === "7D" ? i : range === "30D" ? i * 2 : range === "90D" ? i * 5 : i * 15;
    d.setDate(d.getDate() - dayOffset);

    const monthStr = d.toLocaleDateString("en-US", { month: "short" });
    const dayStr = d.getDate();
    const displayDate = `${monthStr} ${dayStr}`;
    const isoDate = d.toISOString().split("T")[0];

    // Systematic seasonal curve with micro volatility
    const t = (count - 1 - i) / count;
    const wave = Math.sin(t * Math.PI * 2.5) * 4.2 + Math.cos(t * Math.PI * 4) * 1.8;
    const noise = ((i * 13) % 7) * 0.4 - 1.2;

    const overall = Number((106.8 + wave + noise).toFixed(2));
    const domestic = Number((overall * 1.025 - 0.4).toFixed(2));
    const intl = Number((overall * 0.94 + 2.1).toFixed(2));

    let status: "LIVE" | "MTD" | "FINALIZED" = "FINALIZED";
    if (i === 0) status = "LIVE";
    else if (i <= 3) status = "MTD";

    points.push({
      date: isoDate,
      displayDate,
      overall_apix: overall,
      domestic_apix: domestic,
      international_apix: intl,
      status,
    });
  }

  return points;
}

export default function LightTrendChart() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");
  const [seriesFilter, setSeriesFilter] = useState<"all" | "overall" | "domestic" | "intl">("all");

  const data = useMemo(() => generateTrendData(timeRange), [timeRange]);

  const latest = data[data.length - 1];
  const previous = data[data.length - 2] || latest;
  const delta = Number((latest.overall_apix - previous.overall_apix).toFixed(2));
  const pctChange = Number(((delta / previous.overall_apix) * 100).toFixed(2));

  const minVal = Math.floor(
    Math.min(...data.map((d) => Math.min(d.overall_apix, d.domestic_apix, d.international_apix))) - 2
  );
  const maxVal = Math.ceil(
    Math.max(...data.map((d) => Math.max(d.overall_apix, d.domestic_apix, d.international_apix))) + 2
  );

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload as TrendPoint;
      return (
        <div className="bg-white/95 backdrop-blur-md border border-[#CFE3F7] p-3.5 rounded-xl shadow-[0_8px_24px_rgba(2,132,199,0.12)] min-w-[210px] text-xs font-sans">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#E2EEF9]">
            <span className="font-mono font-bold text-sm text-[#0C4A6E] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#0284C7]" />
              {p.displayDate}, 2026
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                p.status === "LIVE"
                  ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]"
                  : p.status === "MTD"
                  ? "bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]"
                  : "bg-[#F0F9FF] border-[#BAE6FD] text-[#0369A1]"
              }`}
            >
              {p.status}
            </span>
          </div>

          <div className="space-y-2 font-mono">
            <div className="flex justify-between items-center text-[#0284C7] bg-[#F0F9FF] px-2 py-1 rounded">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#0369A1]">
                <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
                Composite APIx:
              </span>
              <span className="font-bold text-sm tabular-nums">{p.overall_apix.toFixed(2)}</span>
            </div>

            {(seriesFilter === "all" || seriesFilter === "domestic") && (
              <div className="flex justify-between items-center text-[#0F766E] px-2">
                <span className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                  <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                  Domestic (DAPIx):
                </span>
                <span className="font-semibold text-xs tabular-nums">{p.domestic_apix.toFixed(2)}</span>
              </div>
            )}

            {(seriesFilter === "all" || seriesFilter === "intl") && (
              <div className="flex justify-between items-center text-[#4F46E5] px-2">
                <span className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                  <span className="w-2 h-2 rounded-full bg-[#6366F1]" />
                  Intl (IAPIx):
                </span>
                <span className="font-semibold text-xs tabular-nums">{p.international_apix.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[#E2EEF9] flex items-center justify-between text-[10px] text-[#64748B] font-mono">
            <span>Base Benchmark: 100.00</span>
            <span className={p.overall_apix >= 100 ? "text-[#DC2626] font-semibold" : "text-[#16A34A] font-semibold"}>
              {p.overall_apix >= 100 ? `+${(p.overall_apix - 100).toFixed(2)} pts` : `${(p.overall_apix - 100).toFixed(2)} pts`}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-[#CFE3F7] rounded-xl shadow-[0_2px_12px_rgba(46,127,204,0.08)] p-5 flex flex-col h-full">
      {/* Chart Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2EEF9]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#0284C7] animate-ping" />
            <h3 className="text-base font-semibold font-space tracking-wide text-[#0C4A6E]">
              National APIx Trend Analysis
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD]">
              BASE 100.00
            </span>
          </div>
          <p className="text-xs text-[#64748B] font-sans mt-0.5">
            Laspeyres-weighted national fare index normalized across 124 monitored routes
          </p>
        </div>

        {/* Time Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#F0F9FF] border border-[#CFE3F7] rounded-lg">
          {(["7D", "30D", "90D", "1Y", "YTD"] as TimeRange[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setTimeRange(tab)}
              className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-all ${
                timeRange === tab
                  ? "bg-[#0284C7] text-white shadow-sm"
                  : "text-[#475569] hover:text-[#0C4A6E] hover:bg-white/60"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Series Filter Strip */}
      <div className="flex items-center justify-between pt-3 pb-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[#64748B] uppercase tracking-wider">Series:</span>
          <button
            onClick={() => setSeriesFilter("all")}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
              seriesFilter === "all" ? "bg-[#0C4A6E] text-white font-medium" : "text-[#475569] hover:bg-[#F0F9FF]"
            }`}
          >
            All Indices
          </button>
          <button
            onClick={() => setSeriesFilter("overall")}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
              seriesFilter === "overall" ? "bg-[#0284C7] text-white font-medium" : "text-[#0284C7] hover:bg-[#F0F9FF]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7]" />
            Composite
          </button>
          <button
            onClick={() => setSeriesFilter("domestic")}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
              seriesFilter === "domestic" ? "bg-[#0D9488] text-white font-medium" : "text-[#0D9488] hover:bg-[#F0F9FF]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488]" />
            Domestic
          </button>
          <button
            onClick={() => setSeriesFilter("intl")}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
              seriesFilter === "intl" ? "bg-[#6366F1] text-white font-medium" : "text-[#6366F1] hover:bg-[#F0F9FF]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#6366F1]" />
            Intl
          </button>
        </div>

        {/* Live point badge */}
        <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
          <span className="text-[#64748B]">Latest Live:</span>
          <span className="text-sm font-bold text-[#0C4A6E]">{latest.overall_apix.toFixed(2)}</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              pctChange >= 0 ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#ECFDF5] text-[#16A34A]"
            }`}
          >
            {pctChange >= 0 ? `+${pctChange}%` : `${pctChange}%`}
          </span>
        </div>
      </div>

      {/* Main Recharts Area */}
      <div className="flex-1 w-full min-h-[260px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="lightApixGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284C7" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="domesticGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0D9488" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#E2EEF9" vertical={false} />

            <XAxis
              dataKey="displayDate"
              stroke="#64748B"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
              axisLine={{ stroke: "#CFE3F7" }}
              dy={6}
            />

            <YAxis
              domain={[minVal, maxVal]}
              stroke="#64748B"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v.toFixed(0)}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Base 100 reference line */}
            <ReferenceLine
              y={100}
              stroke="#94A3B8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: "BASE 100",
                position: "insideBottomRight",
                fill: "#64748B",
                fontSize: 10,
                fontFamily: "monospace",
              }}
            />

            {/* Overall Composite Area */}
            {(seriesFilter === "all" || seriesFilter === "overall") && (
              <Area
                type="monotone"
                dataKey="overall_apix"
                stroke="#0284C7"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#lightApixGradient)"
                name="Composite APIx"
                activeDot={{ r: 5, fill: "#0284C7", stroke: "#FFFFFF", strokeWidth: 2 }}
              />
            )}

            {/* Domestic Line */}
            {(seriesFilter === "all" || seriesFilter === "domestic") && (
              <Line
                type="monotone"
                dataKey="domestic_apix"
                stroke="#0D9488"
                strokeWidth={1.8}
                dot={false}
                name="Domestic DAPIx"
              />
            )}

            {/* Intl Line */}
            {(seriesFilter === "all" || seriesFilter === "intl") && (
              <Line
                type="monotone"
                dataKey="international_apix"
                stroke="#6366F1"
                strokeWidth={1.8}
                strokeDasharray="4 2"
                dot={false}
                name="Intl IAPIx"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend & Baseline Footnote */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-[#E2EEF9] text-[11px] font-mono text-[#64748B]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-[#0284C7] rounded" /> Composite (75% Dom / 25% Intl)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-[#0D9488] rounded" /> Domestic DAPIx
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-[#6366F1] rounded border-b border-dashed border-[#6366F1]" /> Intl IAPIx
          </span>
        </div>
        <span className="text-[10px] text-[#94A3B8]">Dashed: Base-100 Benchmark</span>
      </div>
    </div>
  );
}
