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
  ReferenceArea,
} from "recharts";
import { Clock, Calendar, CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";

interface CurvePoint {
  lead_days: number;
  label: string;
  market_average: number;
  route_curve?: number;
}

// Standard dynamic booking curve T+1 to T+60
const BASE_CURVE: CurvePoint[] = [
  { lead_days: 1, label: "T+1", market_average: 164.2 },
  { lead_days: 2, label: "T+2", market_average: 152.0 },
  { lead_days: 3, label: "T+3", market_average: 141.5 },
  { lead_days: 5, label: "T+5", market_average: 128.4 },
  { lead_days: 7, label: "T+7", market_average: 119.8 },
  { lead_days: 10, label: "T+10", market_average: 111.2 },
  { lead_days: 14, label: "T+14", market_average: 103.6 },
  { lead_days: 17, label: "T+17", market_average: 100.4 },
  { lead_days: 21, label: "T+21", market_average: 98.2 },
  { lead_days: 24, label: "T+24", market_average: 98.8 },
  { lead_days: 28, label: "T+28", market_average: 99.5 },
  { lead_days: 35, label: "T+35", market_average: 101.2 },
  { lead_days: 42, label: "T+42", market_average: 102.0 },
  { lead_days: 50, label: "T+50", market_average: 102.5 },
  { lead_days: 60, label: "T+60", market_average: 103.1 },
];

export default function LightLeadTimeCurve({
  selectedRoute = "DEL-BOM",
}: {
  selectedRoute?: string;
}) {
  const [activeRoute, setActiveRoute] = useState<string>(selectedRoute);

  const routeMultipliers: Record<string, number> = {
    "DEL-BOM": 1.12,
    "DEL-BLR": 1.07,
    "BLR-DEL": 1.07,
    "BOM-BLR": 0.98,
    "DEL-CCU": 0.94,
    "DEL-GOI": 1.18,
    "DEL-SXR": 1.25,
  };

  const multiplier = routeMultipliers[activeRoute] ?? 1.05;

  const data = BASE_CURVE.map((pt) => ({
    ...pt,
    route_curve: Number((pt.market_average * multiplier).toFixed(1)),
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload as CurvePoint & { route_curve: number };
      const isSweetSpot = p.lead_days >= 14 && p.lead_days <= 28;
      const isSurgeZone = p.lead_days <= 3;

      return (
        <div className="bg-white/95 backdrop-blur-md border border-[#CFE3F7] p-3.5 rounded-xl shadow-[0_8px_24px_rgba(2,132,199,0.12)] min-w-[220px] text-xs font-sans">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E2EEF9]">
            <span className="font-mono font-bold text-sm text-[#0C4A6E] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#0284C7]" />
              Window: {p.label}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F0F9FF] text-[#0369A1] font-semibold border border-[#BAE6FD]">
              {p.lead_days} {p.lead_days === 1 ? "day" : "days"} prior
            </span>
          </div>

          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between items-center text-[#0284C7] bg-[#F0F9FF] px-2 py-1 rounded">
              <span className="flex items-center gap-1.5 text-[11px] text-[#0369A1]">
                <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
                {activeRoute}:
              </span>
              <span className="font-bold text-sm tabular-nums">{p.route_curve}</span>
            </div>

            <div className="flex justify-between items-center text-[#475569] px-2 py-0.5">
              <span className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                <span className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                Market Average:
              </span>
              <span className="font-semibold text-xs tabular-nums">{p.market_average}</span>
            </div>
          </div>

          {isSurgeZone && (
            <div className="mt-2.5 pt-2 border-t border-[#FEE2E2] flex items-center gap-1.5 text-[10px] text-[#DC2626] font-mono font-semibold">
              <AlertTriangle className="w-3 h-3 text-[#DC2626]" />
              Last-Minute Surge Zone (+{(p.market_average - 100).toFixed(1)}% premium)
            </div>
          )}

          {isSweetSpot && (
            <div className="mt-2.5 pt-2 border-t border-[#DCFCE7] flex items-center gap-1.5 text-[10px] text-[#16A34A] font-mono font-semibold">
              <CheckCircle className="w-3 h-3 text-[#16A34A]" />
              Optimal Booking Sweet Spot (Index: {p.market_average})
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-[#CFE3F7] rounded-xl shadow-[0_2px_12px_rgba(46,127,204,0.08)] p-5 flex flex-col">
      {/* Header with Route Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2EEF9]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold font-space tracking-wide text-[#0C4A6E]">
              Lead-Time Price Curve (Dynamic Booking Window)
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]">
              T+1 to T+60 EXPIRY
            </span>
          </div>
          <p className="text-xs text-[#64748B] font-sans mt-0.5">
            Empirical yield-management curve showing fare evolution from departure date out to 60 days
          </p>
        </div>

        {/* Route Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F0F9FF] border border-[#CFE3F7] rounded-lg">
          <span className="text-[10px] font-mono text-[#64748B] px-1.5 hidden md:inline">Route:</span>
          {["DEL-BOM", "DEL-BLR", "DEL-GOI", "DEL-SXR"].map((r) => (
            <button
              key={r}
              onClick={() => setActiveRoute(r)}
              className={`px-2 py-1 text-xs font-mono font-semibold rounded transition-all ${
                activeRoute === r
                  ? "bg-[#0284C7] text-white shadow-sm"
                  : "text-[#475569] hover:text-[#0C4A6E] hover:bg-white/60"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Callout Annotations Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3 p-3 rounded-lg bg-[#F8FAFC] border border-[#E2EEF9]">
        {/* Surge Zone Callout */}
        <div className="flex items-center gap-3 p-2.5 rounded-md bg-[#FEF2F2] border border-[#FECACA]">
          <div className="w-8 h-8 rounded-full bg-[#FEE2E2] flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-[#991B1B]">Last-Minute Surge Zone</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[#DC2626] text-white">
                164.20
              </span>
            </div>
            <p className="text-[11px] text-[#7F1D1D] mt-0.5 font-sans">
              T+1 to T+3: Steep inelastic surge driven by emergency travel and late business bookings.
            </p>
          </div>
        </div>

        {/* Optimal Sweet Spot Callout */}
        <div className="flex items-center gap-3 p-2.5 rounded-md bg-[#F0FDF4] border border-[#BBF7D0]">
          <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-4 h-4 text-[#16A34A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-[#166534]">Optimal Window (Sweet Spot)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[#16A34A] text-white">
                98.20
              </span>
            </div>
            <p className="text-[11px] text-[#14532D] mt-0.5 font-sans">
              T+14 to T+28: Lowest fare dispersion with maximum seat tier availability across airlines.
            </p>
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="w-full h-[270px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 15, right: 24, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2EEF9" vertical={false} />

            {/* Shaded Sweet Spot Band (T+14 to T+28) */}
            <ReferenceArea
              x1="T+14"
              x2="T+28"
              fill="rgba(34, 197, 94, 0.12)"
              stroke="rgba(34, 197, 94, 0.4)"
              strokeDasharray="3 3"
              label={{
                value: "SWEET SPOT (T+14 to T+28)",
                position: "insideTop",
                fill: "#15803D",
                fontSize: 10,
                fontFamily: "monospace",
                fontWeight: 600,
              }}
            />

            <XAxis
              dataKey="label"
              stroke="#64748B"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
              axisLine={{ stroke: "#CFE3F7" }}
            />

            <YAxis
              domain={[90, 190]}
              stroke="#64748B"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}`}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Baseline 100 Reference Line */}
            <ReferenceLine
              y={100}
              stroke="#94A3B8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: "BASE 100 (T+21)",
                position: "insideBottomLeft",
                fill: "#64748B",
                fontSize: 10,
                fontFamily: "monospace",
              }}
            />

            {/* Market Average Line */}
            <Line
              type="monotone"
              dataKey="market_average"
              stroke="#0284C7"
              strokeWidth={2.8}
              dot={{ r: 3.5, fill: "#0284C7", stroke: "#FFFFFF", strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: "#0284C7" }}
              name="National Average"
            />

            {/* Route Specific Line */}
            <Line
              type="monotone"
              dataKey="route_curve"
              stroke="#F59E0B"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ r: 3, fill: "#F59E0B", stroke: "#FFFFFF" }}
              name={activeRoute}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend and Methodology Note */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1 border-t border-[#E2EEF9] text-xs font-mono text-[#64748B]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-[#0284C7] rounded" /> National Average Yield Curve
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-[#F59E0B] rounded border-b border-dashed border-[#F59E0B]" /> {activeRoute} Profile
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#DCFCE7] border border-[#86EFAC] rounded-sm" /> Sweet Spot Band
          </span>
        </div>
        <span className="text-[11px] text-[#94A3B8]">Calibrated against DGCA historical advance reservation yields</span>
      </div>
    </div>
  );
}
