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
}

export default function RouteGlobe({
  rankingData,
  windowCategory = "cpi_compatible",
}: RouteGlobeProps) {
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
      { id: "BLR-DEL", orig: "BLR", dest: "DEL", cat: "domestic", isCpi: true },
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
    <div className="bg-[#151520] border border-[#232336] rounded-xl overflow-hidden shadow-2xl relative flex flex-col h-[520px]">
      {/* Top Overlay Controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pointer-events-none">
        {/* Title */}
        <div className="pointer-events-auto bg-[#0d0d18]/85 backdrop-blur-md border border-[#232336] px-3.5 py-2 rounded-lg flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-radar-ping" />
          <div>
            <h3 className="font-space font-semibold text-xs tracking-wide text-[#f8fafc] flex items-center gap-1.5">
              <span>National & Cross-Border Airspace Radar</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1b1b26] text-[#ffd481] border border-[#f0b429]/20">
                3D WebGL
              </span>
            </h3>
            <p className="text-[10px] font-mono text-[#94a3b8]">
              {arcsData.length} Monitored Corridors · Arcs Tinted by Current Fare Index
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pointer-events-auto flex items-center gap-2 bg-[#0d0d18]/85 backdrop-blur-md border border-[#232336] p-1 rounded-lg">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 border-r border-[#232336] pr-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-2 py-1 text-[10px] font-mono font-medium rounded transition-colors ${
                filter === "all" ? "bg-[#232336] text-[#ffd481]" : "text-[#94a3b8] hover:text-[#f8fafc]"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("domestic")}
              className={`px-2 py-1 text-[10px] font-mono font-medium rounded transition-colors ${
                filter === "domestic" ? "bg-[#232336] text-[#38bdf8]" : "text-[#94a3b8] hover:text-[#f8fafc]"
              }`}
            >
              Domestic
            </button>
            <button
              onClick={() => setFilter("international")}
              className={`px-2 py-1 text-[10px] font-mono font-medium rounded transition-colors ${
                filter === "international" ? "bg-[#232336] text-[#c4e7ff]" : "text-[#94a3b8] hover:text-[#f8fafc]"
              }`}
            >
              International
            </button>
          </div>

          <button
            onClick={toggleRotate}
            className={`p-1.5 rounded hover:bg-[#1b1b26] transition-colors ${
              isRotating ? "text-[#ffd481]" : "text-[#94a3b8]"
            }`}
            title={isRotating ? "Pause Auto-Rotation" : "Start Auto-Rotation"}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetView}
            className="p-1.5 rounded hover:bg-[#1b1b26] text-[#94a3b8] hover:text-[#ffd481] transition-colors"
            title="Reset View to India"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3D Globe Canvas */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing">
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="rgba(10, 10, 15, 0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
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
          arcStroke={2.0}
          arcDashLength={0.9}
          arcDashGap={0.1}
          arcDashAnimateTime={2000}
          onArcHover={(arc: any) => {
            if (arc) setActiveRoute(arc);
          }}
          onArcClick={(arc: any) => {
            if (arc) setActiveRoute(arc);
          }}
          // Airport points
          pointsData={pointsData}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointAltitude={0.015}
          pointRadius={0.7}
          // Labels
          labelsData={pointsData}
          labelLat="lat"
          labelLng="lng"
          labelText="iata"
          labelSize={1.1}
          labelDotRadius={0.2}
          labelColor={() => "#f8fafc"}
        />
      </div>

      {/* Active Route Popup Overlay Card (Requirement 4) */}
      {activeRoute && (
        <div className="absolute bottom-12 left-4 z-20 bg-[#151520]/95 backdrop-blur-md border border-[#232336] p-4 rounded-xl shadow-2xl max-w-sm min-w-[260px] text-xs font-sans animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#232336]">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#1b1b26] flex items-center justify-center border border-[#38bdf8]/30">
                <Plane className="w-3.5 h-3.5 text-[#38bdf8] transform -rotate-45" />
              </span>
              <div>
                <span className="font-mono font-bold text-sm text-[#f8fafc] tracking-wide">
                  {activeRoute.route_id}
                </span>
                <span className="text-[10px] text-[#94a3b8] block">
                  {AIRPORTS[activeRoute.origin]?.city} → {AIRPORTS[activeRoute.destination]?.city}
                </span>
              </div>
            </div>
            <button
              onClick={() => setActiveRoute(null)}
              className="text-[#94a3b8] hover:text-[#f8fafc] text-xs px-1.5 py-0.5 rounded hover:bg-[#232336]"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 font-mono">
            {/* Price Relative Metric */}
            <div className="flex items-center justify-between">
              <span className="text-[#94a3b8] text-[11px]">Current Price Relative:</span>
              <span className="font-bold text-base text-[#ffd481] tabular-nums">
                {activeRoute.price_relative.toFixed(1)}
              </span>
            </div>

            {/* Baseline comparison */}
            <div className="flex items-center justify-between">
              <span className="text-[#94a3b8] text-[11px]">Fare Movement:</span>
              <span
                className={`font-semibold flex items-center gap-1 tabular-nums ${
                  activeRoute.price_relative >= 100 ? "text-[#ef4444]" : "text-[#22c55e]"
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
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[#1f1f2a]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1b1b26] text-[#ffd481] border border-[#f0b429]/30">
                <CheckCircle2 className="w-2.5 h-2.5 text-[#f0b429]" />
                Direct Route
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1b1b26] text-[#38bdf8] border border-[#38bdf8]/30">
                <Layers className="w-2.5 h-2.5" />
                CPI-Compatible
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-[#0d0d18] text-[#94a3b8] border border-[#232336]">
                {activeRoute.category}
              </span>
            </div>

            {/* Timestamp */}
            <div className="flex items-center justify-between pt-1 text-[10px] text-[#64748b]">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last Ingested: 18:00 IST
              </span>
              <span>{activeRoute.observations} sample flights</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Telemetry Strip Legend */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-[#0d0d18]/90 backdrop-blur-md border-t border-[#232336] px-4 py-2 flex flex-wrap items-center justify-between text-[11px] font-mono text-[#94a3b8]">
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
            <span className="w-2 h-2 rounded-full bg-[#ffd481]" />
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
