"use client";

import React, { useState } from "react";
import {
  Plane,
  Clock,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

export interface RouteDetailData {
  id: string;
  originIata: string;
  originCity: string;
  destIata: string;
  destCity: string;
  distanceKm: number;
  apix: number;
  pctChangeBase: number;
  pctChange24h: number;
  medianFareInr: number;
  dailyFlights: number;
  regulatoryStatus: string;
  ingestedAgo: string;
  topCarriers: { name: string; share: string; median: number }[];
}

export const ROUTE_CATALOG: Record<string, RouteDetailData> = {
  "DEL-BOM": {
    id: "DEL-BOM",
    originIata: "DEL",
    originCity: "New Delhi",
    destIata: "BOM",
    destCity: "Mumbai",
    distanceKm: 1148,
    apix: 124.8,
    pctChangeBase: +24.8,
    pctChange24h: +11.6,
    medianFareInr: 6450,
    dailyFlights: 182,
    regulatoryStatus: "CPI-COMPATIBLE",
    ingestedAgo: "3m ago",
    topCarriers: [
      { name: "IndiGo", share: "52%", median: 6100 },
      { name: "Air India", share: "28%", median: 7200 },
      { name: "Vistara", share: "14%", median: 7850 },
      { name: "Akasa Air", share: "6%", median: 5800 },
    ],
  },
  "BLR-DEL": {
    id: "BLR-DEL",
    originIata: "BLR",
    originCity: "Bengaluru",
    destIata: "DEL",
    destCity: "New Delhi",
    distanceKm: 1740,
    apix: 118.3,
    pctChangeBase: +18.3,
    pctChange24h: +9.4,
    medianFareInr: 7120,
    dailyFlights: 142,
    regulatoryStatus: "CPI-COMPATIBLE",
    ingestedAgo: "5m ago",
    topCarriers: [
      { name: "IndiGo", share: "56%", median: 6800 },
      { name: "Air India", share: "26%", median: 7600 },
      { name: "Akasa Air", share: "18%", median: 6400 },
    ],
  },
  "DEL-SXR": {
    id: "DEL-SXR",
    originIata: "DEL",
    originCity: "New Delhi",
    destIata: "SXR",
    destCity: "Srinagar",
    distanceKm: 645,
    apix: 122.0,
    pctChangeBase: +22.0,
    pctChange24h: +14.2,
    medianFareInr: 8950,
    dailyFlights: 32,
    regulatoryStatus: "ANALYTICAL-ONLY",
    ingestedAgo: "2m ago",
    topCarriers: [
      { name: "IndiGo", share: "60%", median: 8600 },
      { name: "Air India", share: "30%", median: 9400 },
      { name: "SpiceJet", share: "10%", median: 8200 },
    ],
  },
  "DEL-GOI": {
    id: "DEL-GOI",
    originIata: "DEL",
    originCity: "New Delhi",
    destIata: "GOI",
    destCity: "Goa",
    distanceKm: 1515,
    apix: 114.2,
    pctChangeBase: +14.2,
    pctChange24h: +8.1,
    medianFareInr: 6890,
    dailyFlights: 48,
    regulatoryStatus: "CPI-COMPATIBLE",
    ingestedAgo: "6m ago",
    topCarriers: [
      { name: "IndiGo", share: "48%", median: 6600 },
      { name: "Air India", share: "32%", median: 7300 },
      { name: "Vistara", share: "20%", median: 7900 },
    ],
  },
  "DEL-CCU": {
    id: "DEL-CCU",
    originIata: "DEL",
    originCity: "New Delhi",
    destIata: "CCU",
    destCity: "Kolkata",
    distanceKm: 1305,
    apix: 96.4,
    pctChangeBase: -3.6,
    pctChange24h: -8.4,
    medianFareInr: 5120,
    dailyFlights: 74,
    regulatoryStatus: "CPI-COMPATIBLE",
    ingestedAgo: "8m ago",
    topCarriers: [
      { name: "IndiGo", share: "55%", median: 4950 },
      { name: "Air India", share: "25%", median: 5400 },
      { name: "SpiceJet", share: "20%", median: 4800 },
    ],
  },
  "DEL-DXB": {
    id: "DEL-DXB",
    originIata: "DEL",
    originCity: "New Delhi",
    destIata: "DXB",
    destCity: "Dubai",
    distanceKm: 2185,
    apix: 112.5,
    pctChangeBase: +12.5,
    pctChange24h: +6.5,
    medianFareInr: 16400,
    dailyFlights: 38,
    regulatoryStatus: "CPI-COMPATIBLE",
    ingestedAgo: "4m ago",
    topCarriers: [
      { name: "Emirates", share: "45%", median: 18500 },
      { name: "IndiGo", share: "35%", median: 14200 },
      { name: "Air India", share: "20%", median: 15800 },
    ],
  },
  "BOM-SIN": {
    id: "BOM-SIN",
    originIata: "BOM",
    originCity: "Mumbai",
    destIata: "SIN",
    destCity: "Singapore",
    distanceKm: 3910,
    apix: 91.2,
    pctChangeBase: -8.8,
    pctChange24h: -5.7,
    medianFareInr: 21500,
    dailyFlights: 20,
    regulatoryStatus: "CPI-COMPATIBLE",
    ingestedAgo: "11m ago",
    topCarriers: [
      { name: "Singapore Airlines", share: "55%", median: 23800 },
      { name: "Air India", share: "30%", median: 20500 },
      { name: "IndiGo", share: "15%", median: 18200 },
    ],
  },
};

export default function HighVolatilityCard({
  routeId = "DEL-BOM",
  onInspectMatrix,
}: {
  routeId?: string;
  onInspectMatrix?: () => void;
}) {
  const [showMatrixModal, setShowMatrixModal] = useState(false);

  // Fallback if routeId is not explicitly in catalog
  const data = ROUTE_CATALOG[routeId] || ROUTE_CATALOG["DEL-BOM"];

  return (
    <div className="bg-white border border-[#CFE3F7] rounded-xl shadow-[0_2px_12px_rgba(46,127,204,0.08)] p-5 flex flex-col justify-between h-full">
      {/* Card Header */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-[#E2EEF9]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#FEF2F2] text-[#DC2626]">
              <Flame className="w-4 h-4" />
            </span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#991B1B]">
                High Volatility Route
              </span>
              <h3 className="text-xl font-bold font-mono tracking-tight text-[#0C4A6E] flex items-center gap-1.5">
                {data.originIata} ⇄ {data.destIata}
              </h3>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857]">
              <CheckCircle2 className="w-2.5 h-2.5" />
              {data.regulatoryStatus}
            </span>
            <div className="text-[10px] text-[#64748B] font-mono mt-1 flex items-center justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Ingested {data.ingestedAgo}
            </div>
          </div>
        </div>

        {/* Route Geometry Strip */}
        <div className="flex items-center justify-between py-2.5 px-3 bg-[#F0F9FF] border border-[#CFE3F7] rounded-lg mt-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-[#0369A1]">
            <MapPin className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>{data.originCity} ({data.originIata})</span>
          </div>
          <div className="flex items-center gap-1 text-[#64748B]">
            <span className="border-t border-dashed border-[#94A3B8] w-6" />
            <Plane className="w-3 h-3 text-[#0284C7] transform rotate-90" />
            <span className="border-t border-dashed border-[#94A3B8] w-6" />
            <span className="font-semibold text-[#0C4A6E]">{data.distanceKm} km</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#0369A1]">
            <span>{data.destCity} ({data.destIata})</span>
          </div>
        </div>

        {/* Big APIx Number Hero Display */}
        <div className="my-4 p-4 rounded-xl bg-gradient-to-br from-[#F8FAFC] to-[#F0F9FF] border border-[#E2EEF9]">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-mono uppercase text-[#64748B] font-medium tracking-wider">
              Route APIx Index
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center text-xs font-mono font-bold px-2 py-0.5 rounded ${
                  data.pctChangeBase >= 0 ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#ECFDF5] text-[#16A34A]"
                }`}
              >
                {data.pctChangeBase >= 0 ? (
                  <ArrowUpRight className="w-3 h-3 mr-0.5" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 mr-0.5" />
                )}
                {data.pctChangeBase >= 0 ? `+${data.pctChangeBase}%` : `${data.pctChangeBase}%`} vs Base
              </span>
              <span
                className={`text-[11px] font-mono font-semibold ${
                  data.pctChange24h >= 0 ? "text-[#DC2626]" : "text-[#16A34A]"
                }`}
              >
                ({data.pctChange24h >= 0 ? `+${data.pctChange24h}%` : `${data.pctChange24h}%`} 24h)
              </span>
            </div>
          </div>

          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-extrabold font-mono text-[#0C4A6E] tracking-tight">
              {data.apix.toFixed(1)}
            </span>
            <span className="text-sm font-mono text-[#64748B]">pts</span>
          </div>
        </div>

        {/* Sector Fundamentals Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-3 rounded-lg bg-white border border-[#CFE3F7]">
            <span className="text-[11px] font-sans text-[#64748B] block">Median Fare (Rolling 7D)</span>
            <div className="text-xl font-bold font-mono text-[#0C4A6E] mt-0.5">
              ₹{data.medianFareInr.toLocaleString("en-IN")}
            </div>
            <span className="text-[10px] text-[#64748B] font-mono">Direct economy class</span>
          </div>

          <div className="p-3 rounded-lg bg-white border border-[#CFE3F7]">
            <span className="text-[11px] font-sans text-[#64748B] block">Daily Flights Indexed</span>
            <div className="text-xl font-bold font-mono text-[#0284C7] mt-0.5">
              {data.dailyFlights} <span className="text-xs font-normal text-[#64748B]">ops</span>
            </div>
            <span className="text-[10px] text-[#64748B] font-mono">100% schedule captured</span>
          </div>
        </div>

        {/* Carrier Share Breakdown Mini List */}
        <div className="p-3 rounded-lg bg-[#FAFCFF] border border-[#E2EEF9]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#64748B] font-semibold block mb-2">
            Top Carrier Index Shares & Medians
          </span>
          <div className="space-y-1.5">
            {data.topCarriers.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#0C4A6E] font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7]" />
                  {c.name} <span className="text-[10px] text-[#64748B]">({c.share})</span>
                </span>
                <span className="font-semibold text-[#0C4A6E]">₹{c.median.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Inspect Flight Matrix Action Link */}
      <div className="pt-3 mt-3 border-t border-[#E2EEF9]">
        <button
          onClick={() => {
            if (onInspectMatrix) onInspectMatrix();
            setShowMatrixModal(true);
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[#F0F9FF] hover:bg-[#E0F2FE] border border-[#BAE6FD] text-[#0284C7] hover:text-[#0369A1] font-mono font-semibold text-xs transition-colors shadow-sm"
        >
          <Layers className="w-3.5 h-3.5" />
          Inspect Flight Matrix ({data.originIata}-{data.destIata})
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modal for Inspect Flight Matrix */}
      {showMatrixModal && (
        <div className="fixed inset-0 z-50 bg-[#0C4A6E]/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#CFE3F7] rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2EEF9]">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#0284C7]" />
                <div>
                  <h4 className="font-bold font-mono text-base text-[#0C4A6E]">
                    Flight Matrix: {data.originIata} ⇄ {data.destIata}
                  </h4>
                  <p className="text-xs text-[#64748B]">
                    Full schedule breakdown and yield distribution
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMatrixModal(false)}
                className="text-[#64748B] hover:text-[#0C4A6E] text-lg font-mono px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 font-mono text-xs">
              <div className="p-3 bg-[#F0F9FF] rounded-lg border border-[#BAE6FD] flex justify-between">
                <span>Total Daily Capacity:</span>
                <span className="font-bold text-[#0C4A6E]">{data.dailyFlights * 180} seats</span>
              </div>
              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2EEF9] flex justify-between">
                <span>Weighted Fare Variance (σ):</span>
                <span className="font-bold text-[#DC2626]">₹1,240 (High)</span>
              </div>
              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2EEF9] flex justify-between">
                <span>Advance Purchase Window:</span>
                <span className="font-bold text-[#0C4A6E]">T+1 to T+60 Monitored</span>
              </div>

              <div className="pt-2">
                <span className="text-[11px] font-bold text-[#0C4A6E] uppercase">Carrier Fare Bands</span>
                <div className="mt-2 space-y-2">
                  {data.topCarriers.map((c) => (
                    <div key={c.name} className="flex items-center justify-between p-2 rounded bg-white border border-[#E2EEF9]">
                      <span className="font-medium text-[#0C4A6E]">{c.name}</span>
                      <div className="text-right">
                        <span className="font-bold text-[#0284C7]">₹{c.median.toLocaleString("en-IN")}</span>
                        <span className="text-[10px] text-[#64748B] ml-2 font-normal">Cap: {c.share}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E2EEF9] flex justify-end">
              <button
                onClick={() => setShowMatrixModal(false)}
                className="px-4 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white font-mono text-xs font-semibold"
              >
                Close Matrix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
