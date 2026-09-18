"use client";

import React, { useState, useMemo } from "react";
import {
  Compass,
  RotateCw,
  Eye,
  Layers,
  Plane,
  Radio,
  SlidersHorizontal,
} from "lucide-react";

export interface RadarAirport {
  iata: string;
  name: string;
  city: string;
  x: number;
  y: number;
}

export const RADAR_AIRPORTS: Record<string, RadarAirport> = {
  DEL: { iata: "DEL", name: "Indira Gandhi Intl", city: "Delhi", x: 345, y: 92 },
  BOM: { iata: "BOM", name: "Chhatrapati Shivaji Intl", city: "Mumbai", x: 291, y: 207 },
  BLR: { iata: "BLR", name: "Kempegowda Intl", city: "Bengaluru", x: 353, y: 279 },
  CCU: { iata: "CCU", name: "Netaji Subhash Chandra Bose", city: "Kolkata", x: 489, y: 163 },
  HYD: { iata: "HYD", name: "Rajiv Gandhi Intl", city: "Hyderabad", x: 362, y: 229 },
  MAA: { iata: "MAA", name: "Chennai Intl", city: "Chennai", x: 384, y: 281 },
  AMD: { iata: "AMD", name: "Sardar Vallabhbhai Patel", city: "Ahmedabad", x: 288, y: 158 },
  GOI: { iata: "GOI", name: "Dabolim Airport", city: "Goa", x: 303, y: 252 },
  SXR: { iata: "SXR", name: "Sheikh ul-Alam Intl", city: "Srinagar", x: 315, y: 25 },
  DXB: { iata: "DXB", name: "Dubai International", city: "Dubai", x: 72, y: 132 },
  SIN: { iata: "SIN", name: "Singapore Changi", city: "Singapore", x: 672, y: 418 },
};

export interface RadarFlightPath {
  id: string;
  origin: string;
  dest: string;
  fareIndex: number;
  category: "metro" | "tier2" | "intl";
  status: "depressed" | "normal" | "surge";
  flightsToday: number;
}

const FLIGHT_PATHS: RadarFlightPath[] = [
  { id: "DEL-BOM", origin: "DEL", dest: "BOM", fareIndex: 124.8, category: "metro", status: "surge", flightsToday: 182 },
  { id: "BLR-DEL", origin: "BLR", dest: "DEL", fareIndex: 118.3, category: "metro", status: "surge", flightsToday: 142 },
  { id: "BOM-BLR", origin: "BOM", dest: "BLR", fareIndex: 104.5, category: "metro", status: "normal", flightsToday: 96 },
  { id: "DEL-BLR", origin: "DEL", dest: "BLR", fareIndex: 108.2, category: "metro", status: "normal", flightsToday: 130 },
  { id: "DEL-CCU", origin: "DEL", dest: "CCU", fareIndex: 96.4, category: "metro", status: "depressed", flightsToday: 74 },
  { id: "DEL-AMD", origin: "DEL", dest: "AMD", fareIndex: 101.8, category: "metro", status: "normal", flightsToday: 68 },
  { id: "DEL-GOI", origin: "DEL", dest: "GOI", fareIndex: 114.2, category: "tier2", status: "surge", flightsToday: 48 },
  { id: "DEL-SXR", origin: "DEL", dest: "SXR", fareIndex: 122.0, category: "tier2", status: "surge", flightsToday: 32 },
  { id: "BLR-HYD", origin: "BLR", dest: "HYD", fareIndex: 103.2, category: "tier2", status: "normal", flightsToday: 56 },
  { id: "BOM-HYD", origin: "BOM", dest: "HYD", fareIndex: 94.8, category: "tier2", status: "depressed", flightsToday: 44 },
  { id: "MAA-DEL", origin: "MAA", dest: "DEL", fareIndex: 98.6, category: "metro", status: "normal", flightsToday: 62 },
  { id: "DEL-DXB", origin: "DEL", dest: "DXB", fareIndex: 112.5, category: "intl", status: "surge", flightsToday: 38 },
  { id: "BOM-DXB", origin: "BOM", dest: "DXB", fareIndex: 97.4, category: "intl", status: "depressed", flightsToday: 42 },
  { id: "DEL-SIN", origin: "DEL", dest: "SIN", fareIndex: 93.8, category: "intl", status: "depressed", flightsToday: 24 },
  { id: "BOM-SIN", origin: "BOM", dest: "SIN", fareIndex: 91.2, category: "intl", status: "depressed", flightsToday: 20 },
];

interface LightRouteRadarProps {
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
}

