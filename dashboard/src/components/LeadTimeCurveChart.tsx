"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { LeadTimeCurvePoint } from "@/api-client";
import { Clock, Calendar, Compass } from "lucide-react";

interface LeadTimeCurveChartProps {
  initialData: LeadTimeCurvePoint[];
  availableRoutes?: string[];
  onSelectRoute?: (routeId: string) => void;
  theme?: "dark" | "light";
}

export default function LeadTimeCurveChart({
  initialData,
  availableRoutes = ["DEL-BOM", "BLR-DEL", "BOM-GOI", "BLR-HYD", "DEL-DXB", "BOM-LHR"],
  onSelectRoute,
  theme = "dark",
}: LeadTimeCurveChartProps) {
  const isLight = theme === "light";
  const [selectedRoute, setSelectedRoute] = useState<string>("DEL-BOM");

  const handleRouteChange = (routeId: string) => {
    setSelectedRoute(routeId);
    if (onSelectRoute) onSelectRoute(routeId);
  };

  // Route factor multiplier for realistic variation
  const routeMultipliers: Record<string, number> = {
    "DEL-BOM": 1.15,
    "BLR-DEL": 1.08,
    "BOM-GOI": 1.22,
    "BLR-HYD": 0.95,
    "DEL-DXB": 1.04,
    "BOM-LHR": 0.92,
  };

  const currentMultiplier = routeMultipliers[selectedRoute] ?? 1.1;

  const data = initialData.map((d) => ({
    ...d,
    selected_route: Number((d.market_average * currentMultiplier).toFixed(1)),
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload as LeadTimeCurvePoint;
      const t21Base = 100.0;
      const premium = p.market_average - t21Base;

      return (
        <div
          className={`backdrop-blur-md p-3 rounded-lg shadow-2xl min-w-[200px] text-xs font-sans ${
            isLight
              ? "bg-[#FFFFFF]/95 border border-[#CFE3F7] shadow-[0_8px_25px_rgba(207,227,247,0.8)] text-[#0f172a]"
              : "bg-[#151520]/95 border border-[#232336] shadow-2xl text-[#f8fafc]"
          }`}
        >
          <div className={`flex items-center justify-between pb-2 mb-2 border-b ${isLight ? "border-[#CFE3F7]" : "border-[#232336]"}`}>
            <span className={`font-mono font-bold text-sm flex items-center gap-1.5 ${isLight ? "text-[#0f172a]" : "text-[#f8fafc]"}`}>
              <Calendar className="w-3.5 h-3.5 text-[#0284c7]" />
              Window: {p.lead_time}
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isLight
                  ? "bg-[#F0F9FF] text-[#0284c7] border-[#CFE3F7]"
                  : "bg-[#1b1b26] text-[#94a3b8] border border-[#232336]"
              }`}
            >
              {p.advance_days} Day{p.advance_days > 1 ? "s" : ""} Out
            </span>
          </div>
          <div className="space-y-1.5 font-mono">
            <div className={`flex justify-between items-center ${isLight ? "text-[#b45309]" : "text-[#ffd481]"}`}>
              <span className={`flex items-center gap-1.5 text-[11px] ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
                <span className={`w-2 h-2 rounded-full ${isLight ? "bg-[#d97706]" : "bg-[#f0b429]"}`} />
                Market Average:
              </span>
              <span className="font-semibold text-sm tabular-nums">{p.market_average.toFixed(1)}</span>
            </div>
            <div className={`flex justify-between items-center ${isLight ? "text-[#0284c7]" : "text-[#38bdf8]"}`}>
              <span className={`flex items-center gap-1.5 text-[11px] ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
                <span className="w-2 h-2 rounded-full bg-[#0284c7]" />
                {selectedRoute}:
              </span>
              <span className="font-semibold tabular-nums">
                {p.selected_route?.toFixed(1) ?? "—"}
              </span>
            </div>
            <div className={`flex justify-between items-center pt-1 border-t text-[11px] ${isLight ? "border-[#CFE3F7]" : "border-[#1f1f2a]"}`}>
              <span className={isLight ? "text-[#64748b]" : "text-[#64748b]"}>Advance Premium vs Base:</span>
              <span
                className={`font-semibold tabular-nums ${
                  premium > 0
                    ? isLight ? "text-[#dc2626]" : "text-[#ef4444]"
                    : isLight ? "text-[#16a34a]" : "text-[#22c55e]"
                }`}
              >
                {premium > 0 ? `+${premium.toFixed(1)}%` : `${premium.toFixed(1)}%`}
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
              Advance Booking Lead-Time Curve
            </h2>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isLight
                  ? "bg-[#E0F2FE] text-[#0284c7] border-[#BAE6FD]"
                  : "bg-[#1f1f2a] text-[#ffd481] border border-[#f0b429]/20"
              }`}
            >
              T+1 → T+60 Dynamics
            </span>
          </div>
          <p className={`text-xs mt-0.5 font-sans ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
            Price relative trajectory showing late-booking escalation vs advance discounts
          </p>
        </div>

        {/* Route Overlay Selector */}
        <div className="flex items-center gap-2">
          <label className={`text-xs font-mono flex items-center gap-1 ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
            <Compass className="w-3.5 h-3.5 text-[#0284c7]" />
            Corridor:
          </label>
          <select
            value={selectedRoute}
            onChange={(e) => handleRouteChange(e.target.value)}
            className={`rounded px-2.5 py-1 text-xs font-mono font-medium focus:outline-none transition-colors ${
              isLight
                ? "bg-[#F0F9FF] text-[#0284c7] border border-[#CFE3F7] focus:border-[#0284c7]"
                : "bg-[#0d0d18] text-[#ffd481] border border-[#232336] focus:border-[#f0b429]"
            }`}
          >
            {availableRoutes.map((r) => (
              <option key={r} value={r} className={isLight ? "bg-[#FFFFFF] text-[#0f172a]" : "bg-[#151520] text-[#f8fafc]"}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={isLight ? "#E2EEF9" : "#1f1f2a"} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="lead_time"
              stroke={isLight ? "#94a3b8" : "#475569"}
              tick={{ fill: isLight ? "#64748b" : "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: isLight ? "#CFE3F7" : "#232336" }}
            />
            <YAxis
              domain={[75, 180]}
              stroke={isLight ? "#94a3b8" : "#475569"}
              tick={{ fill: isLight ? "#64748b" : "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: isLight ? "#CFE3F7" : "#232336" }}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={100}
              stroke={isLight ? "#94a3b8" : "#475569"}
              strokeDasharray="4 4"
              label={{
                value: "CPI Base (100.0)",
                fill: isLight ? "#64748b" : "#64748b",
                fontSize: 10,
                position: "insideBottomRight",
              }}
            />

            {/* Market Average Benchmark Line */}
            <Line
              type="monotone"
              dataKey="market_average"
              stroke={isLight ? "#d97706" : "#f0b429"}
              strokeWidth={2.5}
              dot={{ r: 4, fill: isLight ? "#d97706" : "#f0b429", stroke: isLight ? "#ffffff" : "#0a0a0f", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: isLight ? "#b45309" : "#ffd481" }}
              name="Market Average"
            />

            {/* Selected Route Overlaid Line */}
            <Line
              type="monotone"
              dataKey="selected_route"
              stroke={isLight ? "#0284c7" : "#38bdf8"}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 4, fill: isLight ? "#0284c7" : "#38bdf8", stroke: isLight ? "#ffffff" : "#0a0a0f", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: isLight ? "#0369a1" : "#7bd0ff" }}
              name={selectedRoute}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Legend */}
      <div className={`flex items-center justify-between pt-3 mt-2 border-t text-[11px] font-mono ${isLight ? "border-[#CFE3F7] text-[#64748b]" : "border-[#1f1f2a] text-[#94a3b8]"}`}>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className={`w-3 h-0.5 ${isLight ? "bg-[#d97706]" : "bg-[#f0b429]"}`} />
            National Market Average Curve
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-3 h-0.5 border-t-2 border-dashed ${isLight ? "border-[#0284c7]" : "border-[#38bdf8]"}`} />
            {selectedRoute} Corridor Specific
          </span>
        </div>
        <div className={`flex items-center gap-1 ${isLight ? "text-[#64748b]" : "text-[#64748b]"}`}>
          <Clock className="w-3.5 h-3.5 text-[#0284c7]" />
          <span>T+1: High Volatility Window</span>
        </div>
      </div>
    </div>
  );
}
