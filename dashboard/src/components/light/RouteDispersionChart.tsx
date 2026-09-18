"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import { BarChart3, Filter, ArrowUpDown } from "lucide-react";

interface RouteDispersionItem {
  id: string;
  label: string;
  tag: string;
  priceRelative: number;
  category: "metro" | "tier2" | "intl";
}

const DISPERSION_DATA: RouteDispersionItem[] = [
  { id: "DEL-BOM", label: "DEL ⇄ BOM", tag: "Business Trunk", priceRelative: 124.8, category: "metro" },
  { id: "DEL-SXR", label: "DEL ⇄ SXR", tag: "Seasonal Surge", priceRelative: 122.0, category: "tier2" },
  { id: "BLR-DEL", label: "BLR ⇄ DEL", tag: "Tech Corridor", priceRelative: 118.3, category: "metro" },
  { id: "DEL-GOI", label: "DEL ⇄ GOI", tag: "Holiday Demand", priceRelative: 114.2, category: "tier2" },
  { id: "DEL-DXB", label: "DEL ⇄ DXB", tag: "Gulf Trunk", priceRelative: 112.5, category: "intl" },
  { id: "DEL-BLR", label: "DEL ⇄ BLR", tag: "Enterprise Line", priceRelative: 108.2, category: "metro" },
  { id: "BOM-BLR", label: "BOM ⇄ BLR", tag: "Regional Commerce", priceRelative: 104.5, category: "metro" },
  { id: "BLR-HYD", label: "BLR ⇄ HYD", tag: "Tier-2 Express", priceRelative: 103.2, category: "tier2" },
  { id: "DEL-AMD", label: "DEL ⇄ AMD", tag: "Commercial Hub", priceRelative: 101.8, category: "metro" },
  { id: "MAA-DEL", label: "MAA ⇄ DEL", tag: "South Arterial", priceRelative: 98.6, category: "metro" },
  { id: "DEL-CCU", label: "DEL ⇄ CCU", tag: "East Arterial", priceRelative: 96.4, category: "metro" },
  { id: "BOM-HYD", label: "BOM ⇄ HYD", tag: "Metro Feeder", priceRelative: 94.8, category: "tier2" },
  { id: "DEL-SIN", label: "DEL ⇄ SIN", tag: "SE Asia Hub", priceRelative: 93.8, category: "intl" },
  { id: "BOM-SIN", label: "BOM ⇄ SIN", tag: "Transit Gateway", priceRelative: 91.2, category: "intl" },
];

export default function RouteDispersionChart({
  onSelectRoute,
  selectedRouteId,
}: {
  onSelectRoute?: (id: string) => void;
  selectedRouteId?: string;
}) {
  const [filter, setFilter] = useState<"all" | "metro" | "tier2" | "intl">("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const filteredData = DISPERSION_DATA.filter((d) => (filter === "all" ? true : d.category === filter)).sort(
    (a, b) => (sortOrder === "desc" ? b.priceRelative - a.priceRelative : a.priceRelative - b.priceRelative)
  );

  const getBarColor = (val: number, isSelected: boolean) => {
    if (isSelected) return "#0284C7"; // Highlight selected
    if (val > 110) return "#EF4444"; // Surge red
    if (val >= 98) return "#F59E0B"; // Normal amber
    return "#10B981"; // Depressed green
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload as RouteDispersionItem;
      const deviation = (p.priceRelative - 100).toFixed(1);
      const isOver = p.priceRelative >= 100;

      return (
        <div className="bg-white/95 backdrop-blur-md border border-[#CFE3F7] p-3 rounded-xl shadow-[0_8px_24px_rgba(2,132,199,0.12)] text-xs font-sans min-w-[180px]">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#E2EEF9]">
            <span className="font-mono font-bold text-sm text-[#0C4A6E]">{p.label}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F0F9FF] text-[#0369A1] font-semibold border border-[#BAE6FD]">
              {p.tag}
            </span>
          </div>
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-[#64748B]">Price Relative:</span>
            <span className="font-bold text-[#0C4A6E]">{p.priceRelative.toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between font-mono text-xs mt-1">
            <span className="text-[#64748B]">Deviation vs Base:</span>
            <span className={isOver ? "text-[#DC2626] font-semibold" : "text-[#16A34A] font-semibold"}>
              {isOver ? `+${deviation}%` : `${deviation}%`}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-[#CFE3F7] rounded-xl shadow-[0_2px_12px_rgba(46,127,204,0.08)] p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2EEF9]">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#0284C7]" />
            <h3 className="text-base font-semibold font-space tracking-wide text-[#0C4A6E]">
              Route Relative Pricing Dispersion
            </h3>
          </div>
          <p className="text-xs text-[#64748B] font-sans mt-0.5">
            Cross-sectional price-relatives ranked against national base-100 index
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center p-0.5 bg-[#F0F9FF] border border-[#CFE3F7] rounded-lg">
            {(["all", "metro", "tier2", "intl"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-2 py-0.5 text-[11px] font-mono capitalize rounded ${
                  filter === cat
                    ? "bg-[#0284C7] text-white font-semibold"
                    : "text-[#475569] hover:text-[#0C4A6E]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            title="Toggle sort order"
            className="p-1.5 text-[#475569] hover:text-[#0284C7] bg-[#F0F9FF] border border-[#CFE3F7] rounded-lg transition-colors"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div className="flex-1 w-full min-h-[340px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={filteredData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            barCategoryGap={3}
          >
            <XAxis
              type="number"
              domain={[85, 135]}
              stroke="#64748B"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
              axisLine={{ stroke: "#CFE3F7" }}
            />
            <YAxis
              type="category"
              dataKey="label"
              stroke="#0C4A6E"
              fontSize={11}
              fontFamily="monospace"
              tickLine={false}
              axisLine={false}
              width={85}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              x={100}
              stroke="#94A3B8"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{
                value: "BASE 100",
                position: "insideTopRight",
                fill: "#64748B",
                fontSize: 9,
                fontFamily: "monospace",
              }}
            />
            <Bar
              dataKey="priceRelative"
              radius={4}
              onClick={(entry: any) => {
                if (onSelectRoute && entry?.id) {
                  onSelectRoute(entry.id);
                }
              }}
              className="cursor-pointer"
            >
              {filteredData.map((entry) => (
                <Cell
                  key={`cell-${entry.id}`}
                  fill={getBarColor(entry.priceRelative, selectedRouteId === entry.id)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between pt-3 border-t border-[#E2EEF9] text-[11px] font-mono text-[#64748B]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" /> &lt;98 Depressed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B]" /> 98–110 Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444]" /> &gt;110 Surge
          </span>
        </div>
        <span className="text-[10px] text-[#0284C7] font-semibold">Click bar to inspect route</span>
      </div>
    </div>
  );
}
