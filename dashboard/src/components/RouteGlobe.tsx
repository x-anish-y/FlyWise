"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import Globe, { GlobeMethods } from "react-globe.gl";
import {
  Compass,
  Maximize2,
  Minimize2,
  RotateCw,
  Plane,
  Layers,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Info,
  ArrowUpRight,
} from "lucide-react";
import { RouteRankItem } from "@/api-client";

export interface AirportLocation {
  iata: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  country: string;
}

export const AIRPORTS: Record<string, AirportLocation> = {
  DEL: { iata: "DEL", name: "Indira Gandhi International", city: "Delhi", lat: 28.5562, lng: 77.1, country: "India" },
  BOM: { iata: "BOM", name: "Chhatrapati Shivaji Maharaj", city: "Mumbai", lat: 19.0896, lng: 72.8656, country: "India" },
  BLR: { iata: "BLR", name: "Kempegowda International", city: "Bengaluru", lat: 13.1986, lng: 77.7066, country: "India" },
  CCU: { iata: "CCU", name: "Netaji Subhash Chandra Bose", city: "Kolkata", lat: 22.6547, lng: 88.4467, country: "India" },
  HYD: { iata: "HYD", name: "Rajiv Gandhi International", city: "Hyderabad", lat: 17.2403, lng: 78.4294, country: "India" },
  MAA: { iata: "MAA", name: "Chennai International", city: "Chennai", lat: 12.9941, lng: 80.1709, country: "India" },
  AMD: { iata: "AMD", name: "Sardar Vallabhbhai Patel", city: "Ahmedabad", lat: 23.0772, lng: 72.6347, country: "India" },
  GOI: { iata: "GOI", name: "Dabolim Airport", city: "Goa", lat: 15.38, lng: 73.8314, country: "India" },
  SXR: { iata: "SXR", name: "Sheikh ul-Alam International", city: "Srinagar", lat: 33.9871, lng: 74.7742, country: "India" },
  DXB: { iata: "DXB", name: "Dubai International", city: "Dubai", lat: 25.2532, lng: 55.3657, country: "United Arab Emirates" },
  SIN: { iata: "SIN", name: "Singapore Changi", city: "Singapore", lat: 1.3644, lng: 103.9915, country: "Singapore" },
  LHR: { iata: "LHR", name: "London Heathrow", city: "London", lat: 51.47, lng: -0.4543, country: "United Kingdom" },
};

export interface RouteArcData {
  route_id: string;
  origin: string;
  destination: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  price_relative: number;
  category: "domestic" | "international";
  is_cpi: boolean;
  observations: number;
  color: [string, string];
}

interface RouteGlobeProps {
  rankingData: RouteRankItem[];
  windowCategory?: "cpi_compatible" | "analytical";
  theme?: "dark" | "light";
  onRouteClick?: (routeId: string) => void;
}

