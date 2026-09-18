"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plane,
  Radio,
  Clock,
  ShieldCheck,
  TrendingUp,
  Download,
  Moon,
  ExternalLink,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Compass,
  FileSpreadsheet,
  FileJson,
  Building2,
  SlidersHorizontal,
} from "lucide-react";

import LightRouteRadar from "@/components/light/LightRouteRadar";
import HighVolatilityCard from "@/components/light/HighVolatilityCard";
import StatCardsRow from "@/components/light/StatCardsRow";
import LightTrendChart from "@/components/light/LightTrendChart";
import TelemetryGauges from "@/components/light/TelemetryGauges";
import RouteDispersionChart from "@/components/light/RouteDispersionChart";
import VelocityAnomalies from "@/components/light/VelocityAnomalies";
import LightLeadTimeCurve from "@/components/light/LightLeadTimeCurve";
import MonitoredCorridorsTable from "@/components/light/MonitoredCorridorsTable";

export default function LightDashboardPage() {
  const [selectedRouteId, setSelectedRouteId] = useState<string>("DEL-BOM");
  const [activeNavTab, setActiveNavTab] = useState<string>("Overview");
  const [reconciliationMode, setReconciliationMode] = useState<"realtime" | "mtd" | "audit">("realtime");
  const [countdown, setCountdown] = useState<number>(42);

  // Live 42s sync countdown ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 45 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const exportFullJson = () => {
    const payload = {
      index_name: "FlyWise Airfare Price Index (APIx)",
      timestamp: new Date().toISOString(),
      base_index: 100.0,
      overall_apix: 106.84,
      domestic_apix: 108.62,
      international_apix: 101.48,
      selected_route: selectedRouteId,
      coverage_score: 100.0,
      confidence_score: 98.5,
      methodology: "Laspeyres Geometric Weighted Index · DGCA Enplanement Weights",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flywise_apix_telemetry_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportFullCsv = () => {
    const rows = [
      ["Metric", "Value", "Baseline", "Status"],
      ["Overall APIx (Composite)", "106.84", "100.00", "LIVE"],
      ["Domestic DAPIx", "108.62", "100.00", "LIVE"],
      ["International IAPIx", "101.48", "100.00", "LIVE"],
      ["Coverage Score", "100.0%", "100.0%", "HEALTHY"],
      ["Confidence Score", "98.5%", "95.0%", "VERIFIED"],
      ["Active Route Focused", selectedRouteId, "100.00", "MONITORED"],
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `flywise_apix_summary_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF6FF] via-[#E2F0FC] to-[#D6ECFF] text-[#0C4A6E] font-sans antialiased selection:bg-[#BAE6FD] selection:text-[#0369A1]">
      {/* 1. MASTHEAD BAR */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#CFE3F7] shadow-[0_2px_10px_rgba(46,127,204,0.06)]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Left Brand Identity */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0284C7] to-[#38BDF8] flex items-center justify-center text-white shadow-[0_2px_8px_rgba(2,132,199,0.3)]">
                <Plane className="w-5 h-5 transform -rotate-45" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold font-space tracking-tight text-[#0C4A6E]">
                    FlyWise
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD]">
                    APIx
                  </span>
                </div>
                <div className="text-[10px] font-mono tracking-wider uppercase text-[#64748B]">
                  Ministry of Civil Aviation · Hackathon Live Demo
                </div>
              </div>
            </div>

            {/* Nav Tabs */}
            <nav className="hidden lg:flex items-center gap-1 ml-6 pl-6 border-l border-[#E2EEF9]">
              {["Overview", "Network Arcs", "Historical Indices", "Methodology"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveNavTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                    activeNavTab === tab
                      ? "bg-[#0284C7] text-white shadow-sm font-semibold"
                      : "text-[#475569] hover:text-[#0C4A6E] hover:bg-[#F0F9FF]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Right Live Indicators & Quick Stats */}
          <div className="flex items-center gap-3">
            {/* Live Ingestion Green Pill Badge */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              LIVE INGESTION
            </div>

            {/* Compact Overall APIx + 24h delta */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-[#F0F9FF] border border-[#CFE3F7]">
              <span className="text-[11px] font-mono text-[#64748B]">APIx:</span>
              <span className="text-sm font-bold font-mono text-[#0C4A6E]">106.84</span>
              <span className="inline-flex items-center text-[10px] font-mono font-bold text-[#DC2626] bg-[#FEF2F2] px-1 rounded">
                +1.42%
              </span>
            </div>

            {/* Dark Radar Switcher */}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium text-[#475569] hover:text-[#0C4A6E] bg-white border border-[#CFE3F7] rounded-lg shadow-sm hover:bg-[#F8FAFC] transition-colors"
              title="Switch to Dark Radar Theme"
            >
              <Moon className="w-3.5 h-3.5 text-[#0284C7]" />
              <span className="hidden md:inline">Dark Radar</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. SECONDARY STATUS STRIP */}
      <div className="bg-[#FFFFFF]/75 backdrop-blur-sm border-b border-[#CFE3F7] py-2">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          {/* Monitoring Readouts */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-[#475569]">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7]" />
              <span className="font-semibold text-[#0C4A6E]">PILOT MONITOR v2.4</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[#64748B]">
              <span>|</span>
              <ShieldCheck className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>DGCA REGULATORY RECONCILIATION BENCHMARK</span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 text-[#64748B]">
              <span>|</span>
              <Compass className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>INDIAN AIRSPACE INDEX</span>
            </div>
          </div>

          {/* Countdown & Mode Toggles */}
          <div className="flex items-center gap-3">
            {/* Sync Countdown */}
            <div className="flex items-center gap-1.5 text-[11px] text-[#0284C7] bg-[#F0F9FF] px-2.5 py-0.5 rounded border border-[#BAE6FD]">
              <Clock className="w-3 h-3 text-[#0284C7] animate-spin" style={{ animationDuration: "8s" }} />
              <span>NEXT SYNC IN: <strong className="tabular-nums">{countdown}s</strong></span>
            </div>

            {/* Reconciliation Toggles */}
            <div className="flex items-center p-0.5 bg-[#F0F9FF] border border-[#CFE3F7] rounded-lg">
              <button
                onClick={() => setReconciliationMode("realtime")}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                  reconciliationMode === "realtime"
                    ? "bg-[#0284C7] text-white shadow-xs"
                    : "text-[#475569] hover:text-[#0C4A6E]"
                }`}
              >
                Realtime Live
              </button>
              <button
                onClick={() => setReconciliationMode("mtd")}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                  reconciliationMode === "mtd"
                    ? "bg-[#0284C7] text-white shadow-xs"
                    : "text-[#475569] hover:text-[#0C4A6E]"
                }`}
              >
                DGCA MTD
              </button>
              <button
                onClick={() => setReconciliationMode("audit")}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                  reconciliationMode === "audit"
                    ? "bg-[#0284C7] text-white shadow-xs"
                    : "text-[#475569] hover:text-[#0C4A6E]"
                }`}
              >
                Quarterly Audit
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER (Desktop Width 1440px) */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 3. HERO SECTION (Two-Panel Split: Route Radar Map + High Volatility Card) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: National Route Radar Card (approx 63%) */}
          <div className="lg:col-span-8 min-h-[490px]">
            <LightRouteRadar
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => setSelectedRouteId(id)}
            />
          </div>

          {/* Right: High Volatility Route Detail Card (approx 37%) */}
          <div className="lg:col-span-4 min-h-[490px]">
            <HighVolatilityCard
              routeId={selectedRouteId}
              onInspectMatrix={() => {}}
            />
          </div>
        </section>

        {/* 4. STAT ROW (3 Cards: Overall, Domestic, International APIx) */}
        <section>
          <StatCardsRow />
        </section>

        {/* 5. CHART ROW 1: National Trend Analysis (Left) + Telemetry Integrity (Right) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-8 min-h-[400px]">
            <LightTrendChart />
          </div>
          <div className="lg:col-span-4 min-h-[400px]">
            <TelemetryGauges coverageScore={100} confidenceScore={98.5} />
          </div>
        </section>

        {/* 6. CHART ROW 2: Route Dispersion (Left) + Velocity Anomalies (Right) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 min-h-[440px]">
            <RouteDispersionChart
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => setSelectedRouteId(id)}
            />
          </div>
          <div className="lg:col-span-5 min-h-[440px]">
            <VelocityAnomalies
              onSelectRoute={(id) => setSelectedRouteId(id)}
            />
          </div>
        </section>

        {/* 7. LEAD-TIME CURVE (Full Width) */}
        <section>
          <LightLeadTimeCurve selectedRoute={selectedRouteId} />
        </section>

        {/* 8. MONITORED CORRIDORS TABLE (Full Width) */}
        <section>
          <MonitoredCorridorsTable
            selectedRouteId={selectedRouteId}
            onSelectRoute={(id) => setSelectedRouteId(id)}
          />
        </section>
      </main>

      {/* 9. FOOTER STRIP */}
      <footer className="mt-12 bg-white/90 backdrop-blur-sm border-t border-[#CFE3F7] py-6">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-[#64748B]">
          {/* Left Metadata */}
          <div className="space-y-1 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="font-bold text-[#0C4A6E]">Pipeline Feeds:</span>
              <span>Bright Data Web Scraper API</span>
              <span>·</span>
              <span>Scrappa Engine</span>
              <span>·</span>
              <span>Direct OTA GDS Feeds</span>
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-[11px]">
              <span>Refresh Interval: 90s Rolling Window</span>
              <span>·</span>
              <span>Active Coverage: 124 Routes / 6 Scheduled Carriers</span>
              <span>·</span>
              <span>Methodology: CPI Laspeyres Normalized</span>
            </div>
          </div>

          {/* Right Export Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={exportFullCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F0F9FF] hover:bg-[#E0F2FE] border border-[#BAE6FD] text-[#0284C7] font-semibold transition-colors shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={exportFullJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F0F9FF] hover:bg-[#E0F2FE] border border-[#BAE6FD] text-[#0284C7] font-semibold transition-colors shadow-xs"
            >
              <FileJson className="w-3.5 h-3.5" />
              Export JSON
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
