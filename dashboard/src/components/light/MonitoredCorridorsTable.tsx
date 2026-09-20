"use client";

import React, { useState } from "react";
import { Plane, Search, Download, Filter, CheckCircle2, ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface CorridorRow {
  id: string;
  sector: string;
  category: "Domestic" | "International";
  weightPct: number;
  priceRelative: number;
  deviationPct: number;
  status: "ONLINE" | "STANDBY";
  dailyFlights: number;
}

const CORRIDOR_DATA: CorridorRow[] = [
  { id: "DEL-BOM", sector: "Delhi (DEL) ⇄ Mumbai (BOM)", category: "Domestic", weightPct: 14.2, priceRelative: 124.8, deviationPct: +24.8, status: "ONLINE", dailyFlights: 182 },
  { id: "DEL-DXB", sector: "Delhi (DEL) ⇄ Dubai (DXB)", category: "International", weightPct: 8.5, priceRelative: 112.5, deviationPct: +12.5, status: "ONLINE", dailyFlights: 38 },
  { id: "DEL-BLR", sector: "Delhi (DEL) ⇄ Bengaluru (BLR)", category: "Domestic", weightPct: 10.4, priceRelative: 108.2, deviationPct: +8.2, status: "ONLINE", dailyFlights: 130 },
  { id: "BOM-BLR", sector: "Mumbai (BOM) ⇄ Bengaluru (BLR)", category: "Domestic", weightPct: 7.9, priceRelative: 104.5, deviationPct: +4.5, status: "ONLINE", dailyFlights: 96 },
  { id: "BLR-HYD", sector: "Bengaluru (BLR) ⇄ Hyderabad (HYD)", category: "Domestic", weightPct: 4.8, priceRelative: 103.2, deviationPct: +3.2, status: "ONLINE", dailyFlights: 56 },
  { id: "DEL-AMD", sector: "Delhi (DEL) ⇄ Ahmedabad (AMD)", category: "Domestic", weightPct: 5.1, priceRelative: 101.8, deviationPct: +1.8, status: "ONLINE", dailyFlights: 68 },
  { id: "MAA-DEL", sector: "Chennai (MAA) ⇄ Delhi (DEL)", category: "Domestic", weightPct: 6.2, priceRelative: 98.6, deviationPct: -1.4, status: "ONLINE", dailyFlights: 62 },
  { id: "BOM-DXB", sector: "Mumbai (BOM) ⇄ Dubai (DXB)", category: "International", weightPct: 7.1, priceRelative: 97.4, deviationPct: -2.6, status: "ONLINE", dailyFlights: 42 },
  { id: "DEL-CCU", sector: "Delhi (DEL) ⇄ Kolkata (CCU)", category: "Domestic", weightPct: 7.3, priceRelative: 96.4, deviationPct: -3.6, status: "ONLINE", dailyFlights: 74 },
  { id: "BOM-HYD", sector: "Mumbai (BOM) ⇄ Hyderabad (HYD)", category: "Domestic", weightPct: 4.2, priceRelative: 94.8, deviationPct: -5.2, status: "ONLINE", dailyFlights: 44 },
  { id: "DEL-SIN", sector: "Delhi (DEL) ⇄ Singapore (SIN)", category: "International", weightPct: 4.6, priceRelative: 93.8, deviationPct: -6.2, status: "ONLINE", dailyFlights: 24 },
  { id: "DEL-GOI", sector: "Delhi (DEL) ⇄ Goa (GOI)", category: "Domestic", weightPct: 3.5, priceRelative: 114.2, deviationPct: +14.2, status: "ONLINE", dailyFlights: 48 },
  { id: "DEL-SXR", sector: "Delhi (DEL) ⇄ Srinagar (SXR)", category: "Domestic", weightPct: 2.1, priceRelative: 122.0, deviationPct: +22.0, status: "ONLINE", dailyFlights: 32 },
  { id: "BOM-SIN", sector: "Mumbai (BOM) ⇄ Singapore (SIN)", category: "International", weightPct: 4.8, priceRelative: 91.2, deviationPct: -8.8, status: "ONLINE", dailyFlights: 20 },
];

export default function MonitoredCorridorsTable({
  onSelectRoute,
  selectedRouteId,
}: {
  onSelectRoute?: (id: string) => void;
  selectedRouteId?: string;
}) {
  const [filterCat, setFilterCat] = useState<"All" | "Domestic" | "International">("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = CORRIDOR_DATA.filter((c) => {
    if (filterCat !== "All" && c.category !== filterCat) return false;
    if (searchQuery.trim() === "") return true;
    const q = searchQuery.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      c.sector.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  });

  const exportTableCSV = () => {
    const headers = ["Corridor ID", "Sector", "Category", "Weight (%)", "Price Relative", "Deviation (%)", "Status"];
    const rows = filtered.map((r) => [
      r.id,
      `"${r.sector}"`,
      r.category,
      r.weightPct,
      r.priceRelative,
      r.deviationPct,
      r.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "flywise_monitored_corridors.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white border border-[#CFE3F7] rounded-xl shadow-[0_2px_12px_rgba(46,127,204,0.08)] overflow-hidden">
      {/* Table Header Controls */}
      <div className="p-4 sm:p-5 border-b border-[#E2EEF9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Plane className="w-4 h-4 text-[#0284C7]" />
            <h3 className="text-base font-semibold font-space tracking-wide text-[#0C4A6E]">
              Monitored Corridors Index Registry
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#F0F9FF] border border-[#BAE6FD] text-[#0369A1]">
              {filtered.length} Corridors
            </span>
          </div>
          <p className="text-xs text-[#64748B] font-sans mt-0.5">
            Real-time yield, weight distribution, and price relative metrics across active city-pairs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Search route or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg border border-[#CFE3F7] bg-[#FAFCFF] focus:outline-none focus:ring-1 focus:ring-[#0284C7] text-[#0C4A6E] w-44 placeholder-[#94A3B8]"
            />
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center p-0.5 bg-[#F0F9FF] border border-[#CFE3F7] rounded-lg">
            {(["All", "Domestic", "International"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-2.5 py-1 text-xs font-mono rounded-md transition-all ${
                  filterCat === cat
                    ? "bg-[#0284C7] text-white font-semibold shadow-sm"
                    : "text-[#475569] hover:text-[#0C4A6E]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* CSV Export Button */}
          <button
            onClick={exportTableCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-[#0284C7] bg-[#F0F9FF] hover:bg-[#E0F2FE] border border-[#BAE6FD] rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Table Element */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2EEF9] text-[11px] font-mono uppercase text-[#64748B] tracking-wider">
              <th className="py-3 px-4 font-semibold">Corridor ID</th>
              <th className="py-3 px-4 font-semibold">Sector</th>
              <th className="py-3 px-4 font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold text-right">Weight</th>
              <th className="py-3 px-4 font-semibold text-right">Price Relative</th>
              <th className="py-3 px-4 font-semibold text-right">Deviation %</th>
              <th className="py-3 px-4 font-semibold text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2EEF9] text-xs font-mono">
            {filtered.map((row) => {
              const isSelected = selectedRouteId === row.id;
              const isSurge = row.priceRelative > 110;
              const isDepressed = row.priceRelative < 98;

              return (
                <tr
                  key={row.id}
                  onClick={() => onSelectRoute && onSelectRoute(row.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[#E0F2FE]/50 font-semibold"
                      : "hover:bg-[#F0F9FF]/70"
                  }`}
                >
                  <td className="py-3 px-4 font-bold text-[#0C4A6E] flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSurge
                          ? "bg-[#DC2626]"
                          : isDepressed
                          ? "bg-[#16A34A]"
                          : "bg-[#F59E0B]"
                      }`}
                    />
                    {row.id}
                  </td>
                  <td className="py-3 px-4 font-sans text-[#334155]">
                    {row.sector}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        row.category === "Domestic"
                          ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
                          : "bg-[#EEF2FF] border-[#C7D2FE] text-[#4338CA]"
                      }`}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-[#475569]">
                    {row.weightPct.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-[#0C4A6E]">
                    {row.priceRelative.toFixed(1)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`inline-flex items-center gap-0.5 font-bold ${
                        row.deviationPct >= 0
                          ? "text-[#DC2626]"
                          : "text-[#16A34A]"
                      }`}
                    >
                      {row.deviationPct >= 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {row.deviationPct >= 0
                        ? `+${row.deviationPct}%`
                        : `${row.deviationPct}%`}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857]">
                      <Plane className="w-2.5 h-2.5 text-[#059669] transform -rotate-45" />
                      ONLINE
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-[#F8FAFC] border-t border-[#E2EEF9] flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-[#64748B] gap-2">
        <span>Showing {filtered.length} of {CORRIDOR_DATA.length} corridors</span>
        <span>Weights normalized via DGCA passenger enplanement census</span>
      </div>
    </div>
  );
}