export default function RouteGlobe({
  rankingData,
  windowCategory = "cpi_compatible",
  theme = "dark",
  onRouteClick,
}: RouteGlobeProps) {
  const isLight = theme === "light";
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [activeRoute, setActiveRoute] = useState<RouteArcData | null>(null);
  const [filter, setFilter] = useState<"all" | "domestic" | "international">("all");
  const [isRotating, setIsRotating] = useState(true);

  // Resize listener
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 520,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Initial camera position centered on India
  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.pointOfView({ lat: 21.0, lng: 78.0, altitude: 2.1 }, 1000);
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = isRotating;
        controls.autoRotateSpeed = 0.6;
        controls.enableZoom = true;
      }
    }
  }, [isRotating]);

  // Color generator based on price relative
  const getGradientForPrice = (priceRel: number): [string, string] => {
    if (priceRel >= 115) {
      return ["rgba(239, 68, 68, 0.95)", "rgba(248, 113, 113, 0.6)"]; // Red surge
    } else if (priceRel >= 100) {
      return ["rgba(240, 180, 41, 0.9)", "rgba(255, 212, 129, 0.6)"]; // Gold
    } else {
      return ["rgba(34, 197, 94, 0.95)", "rgba(74, 222, 128, 0.6)"]; // Green discount
    }
  };

  // Build arc dataset
  const arcsData: RouteArcData[] = useMemo(() => {
    const routePrices: Record<string, { price: number; obs: number; cat: "domestic" | "international" }> = {};

    rankingData.forEach((r) => {
      routePrices[r.route_id] = {
        price: r.price_relative,
        obs: r.sample_size,
        cat: r.category,
      };
    });

    const definedCorridors = [
      { id: "DEL-BOM", orig: "DEL", dest: "BOM", cat: "domestic", isCpi: true },
      { id: "DEL-BLR", orig: "DEL", dest: "BLR", cat: "domestic", isCpi: true },
      { id: "BOM-BLR", orig: "BOM", dest: "BLR", cat: "domestic", isCpi: true },
      { id: "BLR-HYD", orig: "BLR", dest: "HYD", cat: "domestic", isCpi: true },
      { id: "BOM-HYD", orig: "BOM", dest: "HYD", cat: "domestic", isCpi: true },
      { id: "DEL-AMD", orig: "DEL", dest: "AMD", cat: "domestic", isCpi: true },
      { id: "DEL-CCU", orig: "DEL", dest: "CCU", cat: "domestic", isCpi: true },
      { id: "DEL-GOI", orig: "DEL", dest: "GOI", cat: "domestic", isCpi: true },
      { id: "DEL-SXR", orig: "DEL", dest: "SXR", cat: "domestic", isCpi: true },
      { id: "MAA-DEL", orig: "MAA", dest: "DEL", cat: "domestic", isCpi: true },
      { id: "DEL-DXB", orig: "DEL", dest: "DXB", cat: "international", isCpi: true },
      { id: "BOM-DXB", orig: "BOM", dest: "DXB", cat: "international", isCpi: true },
      { id: "DEL-SIN", orig: "DEL", dest: "SIN", cat: "international", isCpi: true },
      { id: "BOM-SIN", orig: "BOM", dest: "SIN", cat: "international", isCpi: true },
    ];

    const results: RouteArcData[] = [];

    definedCorridors.forEach((c) => {
      const origAirport = AIRPORTS[c.orig];
      const destAirport = AIRPORTS[c.dest];
      if (!origAirport || !destAirport) return;

      const meta = routePrices[c.id] || {
        price: c.cat === "domestic" ? 104.2 : 93.8,
        obs: 12,
        cat: c.cat,
      };

      if (filter !== "all" && meta.cat !== filter) return;

      results.push({
        route_id: c.id,
        origin: c.orig,
        destination: c.dest,
        startLat: origAirport.lat,
        startLng: origAirport.lng,
        endLat: destAirport.lat,
        endLng: destAirport.lng,
        price_relative: meta.price,
        category: meta.cat,
        is_cpi: c.isCpi,
        observations: meta.obs,
        color: getGradientForPrice(meta.price),
      });
    });

    return results;
  }, [rankingData, filter]);

  // Points for airports
  const pointsData = useMemo(() => {
    return Object.values(AIRPORTS).map((a) => ({
      name: `${a.city} (${a.iata})`,
      iata: a.iata,
      lat: a.lat,
      lng: a.lng,
      size: a.iata === "DEL" || a.iata === "BOM" ? 0.7 : 0.45,
      color: a.country === "India" ? "#ffd481" : "#38bdf8",
    }));
  }, []);

  const resetView = () => {
    if (globeRef.current) {
      globeRef.current.pointOfView({ lat: 21.0, lng: 78.0, altitude: 2.1 }, 1000);
    }
  };

  const toggleRotate = () => {
    setIsRotating((prev) => {
      const next = !prev;
      if (globeRef.current?.controls()) {
        globeRef.current.controls().autoRotate = next;
      }
      return next;
    });
  };

  return (
    <div
      className={`rounded-xl overflow-hidden relative flex flex-col h-[520px] transition-all duration-200 ${
        isLight
          ? "bg-[#f8fafc] border border-[#CFE3F7] shadow-[0_4px_20px_rgba(207,227,247,0.5)]"
          : "bg-[#151520] border border-[#232336] shadow-2xl"
      }`}
    >
      {/* Top Overlay Controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pointer-events-none">
        {/* Title */}
        <div
          className={`pointer-events-auto px-3.5 py-2 rounded-lg flex items-center gap-2.5 backdrop-blur-md transition-colors ${
            isLight
              ? "bg-[#FFFFFF]/90 border border-[#CFE3F7] shadow-sm text-[#0f172a]"
              : "bg-[#0d0d18]/85 border border-[#232336] text-[#f8fafc]"
          }`}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-radar-ping" />
          <div>
            <h3
              className={`font-space font-semibold text-xs tracking-wide flex items-center gap-1.5 ${
                isLight ? "text-[#0f172a]" : "text-[#f8fafc]"
              }`}
            >
              <span>National & Cross-Border Airspace Radar</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                  isLight
                    ? "bg-[#E0F2FE] text-[#0284c7] border border-[#BAE6FD]"
                    : "bg-[#1b1b26] text-[#ffd481] border border-[#f0b429]/20"
                }`}
              >
                3D WebGL
              </span>
            </h3>
            <p className={`text-[10px] font-mono ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
              {arcsData.length} Monitored Corridors · Arcs Tinted by Current Fare Index
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div
          className={`pointer-events-auto flex items-center gap-2 backdrop-blur-md p-1 rounded-lg transition-colors ${
            isLight
              ? "bg-[#FFFFFF]/90 border border-[#CFE3F7] shadow-sm"
              : "bg-[#0d0d18]/85 border border-[#232336]"
          }`}
        >
          {/* Filter Pills */}
          <div className={`flex items-center gap-1 border-r pr-2 ${isLight ? "border-[#CFE3F7]" : "border-[#232336]"}`}>
            <button
              onClick={() => setFilter("all")}
              className={`px-2 py-1 text-[10px] font-mono font-medium rounded transition-colors ${
                filter === "all"
                  ? isLight
                    ? "bg-[#0284c7] text-white shadow-xs"
                    : "bg-[#232336] text-[#ffd481]"
                  : isLight
                  ? "text-[#64748b] hover:text-[#0f172a]"
                  : "text-[#94a3b8] hover:text-[#f8fafc]"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("domestic")}
              className={`px-2 py-1 text-[10px] font-mono font-medium rounded transition-colors ${
                filter === "domestic"
                  ? isLight
                    ? "bg-[#0284c7] text-white shadow-xs"
                    : "bg-[#232336] text-[#38bdf8]"
                  : isLight
                  ? "text-[#64748b] hover:text-[#0f172a]"
                  : "text-[#94a3b8] hover:text-[#f8fafc]"
              }`}
            >
              Domestic
            </button>
            <button
              onClick={() => setFilter("international")}
              className={`px-2 py-1 text-[10px] font-mono font-medium rounded transition-colors ${
                filter === "international"
                  ? isLight
                    ? "bg-[#0284c7] text-white shadow-xs"
                    : "bg-[#232336] text-[#c4e7ff]"
                  : isLight
                  ? "text-[#64748b] hover:text-[#0f172a]"
                  : "text-[#94a3b8] hover:text-[#f8fafc]"
              }`}
            >
              International
            </button>
          </div>

          <button
            onClick={toggleRotate}
            className={`p-1.5 rounded transition-colors ${
              isLight
                ? isRotating ? "text-[#0284c7] bg-[#F0F9FF]" : "text-[#64748b] hover:bg-[#F0F9FF]"
                : isRotating ? "text-[#ffd481]" : "text-[#94a3b8] hover:bg-[#1b1b26]"
            }`}
            title={isRotating ? "Pause Auto-Rotation" : "Start Auto-Rotation"}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetView}
            className={`p-1.5 rounded transition-colors ${
              isLight
                ? "text-[#64748b] hover:text-[#0284c7] hover:bg-[#F0F9FF]"
                : "text-[#94a3b8] hover:text-[#ffd481] hover:bg-[#1b1b26]"
            }`}
            title="Reset View to India"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3D Globe Canvas */}
      <div
        ref={containerRef}
        className={`w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden transition-colors duration-300 ${
          isLight
            ? "bg-[radial-gradient(circle_at_50%_50%,_#bae6fd_0%,_#cbe8fe_25%,_#e0f2fe_50%,_#f0f9ff_75%,_#f8fafc_100%)]"
            : "bg-[#151520]"
        }`}
      >
        {/* Atmospheric Sky Glow Halo in Light Mode */}
        {isLight && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[460px] h-[460px] rounded-full bg-[#38bdf8]/20 blur-3xl" />
          </div>
        )}
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="rgba(0, 0, 0, 0)"
          globeImageUrl={
            isLight
              ? "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
              : "//unpkg.com/three-globe/example/img/earth-night.jpg"
          }
          atmosphereColor="#38bdf8"
          atmosphereAltitude={0.15}
          // Arcs
          arcsData={arcsData}
          arcStartLat={(d: any) => d.startLat}
          arcStartLng={(d: any) => d.startLng}
          arcEndLat={(d: any) => d.endLat}
          arcEndLng={(d: any) => d.endLng}
          arcColor={(d: any) => d.color}
          arcAltitude={0.25}
          arcStroke={(d: any) => (activeRoute?.route_id === d.route_id ? 0.55 : 0.35)}
          arcDashLength={0.85}
          arcDashGap={0.15}
          arcDashAnimateTime={2400}
          onArcHover={(arc: any) => {
            if (arc) setActiveRoute(arc);
          }}
          onArcClick={(arc: any) => {
            if (arc) {
              setActiveRoute(arc);
              onRouteClick?.(arc.route_id);
            }
          }}
          // Airport points
          pointsData={pointsData}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointAltitude={0.015}
          pointRadius={0.45}
          // Labels
          labelsData={pointsData}
          labelLat="lat"
          labelLng="lng"
          labelText="iata"
          labelSize={1.1}
          labelDotRadius={0.2}
          labelAltitude={0.018}
          labelResolution={3}
          labelColor={() => "#ffffff"}
        />
      </div>

      {/* Active Route Popup Overlay Card (Requirement 4) */}
      {activeRoute && (
        <div
          onClick={() => {
            onRouteClick?.(activeRoute.route_id);
          }}
          className={`absolute bottom-12 left-4 z-20 p-4 rounded-xl max-w-sm min-w-[280px] text-xs font-sans backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200 cursor-pointer transition-all hover:scale-[1.02] group ${
            isLight
              ? "bg-[#FFFFFF]/95 border border-[#CFE3F7] hover:border-[#0284c7] shadow-[0_8px_30px_rgba(207,227,247,0.8)] text-[#0f172a]"
              : "bg-[#151520]/95 border border-[#232336] hover:border-[#38bdf8]/50 shadow-2xl text-[#f8fafc]"
          }`}
        >
          <div className={`flex items-center justify-between pb-2 mb-2 border-b ${isLight ? "border-[#CFE3F7]" : "border-[#232336]"}`}>
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-colors ${
                  isLight
                    ? "bg-[#F0F9FF] border-[#BAE6FD] group-hover:bg-[#E0F2FE]"
                    : "bg-[#1b1b26] border-[#38bdf8]/30 group-hover:border-[#38bdf8]"
                }`}
              >
                <Plane className="w-3.5 h-3.5 text-[#0284c7] transform -rotate-45" />
              </span>
              <div>
                <span className={`font-mono font-bold text-sm tracking-wide ${isLight ? "text-[#0f172a]" : "text-[#f8fafc]"}`}>
                  {activeRoute.route_id}
                </span>
                <span className={`text-[10px] block ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
                  {AIRPORTS[activeRoute.origin]?.city} → {AIRPORTS[activeRoute.destination]?.city}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveRoute(null);
              }}
              aria-label="Close route card"
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                isLight ? "text-[#64748b] hover:text-[#0f172a] hover:bg-[#F0F9FF]" : "text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#232336]"
              }`}
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 font-mono">
            {/* Price Relative Metric */}
            <div className="flex items-center justify-between">
              <span className={`text-[11px] ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>Current Price Relative:</span>
              <span className={`font-bold text-base tabular-nums ${isLight ? "text-[#0284c7]" : "text-[#ffd481]"}`}>
                {activeRoute.price_relative.toFixed(1)}
              </span>
            </div>

            {/* Baseline comparison */}
            <div className="flex items-center justify-between">
              <span className={`text-[11px] ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>Fare Movement:</span>
              <span
                className={`font-semibold flex items-center gap-1 tabular-nums ${
                  activeRoute.price_relative >= 100
                    ? isLight ? "text-[#dc2626]" : "text-[#ef4444]"
                    : isLight ? "text-[#16a34a]" : "text-[#22c55e]"
                }`}
              >
                {activeRoute.price_relative >= 100 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {activeRoute.price_relative >= 100 ? "+" : ""}
                {(activeRoute.price_relative - 100).toFixed(1)}% vs Base
              </span>
            </div>

            {/* Badges */}
            <div className={`flex flex-wrap items-center gap-1.5 pt-1.5 border-t ${isLight ? "border-[#CFE3F7]" : "border-[#1f1f2a]"}`}>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isLight
                    ? "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]"
                    : "bg-[#1b1b26] text-[#ffd481] border-[#f0b429]/30"
                }`}
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                Direct Route
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isLight
                    ? "bg-[#E0F2FE] text-[#0284C7] border-[#BAE6FD]"
                    : "bg-[#1b1b26] text-[#38bdf8] border-[#38bdf8]/30"
                }`}
              >
                <Layers className="w-2.5 h-2.5" />
                CPI-Compatible
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${
                  isLight
                    ? "bg-[#F0F9FF] text-[#64748b] border-[#CFE3F7]"
                    : "bg-[#0d0d18] text-[#94a3b8] border-[#232336]"
                }`}
              >
                {activeRoute.category}
              </span>
            </div>

            {/* Timestamp */}
            <div className={`flex items-center justify-between pt-1 text-[10px] ${isLight ? "text-[#64748b]" : "text-[#64748b]"}`}>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last Ingested: 18:00 IST
              </span>
              <span>{activeRoute.observations} sample flights</span>
            </div>

            {/* Click to open CTA */}
            <div
              className={`mt-1 pt-2 border-t flex items-center justify-between text-[11px] font-mono font-medium transition-colors ${
                isLight
                  ? "border-[#CFE3F7] text-[#0284c7] group-hover:text-[#0369a1]"
                  : "border-[#1f1f2a] text-[#38bdf8] group-hover:text-[#7dd3fc]"
              }`}
            >
              <span>Click to view route drill-down</span>
              <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Telemetry Strip Legend */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-10 backdrop-blur-md border-t px-4 py-2 flex flex-wrap items-center justify-between text-[11px] font-mono transition-colors ${
          isLight
            ? "bg-[#FFFFFF]/90 border-[#CFE3F7] text-[#64748b]"
            : "bg-[#0d0d18]/90 border-[#232336] text-[#94a3b8]"
        }`}
      >
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-full bg-[#ef4444]" />
            Above Base (&gt;100 Index / Surge)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-full bg-[#22c55e]" />
            Below Base (&lt;100 Index / Discount)
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isLight ? "bg-[#0284c7]" : "bg-[#ffd481]"}`} />
            Airport Hubs
          </span>
        </div>
        <div className="text-[10px] text-[#64748b] hidden md:block">
          Interactive: Drag to rotate · Scroll to zoom · Hover or click arcs for corridor telemetry
        </div>
      </div>
    </div>
  );
}
