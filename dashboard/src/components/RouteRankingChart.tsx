"use client";

import React, { useState } from "react";
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
import { RouteRankItem } from "@/api-client";
import { Plane, TrendingUp, TrendingDown } from "lucide-react";

interface RouteRankingChartProps {
  data: RouteRankItem[];
  theme?: "dark" | "light";
}

export default function RouteRankingChart({
  data,
  theme = "dark",
}: RouteRankingChartProps) {
  const isLight = theme === "light";
  const [filter, setFilter] = useState<"all" | "domestic" | "international">("all");

  const filteredData = data.filter((item) => {
    if (filter === "all") return true;
    return item.category === filter;
  });

  const getBarColor = (val: number) => {
    if (val >= 115) return isLight ? "#dc2626" : "#ef4444"; // Surge / Red
    if (val >= 100) return isLight ? "#d97706" : "#f0b429"; // Above base / Amber
    return isLight ? "#16a34a" : "#22c55e"; // Below base / Green
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload as RouteRankItem;
      const delta = item.price_relative - 100;
      const isSurge = delta >= 0;

      return (
        <div
          className={`backdrop-blur-md p-3 rounded-lg shadow-2xl min-w-[200px] text-xs font-sans ${
            isLight
              ? "bg-[#FFFFFF]/95 border border-[#CFE3F7] shadow-[0_8px_25px_rgba(207,227,247,0.8)] text-[#0f172a]"
              : "bg-[#151520]/95 border border-[#232336] shadow-2xl text-[#f8fafc]"
          }`}
        >
          <div className={`flex items-center justify-between pb-2 mb-2 border-b ${isLight ? "border-[#CFE3F7]" : "border-[#232336]"}`}>
            <span className={`font-mono font-bold text-sm tracking-wide flex items-center gap-1.5 ${isLight ? "text-[#0f172a]" : "text-[#f8fafc]"}`}>
              <Plane className="w-3.5 h-3.5 text-[#0284c7]" />
              {item.route_id}
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider ${
                item.category === "domestic"
                  ? isLight
                    ? "bg-[#E0F2FE] text-[#0284c7] border border-[#BAE6FD]"
                    : "bg-[#1b1b26] text-[#38bdf8] border border-[#38bdf8]/30"
                  : isLight
                  ? "bg-[#F0F9FF] text-[#0369a1] border border-[#CFE3F7]"
                  : "bg-[#1b1b26] text-[#c4e7ff] border border-[#c4e7ff]/30"
              }`}
            >
              {item.category}
            </span>
          </div>
          <div className="space-y-1.5 font-mono">
            <div className={`flex justify-between items-center ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
              <span>Price Relative:</span>
              <span className={`font-semibold text-sm tabular-nums ${isLight ? "text-[#0f172a]" : "text-[#f8fafc]"}`}>
                {item.price_relative.toFixed(1)}
              </span>
            </div>
            <div className={`flex justify-between items-center ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
              <span>Vs Baseline (100):</span>
              <span
                className={`font-semibold flex items-center gap-0.5 tabular-nums ${
                  isSurge
                    ? isLight ? "text-[#dc2626]" : "text-[#ef4444]"
                    : isLight ? "text-[#16a34a]" : "text-[#22c55e]"
                }`}
              >
                {isSurge ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isSurge ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
              </span>
            </div>
            <div className={`flex justify-between items-center text-[11px] pt-1 border-t ${isLight ? "border-[#CFE3F7] text-[#64748b]" : "border-[#1f1f2a] text-[#64748b]"}`}>
              <span>Samples Observed:</span>
              <span className={`tabular-nums ${isLight ? "text-[#0f172a]" : "text-[#94a3b8]"}`}>{item.sample_size} flights</span>
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
          <h2 className={`text-base font-semibold font-space tracking-wide ${isLight ? "text-[#0f172a]" : "text-[#f8fafc]"}`}>
            Airspace Corridor Fare Ranking
          </h2>
          <p className={`text-xs mt-0.5 font-sans ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
            Ranked by price relative index (Highest fare pressure at top)
          </p>
        </div>

        {/* Filter controls */}
        <div className={`flex items-center gap-1 p-1 rounded-lg border ${isLight ? "bg-[#F0F9FF] border-[#CFE3F7]" : "bg-[#0d0d18] border-[#232336]"}`}>
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === "all"
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
            onClick={() => setFilter("domestic")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === "domestic"
                ? isLight
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "bg-[#232336] text-[#38bdf8]"
                : isLight
                ? "text-[#64748b] hover:text-[#0f172a]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            Domestic
          </button>
          <button
            onClick={() => setFilter("international")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === "international"
                ? isLight
                  ? "bg-[#0284c7] text-white shadow-xs"
                  : "bg-[#232336] text-[#c4e7ff]"
                : isLight
                ? "text-[#64748b] hover:text-[#0f172a]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            International
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={filteredData}
            margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
          >
            <CartesianGrid stroke={isLight ? "#E2EEF9" : "#1f1f2a"} strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[80, "auto"]}
              stroke={isLight ? "#94a3b8" : "#475569"}
              tick={{ fill: isLight ? "#64748b" : "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: isLight ? "#CFE3F7" : "#232336" }}
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
            <ReferenceLine
              x={100}
              stroke={isLight ? "#94a3b8" : "#64748b"}
              strokeDasharray="4 4"
              label={{
                value: "Base 100",
                fill: isLight ? "#64748b" : "#64748b",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
            <Bar dataKey="price_relative" radius={[0, 4, 4, 0]} barSize={16}>
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.price_relative)} />
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
            Surge (&gt;115)
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded ${isLight ? "bg-[#d97706]" : "bg-[#f0b429]"}`} />
            Moderate (100–115)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#22c55e]" />
            Discount (&lt;100)
          </span>
        </div>
      </div>
    </div>
  );
}
