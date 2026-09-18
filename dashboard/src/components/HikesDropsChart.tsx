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
}

export default function HikesDropsChart({ data }: HikesDropsChartProps) {
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
        <div className="bg-[#151520]/95 backdrop-blur-md border border-[#232336] p-3 rounded-lg shadow-2xl min-w-[210px] text-xs font-sans">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#232336]">
            <span className="font-mono font-bold text-sm text-[#f8fafc] tracking-wide">
              {item.route_id}
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1 ${
                isHike
                  ? "bg-red-950/70 border border-red-500/40 text-red-400"
                  : "bg-emerald-950/70 border border-emerald-500/40 text-emerald-400"
              }`}
            >
              {isHike ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {isHike ? `+${item.change_pct}%` : `${item.change_pct}%`}
            </span>
          </div>
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between items-center text-[#94a3b8]">
              <span>Previous Day Index:</span>
              <span className="tabular-nums text-[#f8fafc]">{item.previous_relative.toFixed(1)}</span>
            </div>
            <div className="flex justify-between items-center text-[#94a3b8]">
              <span>Current Day Index:</span>
              <span className="tabular-nums font-semibold text-[#ffd481]">
                {item.current_relative.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-[#1f1f2a] text-[11px]">
              <span className="text-[#64748b]">Day-over-Day Move:</span>
              <span
                className={`font-semibold tabular-nums ${
                  isHike ? "text-[#ef4444]" : "text-[#22c55e]"
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
    <div className="bg-[#151520] border border-[#232336] rounded-xl p-5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-3 border-b border-[#232336]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold font-space tracking-wide text-[#f8fafc]">
              Day-over-Day Volatility: Hikes & Drops
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1f1f2a] text-[#ffd481] border border-[#f0b429]/20">
              Diverging Delta
            </span>
          </div>
          <p className="text-xs text-[#94a3b8] mt-0.5 font-sans">
            Daily price relative shift (%) across monitored corridors
          </p>
        </div>

        {/* Quick Highlights */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          {maxHike && (
            <div className="px-2 py-1 rounded bg-[#1f1515] border border-red-500/20 text-red-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>Max Spike: +{maxHike.change_pct}%</span>
            </div>
          )}
          {maxDrop && (
            <div className="px-2 py-1 rounded bg-[#0d1f15] border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
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
            <CartesianGrid stroke="#1f1f2a" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[-maxAbsChange, maxAbsChange]}
              stroke="#475569"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: "#232336" }}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
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
            <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1.5} />
            <Bar dataKey="change_pct" barSize={16} radius={4}>
              {sortedData.map((entry, index) => (
                <Cell
                  key={`cell-diff-${index}`}
                  fill={entry.change_pct >= 0 ? "#ef4444" : "#22c55e"}
                />
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
            Fare Spike / Hike (Right)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#22c55e]" />
            Fare Softening / Drop (Left)
          </span>
        </div>
        <div className="flex items-center gap-1 text-[#64748b]">
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>Balanced Baseline at 0%</span>
        </div>
      </div>
    </div>
  );
}
