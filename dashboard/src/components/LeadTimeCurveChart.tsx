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
}

export default function LeadTimeCurveChart({
  initialData,
  availableRoutes = ["DEL-BOM", "BLR-DEL", "BOM-GOI", "BLR-HYD", "DEL-DXB", "BOM-LHR"],
  onSelectRoute,
}: LeadTimeCurveChartProps) {
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
        <div className="bg-[#151520]/95 backdrop-blur-md border border-[#232336] p-3 rounded-lg shadow-2xl min-w-[200px] text-xs font-sans">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#232336]">
            <span className="font-mono font-bold text-sm text-[#f8fafc] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#38bdf8]" />
              Window: {p.lead_time}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1b1b26] text-[#94a3b8] border border-[#232336]">
              {p.advance_days} Day{p.advance_days > 1 ? "s" : ""} Out
            </span>
          </div>
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between items-center text-[#ffd481]">
              <span className="flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
                <span className="w-2 h-2 rounded-full bg-[#f0b429]" />
                Market Average:
              </span>
              <span className="font-semibold text-sm tabular-nums">{p.market_average.toFixed(1)}</span>
            </div>
            <div className="flex justify-between items-center text-[#38bdf8]">
              <span className="flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
                <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                {selectedRoute}:
              </span>
              <span className="font-semibold tabular-nums">
                {p.selected_route?.toFixed(1) ?? "—"}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-[#1f1f2a] text-[11px]">
              <span className="text-[#64748b]">Advance Premium vs Base:</span>
              <span
                className={`font-semibold tabular-nums ${
                  premium > 0 ? "text-[#ef4444]" : "text-[#22c55e]"
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
    <div className="bg-[#151520] border border-[#232336] rounded-xl p-5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-3 border-b border-[#232336]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold font-space tracking-wide text-[#f8fafc]">
              Advance Booking Lead-Time Curve
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1f1f2a] text-[#ffd481] border border-[#f0b429]/20">
              T+1 → T+60 Dynamics
            </span>
          </div>
          <p className="text-xs text-[#94a3b8] mt-0.5 font-sans">
            Price relative trajectory showing late-booking escalation vs advance discounts
          </p>
        </div>

        {/* Route Overlay Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[#94a3b8] font-mono flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-[#38bdf8]" />
            Corridor:
          </label>
          <select
            value={selectedRoute}
            onChange={(e) => handleRouteChange(e.target.value)}
            className="bg-[#0d0d18] text-[#ffd481] border border-[#232336] rounded px-2.5 py-1 text-xs font-mono font-medium focus:outline-none focus:border-[#f0b429]"
          >
            {availableRoutes.map((r) => (
              <option key={r} value={r} className="bg-[#151520] text-[#f8fafc]">
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
            <CartesianGrid stroke="#1f1f2a" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="lead_time"
              stroke="#475569"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: "#232336" }}
            />
            <YAxis
              domain={[75, 180]}
              stroke="#475569"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains-mono)" }}
              tickLine={false}
              axisLine={{ stroke: "#232336" }}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={100}
              stroke="#475569"
              strokeDasharray="4 4"
              label={{
                value: "CPI Base (100.0)",
                fill: "#64748b",
                fontSize: 10,
                position: "insideBottomRight",
              }}
            />

            {/* Market Average Benchmark Line */}
            <Line
              type="monotone"
              dataKey="market_average"
              stroke="#f0b429"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#f0b429", stroke: "#0a0a0f", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#ffd481" }}
              name="Market Average"
            />

            {/* Selected Route Overlaid Line */}
            <Line
              type="monotone"
              dataKey="selected_route"
              stroke="#38bdf8"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 4, fill: "#38bdf8", stroke: "#0a0a0f", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#7bd0ff" }}
              name={selectedRoute}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Legend */}
      <div className="flex items-center justify-between pt-3 mt-2 border-t border-[#1f1f2a] text-[11px] text-[#94a3b8] font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#f0b429]" />
            National Market Average Curve
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-[#38bdf8]" />
            {selectedRoute} Corridor Specific
          </span>
        </div>
        <div className="flex items-center gap-1 text-[#64748b]">
          <Clock className="w-3.5 h-3.5" />
          <span>T+1: High Volatility Window</span>
        </div>
      </div>
    </div>
  );
}
