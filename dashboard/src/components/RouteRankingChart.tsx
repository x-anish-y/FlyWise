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
}

export default function RouteRankingChart({ data }: RouteRankingChartProps) {
  const [filter, setFilter] = useState<"all" | "domestic" | "international">("all");

  const filteredData = data.filter((item) => {
    if (filter === "all") return true;
    return item.category === filter;
  });

  const getBarColor = (val: number) => {
    if (val >= 115) return "#ef4444"; // Surge / Red
    if (val >= 100) return "#f0b429"; // Above base / Gold
    return "#22c55e"; // Below base / Radar Green
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload as RouteRankItem;
      const delta = item.price_relative - 100;
      const isSurge = delta >= 0;

      return (
        <div className="bg-[#151520]/95 backdrop-blur-md border border-[#232336] p-3 rounded-lg shadow-2xl min-w-[200px] text-xs font-sans">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#232336]">
            <span className="font-mono font-bold text-sm text-[#f8fafc] tracking-wide flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-[#38bdf8]" />
              {item.route_id}
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider ${
                item.category === "domestic"
                  ? "bg-[#1b1b26] text-[#38bdf8] border border-[#38bdf8]/30"
                  : "bg-[#1b1b26] text-[#c4e7ff] border border-[#c4e7ff]/30"
              }`}
            >
              {item.category}
            </span>
          </div>
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between items-center text-[#94a3b8]">
              <span>Price Relative:</span>
              <span className="font-semibold text-sm text-[#f8fafc] tabular-nums">
                {item.price_relative.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-center text-[#94a3b8]">
              <span>Vs Baseline (100):</span>
              <span
                className={`font-semibold flex items-center gap-0.5 tabular-nums ${
                  isSurge ? "text-[#ef4444]" : "text-[#22c55e]"
                }`}
              >
                {isSurge ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isSurge ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
              </span>
            </div>
            <div className="flex justify-between items-center text-[#64748b] text-[11px] pt-1 border-t border-[#1f1f2a]">
              <span>Samples Observed:</span>
              <span className="tabular-nums text-[#94a3b8]">{item.sample_size} flights</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[#151520] border border-[#232336] rounded-xl p-5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-3 border-b border-[#232336]">
        <div>
          <h2 className="text-base font-semibold font-space tracking-wide text-[#f8fafc]">
            Airspace Corridor Fare Ranking
          </h2>
          <p className="text-xs text-[#94a3b8] mt-0.5 font-sans">
            Ranked by price relative index (Highest fare pressure at top)
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-1 bg-[#0d0d18] p-1 rounded-lg border border-[#232336]">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === "all"
                ? "bg-[#232336] text-[#ffd481]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("domestic")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === "domestic"
                ? "bg-[#232336] text-[#38bdf8]"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            Domestic
          </button>
          <button
            onClick={() => setFilter("international")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              filter === "international"
                ? "bg-[#232336] text-[#c4e7ff]"
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
            <CartesianGrid stroke="#1f1f2a" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[80, "auto"]}
              stroke="#475569"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: "#232336" }}
            />
            <YAxis
              type="category"
              dataKey="route_id"
              stroke="#475569"
              tick={{ fill: "#f8fafc", fontSize: 12, fontFamily: "var(--font-jetbrains-mono)", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: "#232336" }}
              width={75}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(35, 35, 54, 0.4)" }} />
            <ReferenceLine
              x={100}
              stroke="#64748b"
              strokeDasharray="4 4"
              label={{
                value: "Base 100",
                fill: "#64748b",
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
      <div className="flex items-center justify-between pt-3 mt-2 border-t border-[#1f1f2a] text-[11px] text-[#94a3b8] font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#ef4444]" />
            Surge (&gt;115)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#f0b429]" />
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