export default function LightRouteRadar({
  selectedRouteId,
  onSelectRoute,
}: LightRouteRadarProps) {
  const [filter, setFilter] = useState<"all" | "metro" | "tier2" | "intl">("all");
  const [sweepEnabled, setSweepEnabled] = useState(true);

  const filteredPaths = useMemo(() => {
    if (filter === "all") return FLIGHT_PATHS;
    return FLIGHT_PATHS.filter((p) => p.category === filter);
  }, [filter]);

  const getPathColor = (fareIndex: number, isSelected: boolean) => {
    if (isSelected) return "#0284C7"; // Vivid Sky Focus Blue
    if (fareIndex > 110) return "#DC2626"; // Surge Red
    if (fareIndex >= 98) return "#D97706"; // Normal Amber
    return "#16A34A"; // Depressed Green
  };

  // Helper to construct curved great-circle arc
  const createCurvedPath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Curvature displacement perpendicular to path
    const offset = Math.min(dist * 0.22, 50);
    const midX = (x1 + x2) / 2 - (dy / dist) * offset;
    const midY = (y1 + y2) / 2 + (dx / dist) * offset;
    return `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
  };

  return (
    <div className="bg-white border border-[#CFE3F7] rounded-xl shadow-[0_2px_12px_rgba(46,127,204,0.08)] p-5 flex flex-col h-full">
      {/* Top Header & Telemetry Monitoring Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2EEF9]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold font-space tracking-wide text-[#0C4A6E] flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#0284C7]" />
              National Route Radar
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E0F2FE] border border-[#BAE6FD] text-[#0369A1]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] animate-ping" />
              2D FLIGHT TRACKER
            </span>
          </div>
          {/* Monitoring Stats */}
          <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] font-mono text-[#64748B]">
            <span className="flex items-center gap-1 text-[#0F172A] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7]" />
              Monitored Sectors: <strong className="text-[#0284C7]">124 City Pairs</strong>
            </span>
            <span>·</span>
            <span>Sampling Latency: <strong>90s Rolling Window</strong></span>
            <span>·</span>
            <span>Active Scrapes: <strong>1,840 queries/hr</strong></span>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1 bg-[#F0F7FD] p-1 rounded-lg border border-[#D0E5F8]">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-all ${
              filter === "all"
                ? "bg-white text-[#0284C7] shadow-sm border border-[#BAE6FD]"
                : "text-[#64748B] hover:text-[#0C4A6E]"
            }`}
          >
            All Routes
          </button>
          <button
            onClick={() => setFilter("metro")}
            className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-all ${
              filter === "metro"
                ? "bg-white text-[#0284C7] shadow-sm border border-[#BAE6FD]"
                : "text-[#64748B] hover:text-[#0C4A6E]"
            }`}
          >
            Metro-to-Metro
          </button>
          <button
            onClick={() => setFilter("tier2")}
            className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-all ${
              filter === "tier2"
                ? "bg-white text-[#0284C7] shadow-sm border border-[#BAE6FD]"
                : "text-[#64748B] hover:text-[#0C4A6E]"
            }`}
          >
            Tier-2 Express
          </button>
          <button
            onClick={() => setFilter("intl")}
            className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-all ${
              filter === "intl"
                ? "bg-white text-[#0284C7] shadow-sm border border-[#BAE6FD]"
                : "text-[#64748B] hover:text-[#0C4A6E]"
            }`}
          >
            Gulf & Intl
          </button>
        </div>
      </div>

      {/* Stylized Radar Canvas */}
      <div className="relative flex-1 w-full min-h-[340px] mt-3 bg-gradient-to-b from-[#F3F9FF] to-[#E5F3FF] border border-[#D5E8F8] rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
        {/* Radar Range Rings & Crosshairs */}
        <svg
          viewBox="0 0 740 450"
          className="w-full h-full select-none"
          style={{ maxHeight: "420px" }}
        >
          <defs>
            {/* Soft grid pattern */}
            <pattern id="radarGrid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#D7E9F9" strokeWidth="0.75" />
            </pattern>

            {/* Sweep gradient */}
            <radialGradient id="radarCenter" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0284C7" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0284C7" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background Grid */}
          <rect width="740" height="450" fill="url(#radarGrid)" />

          {/* Range Circles centered around Indian subcontinent (approx 360, 220) */}
          <g stroke="#C5E0F7" strokeWidth="1" fill="none" opacity="0.8">
            <circle cx="360" cy="220" r="80" strokeDasharray="4 4" />
            <circle cx="360" cy="220" r="150" strokeDasharray="4 4" />
            <circle cx="360" cy="220" r="230" strokeDasharray="6 6" />
            <line x1="360" y1="0" x2="360" y2="450" stroke="#D0E5F8" strokeDasharray="3 3" />
            <line x1="0" y1="220" x2="740" y2="220" stroke="#D0E5F8" strokeDasharray="3 3" />
          </g>

          {/* Radar Sweep Animation */}
          {sweepEnabled && (
            <g transform="translate(360, 220)">
              <line
                x1="0"
                y1="0"
                x2="280"
                y2="0"
                stroke="#0284C7"
                strokeWidth="1.75"
                opacity="0.6"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0"
                  to="360"
                  dur="7s"
                  repeatCount="indefinite"
                />
              </line>
            </g>
          )}

          {/* Range Labels */}
          <text x="365" y="145" fill="#94A3B8" fontSize="9" fontFamily="var(--font-jetbrains-mono)">500 KM</text>
          <text x="365" y="75" fill="#94A3B8" fontSize="9" fontFamily="var(--font-jetbrains-mono)">1000 KM</text>
          <text x="365" y="20" fill="#94A3B8" fontSize="9" fontFamily="var(--font-jetbrains-mono)">1500 KM</text>

          {/* Flight Paths (Dotted Great Circle Arcs) */}
          {filteredPaths.map((path) => {
            const orig = RADAR_AIRPORTS[path.origin];
            const dest = RADAR_AIRPORTS[path.dest];
            if (!orig || !dest) return null;

            const isSelected = selectedRouteId === path.id;
            const strokeColor = getPathColor(path.fareIndex, isSelected);
            const d = createCurvedPath(orig.x, orig.y, dest.x, dest.y);

            return (
              <g
                key={path.id}
                className="cursor-pointer group"
                onClick={() => onSelectRoute(path.id)}
              >
                {/* Invisible wider stroke for easy click/hover */}
                <path d={d} stroke="transparent" strokeWidth="16" fill="none" />

                {/* Visible dotted arc */}
                <path
                  d={d}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? "3.5" : "1.8"}
                  strokeDasharray={isSelected ? "none" : "4 3"}
                  strokeLinecap="round"
                  fill="none"
                  className="transition-all duration-200 group-hover:stroke-width-3"
                  opacity={isSelected ? 1 : 0.75}
                />

                {/* Animated pulse dot travelling along selected route */}
                {isSelected && (
                  <circle r="3.5" fill="#0284C7" stroke="#FFFFFF" strokeWidth="1.5">
                    <animateMotion path={d} dur="3.5s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Airport Nodes & Labels */}
          {Object.values(RADAR_AIRPORTS).map((airport) => {
            const isMajorHub = airport.iata === "DEL" || airport.iata === "BOM" || airport.iata === "BLR";

            return (
              <g key={airport.iata} transform={`translate(${airport.x}, ${airport.y})`}>
                {/* Subtle radar beacon halo */}
                <circle
                  r={isMajorHub ? 9 : 6}
                  fill="#0284C7"
                  opacity="0.18"
                  className="animate-pulse"
                />
                {/* Node center point */}
                <circle
                  r={isMajorHub ? 4.5 : 3.5}
                  fill="#0369A1"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  className="shadow-sm"
                />
                {/* Airport IATA Label */}
                <rect
                  x={airport.iata === "DXB" ? -34 : 7}
                  y="-10"
                  width="26"
                  height="14"
                  rx="3"
                  fill="#FFFFFF"
                  stroke="#CFE3F7"
                  strokeWidth="0.75"
                />
                <text
                  x={airport.iata === "DXB" ? -21 : 20}
                  y="0"
                  textAnchor="middle"
                  fill="#0C4A6E"
                  fontSize="8.5"
                  fontFamily="var(--font-jetbrains-mono)"
                  fontWeight="bold"
                >
                  {airport.iata}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Quick Stats Tag */}
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm border border-[#CFE3F7] rounded px-2.5 py-1 text-[10px] font-mono text-[#0369A1] shadow-sm flex items-center gap-1.5">
          <Plane className="w-3 h-3 text-[#0284C7]" />
          <span>INDIAN AIRSPACE RADAR GRID · {filteredPaths.length} ACTIVE ARCS</span>
        </div>
      </div>

      {/* Bottom Legend & Radar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t border-[#E2EEF9] text-xs font-mono text-[#64748B]">
        {/* Fare color scale legend */}
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-[#475569] font-medium">Fare Scale:</span>
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
            &lt;98 Depressed
          </span>
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
            98–110 Normal
          </span>
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
            &gt;110 Surge
          </span>
        </div>

        {/* Small controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSweepEnabled(!sweepEnabled)}
            className={`px-2 py-1 rounded text-[11px] border transition-colors flex items-center gap-1 ${
              sweepEnabled
                ? "bg-[#E0F2FE] border-[#BAE6FD] text-[#0369A1]"
                : "bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]"
            }`}
          >
            <Radio className="w-3 h-3" />
            Sweep: {sweepEnabled ? "ON" : "OFF"}
          </button>
          <span className="text-[10px] text-[#94A3B8]">Click any arc to inspect corridor</span>
        </div>
      </div>
    </div>
  );
}
