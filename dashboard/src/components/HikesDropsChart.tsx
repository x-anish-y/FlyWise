"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { HikeDropItem } from "@/api-client";
import { TrendingUp, TrendingDown, ArrowLeftRight } from "lucide-react";

interface HikesDropsChartProps {
  data: HikeDropItem[];
  theme?: "dark" | "light";
  onRouteClick?: (routeId: string) => void;
}

export default function HikesDropsChart({
  data,
  theme = "dark",
  onRouteClick,
}: HikesDropsChartProps) {
  const isLight = theme === "light";
  // Sort by change_pct descending (hikes first down to drops)
  const sortedData = [...data].sort((a, b) => b.change_pct - a.change_pct);

  const maxAbsChange = Math.ceil(
    Math.max(...sortedData.map((d) => Math.abs(d.change_pct))) + 2
  );

  const maxHike = sortedData[0];
  const maxDrop = sortedData[sortedData.length - 1];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload as HikeDropItem;
      const isHike = item.change_pct >= 0;

      return (
        <div
          className={`backdrop-blur-md p-3 rounded-lg shadow-2xl min-w-[210px] text-xs font-sans ${
            isLight
              ? "bg-[#FFFFFF]/95 border border-[#CFE3F7] shadow-[0_8px_25px_rgba(207,227,247,0.8)] text-[#0f172a]"
              : "bg-[#151520]/95 border border-[#232336] shadow-2xl text-[#f8fafc]"
          }`}
        >
          <div className={`flex items-center justify-between pb-2 mb-2 border-b ${isLight ? "border-[#CFE3F7]" : "border-[#232336]"}`}>
            <span className={`font-mono font-bold text-sm tracking-wide ${isLight ? "text-[#0f172a]" : "text-[#f8fafc]"}`}>
              {item.route_id}
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 ${
                isHike
                  ? isLight
                    ? "bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626]"
                    : "bg-red-950/70 border border-red-500/40 text-red-400"
                  : isLight
                  ? "bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857]"
                  : "bg-emerald-950/70 border border-emerald-500/40 text-emerald-400"
              }`}
            >
              {isHike ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {isHike ? `+${item.change_pct}%` : `${item.change_pct}%`}
            </span>
          </div>
          <div className="space-y-1.5 font-mono">
            <div className={`flex justify-between items-center ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
              <span>Previous Day Index:</span>
              <span className={`tabular-nums ${isLight ? "text-[#0f172a]" : "text-[#f8fafc]"}`}>{item.previous_relative.toFixed(1)}</span>
            </div>
            <div className={`flex justify-between items-center ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
              <span>Current Day Index:</span>
              <span className={`tabular-nums font-semibold ${isLight ? "text-[#0284c7]" : "text-[#ffd481]"}`}>
                {item.current_relative.toFixed(1)}
              </span>
            </div>
            <div className={`flex justify-between items-center pt-1 border-t text-[11px] ${isLight ? "border-[#CFE3F7]" : "border-[#1f1f2a]"}`}>
              <span className={isLight ? "text-[#64748b]" : "text-[#64748b]"}>Day-over-Day Move:</span>
              <span
                className={`font-semibold tabular-nums ${
                  isHike
                    ? isLight ? "text-[#dc2626]" : "text-[#ef4444]"
                    : isLight ? "text-[#16a34a]" : "text-[#22c55e]"
                }`}
              >
                {isHike ? `+${item.change_pct}% hike` : `${item.change_pct}% drop`}
              </span>
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
              Day-over-Day Volatility: Hikes & Drops
            </h2>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isLight
                  ? "bg-[#E0F2FE] text-[#0284c7] border-[#BAE6FD]"
                  : "bg-[#1f1f2a] text-[#ffd481] border border-[#f0b429]/20"
              }`}
            >
              Diverging Delta
            </span>
          </div>
          <p className={`text-xs mt-0.5 font-sans ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
            Daily price relative shift (%) across monitored corridors
          </p>
        </div>

        {/* Quick Highlights */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          {maxHike && (
            <div
              className={`px-2 py-1 rounded flex items-center gap-1 ${
                isLight
                  ? "bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626]"
                  : "bg-[#1f1515] border border-red-500/20 text-red-400"
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              <span>Max Spike: +{maxHike.change_pct}%</span>
            </div>
          )}
          {maxDrop && (
            <div
              className={`px-2 py-1 rounded flex items-center gap-1 ${
                isLight
                  ? "bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857]"
                  : "bg-[#0d1f15] border border-emerald-500/20 text-emerald-400"
              }`}
            >
              <TrendingDown className="w-3 h-3" />
              <span>Max Drop: {maxDrop.change_pct}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={sortedData}
            margin={{ top: 10, right: 25, left: 10, bottom: 0 }}
          >
            <CartesianGrid stroke={isLight ? "#E2EEF9" : "#1f1f2a"} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[-maxAbsChange, maxAbsChange]}
              stroke={isLight ? "#94a3b8" : "#475569"}
              tick={{ fill: isLight ? "#64748b" : "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: isLight ? "#CFE3F7" : "#232336" }}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
            />
            <YAxis
              type="category"
              dataKey="route_id"
              stroke={isLight ? "#94a3b8" : "#475569"}
              tick={{ fill: isLight ? "#0f172a" : "#f8fafc", fontSize: 12, fontFamily: "var(--font-jetbrains-mono)", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: isLight ? "#CFE3F7" : "#232336" }}
              width={75}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(35, 35, 54, 0.4)" }} />
            <ReferenceLine x={0} stroke={isLight ? "#94a3b8" : "#94a3b8"} strokeWidth={1.5} />
            <Bar dataKey="change_pct" barSize={16} radius={4} onClick={(data: any) => onRouteClick?.(data?.route_id)} style={{ cursor: onRouteClick ? "pointer" : undefined }}>
              {sortedData.map((entry, index) => (
                <Cell
                  key={`cell-diff-${index}`}
                  fill={entry.change_pct >= 0 ? (isLight ? "#dc2626" : "#ef4444") : (isLight ? "#16a34a" : "#22c55e")}
                  style={{ cursor: onRouteClick ? "pointer" : undefined }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Legend */}
      <div className={`flex items-center justify-between pt-3 mt-2 border-t text-[11px] font-mono ${isLight ? "border-[#CFE3F7] text-[#64748b]" : "border-[#1f1f2a] text-[#94a3b8]"}`}>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#ef4444]" />
            Fare Spike / Hike (Right)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#22c55e]" />
            Fare Softening / Drop (Left)
          </span>
        </div>
        <div className={`flex items-center gap-1 ${isLight ? "text-[#64748b]" : "text-[#64748b]"}`}>
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>Balanced Baseline at 0%</span>
        </div>
      </div>
    </div>
  );
}
