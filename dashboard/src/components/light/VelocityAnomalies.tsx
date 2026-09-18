"use client";

import React from "react";
import { TrendingDown, TrendingUp, Zap, AlertCircle } from "lucide-react";

interface AnomalyItem {
  routeId: string;
  name: string;
  pctChange: number;
  currentRel: number;
  driver: string;
}

const STEEPEST_DECLINES: AnomalyItem[] = [
  { routeId: "DEL-CCU", name: "DEL ⇄ CCU", pctChange: -8.4, currentRel: 96.4, driver: "Capacity Injection (Akasa A320)" },
  { routeId: "BOM-HYD", name: "BOM ⇄ HYD", pctChange: -6.2, currentRel: 94.8, driver: "Midweek Yield Compression" },
  { routeId: "BOM-SIN", name: "BOM ⇄ SIN", pctChange: -5.7, currentRel: 91.2, driver: "Flash Sale Inventory Release" },
  { routeId: "DEL-SIN", name: "DEL ⇄ SIN", pctChange: -4.3, currentRel: 93.8, driver: "Transit Route Re-allocation" },
  { routeId: "MAA-DEL", name: "MAA ⇄ DEL", pctChange: -3.8, currentRel: 98.6, driver: "Early-Morning Slot Discounting" },
];

const STEEPEST_SURGES: AnomalyItem[] = [
  { routeId: "DEL-SXR", name: "DEL ⇄ SXR", pctChange: +14.2, currentRel: 122.0, driver: "Autumn Tourism Surge & Weather" },
  { routeId: "DEL-BOM", name: "DEL ⇄ BOM", pctChange: +11.6, currentRel: 124.8, driver: "Financial Sector Peak Demand" },
  { routeId: "BLR-DEL", name: "BLR ⇄ DEL", pctChange: +9.4, currentRel: 118.3, driver: "Tech Summit Heavy Booking" },
  { routeId: "DEL-GOI", name: "DEL ⇄ GOI", pctChange: +8.1, currentRel: 114.2, driver: "Weekend Leisure Inflow" },
  { routeId: "DEL-DXB", name: "DEL ⇄ DXB", pctChange: +6.5, currentRel: 112.5, driver: "Gulf Remittance Travel Cycle" },
];

export default function VelocityAnomalies({
  onSelectRoute,
}: {
  onSelectRoute?: (id: string) => void;
}) {
  return (
    <div className="bg-white border border-[#CFE3F7] rounded-xl shadow-[0_2px_12px_rgba(46,127,204,0.08)] p-5 flex flex-col h-full justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E2EEF9]">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#0284C7]" />
            <h3 className="text-base font-semibold font-space tracking-wide text-[#0C4A6E]">
              24-Hour Velocity Anomalies
            </h3>
          </div>
          <p className="text-xs text-[#64748B] font-sans mt-0.5">
            Statistical outliers in 24h derivative rate of change (&gt;1.8σ deviation)
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8]">
          <AlertCircle className="w-3 h-3 text-[#2563EB]" />
          10 FLAGGED
        </span>
      </div>

      {/* Split Columns Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-3">
        {/* Steepest Declines (Green) */}
        <div className="flex flex-col bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-3.5">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#DCFCE7]">
            <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#166534] uppercase tracking-wider">
              <TrendingDown className="w-3.5 h-3.5 text-[#16A34A]" />
              Steepest Declines
            </span>
            <span className="text-[10px] font-mono font-medium text-[#15803D]">Depression</span>
          </div>

          <div className="space-y-2">
            {STEEPEST_DECLINES.map((item) => {
              const barWidth = Math.min(Math.abs(item.pctChange) * 7.5, 100);
              return (
                <div
                  key={item.routeId}
                  onClick={() => onSelectRoute && onSelectRoute(item.routeId)}
                  className="cursor-pointer group p-2 rounded-lg bg-white border border-[#DCFCE7] hover:border-[#86EFAC] transition-all hover:shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-[#0C4A6E] group-hover:text-[#0284C7] transition-colors">
                      {item.name}
                    </span>
                    <span className="font-bold text-[#16A34A]">{item.pctChange}%</span>
                  </div>

                  {/* Relative fill bar */}
                  <div className="w-full bg-[#F0FDF4] rounded-full h-1.5 mt-1.5 overflow-hidden">
                    <div
                      className="bg-[#22C55E] h-full rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#64748B] mt-1 font-sans">
                    <span className="truncate pr-1">{item.driver}</span>
                    <span className="font-mono text-[#0C4A6E] font-medium flex-shrink-0">
                      Idx: {item.currentRel.toFixed(1)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Steepest Surges (Red) */}
        <div className="flex flex-col bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3.5">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#FEE2E2]">
            <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#991B1B] uppercase tracking-wider">
              <TrendingUp className="w-3.5 h-3.5 text-[#DC2626]" />
              Steepest Surges
            </span>
            <span className="text-[10px] font-mono font-medium text-[#B91C1C]">Price Spike</span>
          </div>

          <div className="space-y-2">
            {STEEPEST_SURGES.map((item) => {
              const barWidth = Math.min(Math.abs(item.pctChange) * 7, 100);
              return (
                <div
                  key={item.routeId}
                  onClick={() => onSelectRoute && onSelectRoute(item.routeId)}
                  className="cursor-pointer group p-2 rounded-lg bg-white border border-[#FEE2E2] hover:border-[#FCA5A5] transition-all hover:shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-[#0C4A6E] group-hover:text-[#0284C7] transition-colors">
                      {item.name}
                    </span>
                    <span className="font-bold text-[#DC2626]">+{item.pctChange}%</span>
                  </div>

                  {/* Relative fill bar */}
                  <div className="w-full bg-[#FEF2F2] rounded-full h-1.5 mt-1.5 overflow-hidden">
                    <div
                      className="bg-[#EF4444] h-full rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#64748B] mt-1 font-sans">
                    <span className="truncate pr-1">{item.driver}</span>
                    <span className="font-mono text-[#0C4A6E] font-medium flex-shrink-0">
                      Idx: {item.currentRel.toFixed(1)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Audit Line */}
      <div className="flex items-center justify-between pt-2 border-t border-[#E2EEF9] text-[11px] font-mono text-[#64748B]">
        <span>Surge Threshold: &gt; +5.0% 24h / Decline: &lt; -3.5% 24h</span>
        <span className="text-[#0284C7] font-semibold">Real-time alert dispatch: ACTIVE</span>
      </div>
    </div>
  );
}
