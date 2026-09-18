"use client";

import React, { useState } from "react";
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
import { TrendDataPoint } from "@/api-client";
import { Activity, ShieldCheck, Clock } from "lucide-react";

interface ApixTrendChartProps {
  data: TrendDataPoint[];
  windowCategory?: string;
  theme?: "dark" | "light";
}

export default function ApixTrendChart({
  data,
  windowCategory = "cpi_compatible",
  theme = "dark",
}: ApixTrendChartProps) {
  const isLight = theme === "light";
  const [activeSeries, setActiveSeries] = useState<"all" | "overall" | "domestic" | "international">("all");

  const minVal = Math.floor(
    Math.min(...data.map((d) => Math.min(d.overall_apix, d.domestic_apix, d.international_apix))) - 3
  );
  const maxVal = Math.ceil(
    Math.max(...data.map((d) => Math.max(d.overall_apix, d.domestic_apix, d.international_apix))) + 3
  );

  const renderStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "live":
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider ${
              isLight
                ? "bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857]"
                : "bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        );
      case "mtd":
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wider ${
              isLight
                ? "bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309]"
                : "bg-amber-950/60 border border-amber-500/40 text-amber-300"
            }`}
          >
            <Clock className="w-2.5 h-2.5" />
            MTD
          </span>
        );
      case "finalized":
      default:
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wider ${
              isLight
                ? "bg-[#E0F2FE] border border-[#BAE6FD] text-[#0284C7]"
                : "bg-sky-950/60 border border-sky-500/40 text-sky-300"
            }`}
          >
            <ShieldCheck className="w-2.5 h-2.5" />
            FINALIZED
          </span>
        );
    }
  };

  // Custom Dot component with distinct badges on nodes
  const CustomDot = (props: any) => {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null) return null;
    const isLive = payload.status?.toLowerCase() === "live";
    const isLast = index === data.length - 1;

    return (
      <g key={`dot-${index}`}>
        {isLive && (
          <circle
            cx={cx}
            cy={cy}
            r={10}
            fill="#22c55e"
            opacity={0.25}
            className="animate-pulse"
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={isLast ? 5.5 : 3.5}
          fill={isLive ? "#22c55e" : "#f0b429"}
          stroke={isLight ? "#ffffff" : "#0a0a0f"}
          strokeWidth={2}
        />
      </g>
    );
  };

  // Bespoke tooltip matching theme
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload as TrendDataPoint;
      return (
        <div
          className={`backdrop-blur-md p-3 rounded-lg shadow-2xl min-w-[200px] text-xs font-sans ${
            isLight
              ? "bg-[#FFFFFF]/95 border border-[#CFE3F7] shadow-[0_8px_25px_rgba(207,227,247,0.8)] text-[#0f172a]"
              : "bg-[#151520]/95 border border-[#232336] shadow-2xl text-[#f8fafc]"
          }`}
        >
          <div className={`flex items-center justify-between pb-2 mb-2 border-b ${isLight ? "border-[#CFE3F7]" : "border-[#232336]"}`}>
            <span className={`font-mono ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>{p.date}</span>
            {renderStatusBadge(p.status)}
          </div>
          <div className="space-y-1.5 font-mono">
            <div className={`flex justify-between items-center ${isLight ? "text-[#b45309]" : "text-[#ffd481]"}`}>
              <span className={`flex items-center gap-1.5 text-[11px] ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
                <span className="w-2 h-2 rounded-full bg-[#f0b429]" />
                Overall APIx:
              </span>
              <span className="font-semibold text-sm tabular-nums">{p.overall_apix.toFixed(2)}</span>
            </div>
            <div className={`flex justify-between items-center ${isLight ? "text-[#0284c7]" : "text-[#38bdf8]"}`}>
              <span className={`flex items-center gap-1.5 text-[11px] ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
                <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                DAPIx (Dom):
              </span>
              <span className="tabular-nums">{p.domestic_apix.toFixed(2)}</span>
            </div>
            <div className={`flex justify-between items-center ${isLight ? "text-[#0369a1]" : "text-[#c4e7ff]"}`}>
              <span className={`flex items-center gap-1.5 text-[11px] ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
                <span className="w-2 h-2 rounded-full bg-[#c4e7ff]" />
                IAPIx (Intl):
              </span>
              <span className="tabular-nums">{p.international_apix.toFixed(2)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={`rounded-xl p-5 flex flex-col h-full transition-all duration-200 ${
        isLight
          ? "bg-[#FFFFFF] border border-[#CFE3F7] shadow-[0_4px_20px_rgba(207,227,247,0.5)]"
          : "bg-[#151520] border border-[#232336] shadow-lg"
      }`}
    >
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-3 border-b ${isLight ? "border-[#CFE3F7]" : "border-[#232336]"}`}>
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-base font-semibold font-space tracking-wide ${isLight ? "text-[#0f172a]" : "text-[#f8fafc]"}`}>
              National APIx Trajectory
            </h2>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isLight
                  ? "bg-[#E0F2FE] text-[#0284c7] border-[#BAE6FD]"
                  : "bg-[#1f1f2a] text-[#ffd481] border-[#f0b429]/20"
              }`}
            >
              {windowCategory === "cpi_compatible" ? "CPI Compatible (T+21/60)" : "Analytical (All)"}
            </span>
          </div>
          <p className={`text-xs mt-0.5 font-sans ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
            Jevons Geometric Mean weighted with Young-type route baskets (Base = 100.0)
          </p>
        </div>

        {/* Series Filter & Legend */}
        <div className={`flex items-center gap-1 p-1 rounded-lg border ${isLight ? "bg-[#F0F9FF] border-[#CFE3F7]" : "bg-[#0d0d18] border-[#232336]"}`}>
          <button
            onClick={() => setActiveSeries("all")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              activeSeries === "all"
                ? isLight
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "bg-[#232336] text-[#ffd481]"
                : isLight
                ? "text-[#64748b] hover:text-[#0f172a]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveSeries("overall")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              activeSeries === "overall"
                ? isLight
                  ? "bg-[#d97706] text-white shadow-xs"
                  : "bg-[#232336] text-[#f0b429]"
                : isLight
                ? "text-[#64748b] hover:text-[#0f172a]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            Overall
          </button>
          <button
            onClick={() => setActiveSeries("domestic")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              activeSeries === "domestic"
                ? isLight
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "bg-[#232336] text-[#38bdf8]"
                : isLight
                ? "text-[#64748b] hover:text-[#0f172a]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            DAPIx
          </button>
          <button
            onClick={() => setActiveSeries("international")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              activeSeries === "international"
                ? isLight
                  ? "bg-[#0369a1] text-white shadow-xs"
                  : "bg-[#232336] text-[#c4e7ff]"
                : isLight
                ? "text-[#64748b] hover:text-[#0f172a]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            IAPIx
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="overallGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isLight ? "#d97706" : "#f0b429"} stopOpacity={0.25} />
                <stop offset="95%" stopColor={isLight ? "#d97706" : "#f0b429"} stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="domGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0284c7" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={isLight ? "#E2EEF9" : "#1f1f2a"} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="displayDate"
              stroke={isLight ? "#94a3b8" : "#475569"}
              tick={{ fill: isLight ? "#64748b" : "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: isLight ? "#CFE3F7" : "#232336" }}
            />
            <YAxis
              domain={[minVal, maxVal]}
              stroke={isLight ? "#94a3b8" : "#475569"}
              tick={{ fill: isLight ? "#64748b" : "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: isLight ? "#CFE3F7" : "#232336" }}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={100} stroke={isLight ? "#94a3b8" : "#475569"} strokeDasharray="4 4" label={{ value: "Base 100", fill: isLight ? "#64748b" : "#94a3b8", fontSize: 10, position: "insideBottomRight" }} />

            {(activeSeries === "all" || activeSeries === "overall") && (
              <Area
                type="monotone"
                dataKey="overall_apix"
                stroke="#f0b429"
                strokeWidth={2.5}
                fill="url(#overallGrad)"
                dot={<CustomDot />}
                activeDot={{ r: 6, fill: "#ffd481", stroke: "#f0b429", strokeWidth: 2 }}
                name="Overall APIx"
              />
            )}

            {(activeSeries === "all" || activeSeries === "domestic") && (
              <Line
                type="monotone"
                dataKey="domestic_apix"
                stroke="#38bdf8"
                strokeWidth={1.8}
                strokeDasharray={activeSeries === "all" ? "3 3" : undefined}
                dot={false}
                name="DAPIx"
              />
            )}

            {(activeSeries === "all" || activeSeries === "international") && (
              <Line
                type="monotone"
                dataKey="international_apix"
                stroke="#c4e7ff"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                dot={false}
                name="IAPIx"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Status Indicators */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-[#1f1f2a] text-[11px] text-[#94a3b8] font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Live (Day Cycle)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            MTD (Provisional)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            Finalized (Archive)
          </span>
        </div>
        <div className="flex items-center gap-1 text-[#64748b]">
          <Activity className="w-3.5 h-3.5 text-[#f0b429]" />
          <span>Real-time Sync Active</span>
        </div>
      </div>
    </div>
  );
}
