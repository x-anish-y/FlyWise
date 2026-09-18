"use client";

import React, { useEffect, useState } from "react";
import { motion, Variants } from "framer-motion";
import {
  Activity,
  Plane,
  RefreshCw,
  Calendar,
  Layers,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Globe,
  Radio,
  ExternalLink,
  ChevronRight,
  Database,
} from "lucide-react";

import {
  getDailyApix,
  getWeeklyApix,
  getCoverage,
  getConfidence,
  getApixTrendData,
  getRouteRankingData,
  getHikesDropsData,
  getLeadTimeCurveData,
  getRoutes,
  DailyApixResponse,
  WeeklyApixResponse,
  TrendDataPoint,
  RouteRankItem,
  HikeDropItem,
  LeadTimeCurvePoint,
  RouteItem,
} from "@/api-client";

import dynamic from "next/dynamic";
import MetricCounter from "@/components/MetricCounter";
import ApixTrendChart from "@/components/ApixTrendChart";
import RouteRankingChart from "@/components/RouteRankingChart";
import HikesDropsChart from "@/components/HikesDropsChart";
import LeadTimeCurveChart from "@/components/LeadTimeCurveChart";

const RouteGlobe = dynamic(() => import("@/components/RouteGlobe"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[520px] bg-[#151520] border border-[#232336] rounded-xl flex items-center justify-center shadow-lg">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#f0b429] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-[#94a3b8]">
          Initializing 3D Airspace Radar Globe...
        </span>
      </div>
    </div>
  ),
});

export default function DashboardPage() {
  const [windowCategory, setWindowCategory] = useState<"cpi_compatible" | "analytical">(
    "cpi_compatible"
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Telemetry state
  const [dailyApix, setDailyApix] = useState<DailyApixResponse | null>(null);
  const [weeklyApix, setWeeklyApix] = useState<WeeklyApixResponse | null>(null);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [rankingData, setRankingData] = useState<RouteRankItem[]>([]);
  const [hikesDropsData, setHikesDropsData] = useState<HikeDropItem[]>([]);
  const [leadTimeData, setLeadTimeData] = useState<LeadTimeCurvePoint[]>([]);
  const [routesList, setRoutesList] = useState<RouteItem[]>([]);
  const [coverageScore, setCoverageScore] = useState<number>(100);
  const [confidenceScore, setConfidenceScore] = useState<number>(98.5);

  const loadDashboardData = async (cat = windowCategory) => {
    try {
      const [
        daily,
        weekly,
        trend,
        ranking,
        hikes,
        leadCurve,
        routes,
        cov,
        conf,
      ] = await Promise.all([
        getDailyApix(cat),
        getWeeklyApix(cat),
        getApixTrendData(cat),
        getRouteRankingData(),
        getHikesDropsData(),
        getLeadTimeCurveData("DEL-BOM"),
        getRoutes(),
        getCoverage(),
        getConfidence(),
      ]);

      setDailyApix(daily);
      setWeeklyApix(weekly);
      setTrendData(trend);
      setRankingData(ranking);
      setHikesDropsData(hikes);
      setLeadTimeData(leadCurve);
      setRoutesList(routes);

      // Score extractions
      const covEntry = cov.entries?.find((e) => e.window_category === cat);
      if (covEntry && covEntry.coverage_score != null) {
        setCoverageScore(covEntry.coverage_score * 100);
      }
      const confEntry = conf.entries?.find((e) => e.window_category === cat);
      if (confEntry && confEntry.confidence_score != null) {
        setConfidenceScore(confEntry.confidence_score * 100);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData(windowCategory);
  }, [windowCategory]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboardData(windowCategory);
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
  };

  const overall = dailyApix?.overall_apix ?? 100.02;
  const domestic = dailyApix?.domestic_apix ?? 103.05;
  const international = dailyApix?.international_apix ?? 92.95;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#f8fafc] flex flex-col font-sans">
      {/* Top Telemetry & Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#0d0d18]/90 backdrop-blur-md border-b border-[#232336] px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Brand & Radar ID */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#f0b429] to-[#d97706] flex items-center justify-center shadow-[0_0_15px_rgba(240,180,41,0.35)]">
              <Plane className="w-5 h-5 text-[#0a0a0f] transform -rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-space font-bold text-lg tracking-tight text-[#f8fafc]">
                  FlyWise <span className="text-[#f0b429]">APIx</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-950/70 border border-emerald-500/40 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-radar-ping" />
                  RADAR LIVE
                </span>
              </div>
              <p className="text-[11px] text-[#94a3b8] font-mono">
                Real-Time Airfare Price Index · MoSPI / DIID · SIH 2026
              </p>
            </div>
          </div>

          {/* Window Category Selector & Global Telemetry Actions */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            {/* Window Category Switcher */}
            <div className="flex items-center bg-[#151520] p-1 rounded-lg border border-[#232336]">
              <button
                onClick={() => setWindowCategory("cpi_compatible")}
                className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all flex items-center gap-1.5 ${
                  windowCategory === "cpi_compatible"
                    ? "bg-[#f0b429] text-[#0a0a0f] shadow-[0_0_10px_rgba(240,180,41,0.3)]"
                    : "text-[#94a3b8] hover:text-[#f8fafc]"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                CPI-Compatible (T+21 / T+60)
              </button>
              <button
                onClick={() => setWindowCategory("analytical")}
                className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all flex items-center gap-1.5 ${
                  windowCategory === "analytical"
                    ? "bg-[#38bdf8] text-[#0a0a0f] shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                    : "text-[#94a3b8] hover:text-[#f8fafc]"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Analytical (All T-Windows)
              </button>
            </div>

            {/* Ingestion Cycle Badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#151520] border border-[#232336] rounded-lg text-xs font-mono text-[#94a3b8]">
              <Radio className="w-3.5 h-3.5 text-[#f0b429] animate-pulse" />
              <span>CYCLE: 18:00 IST</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-[#151520] border border-[#232336] text-[#94a3b8] hover:text-[#ffd481] hover:border-[#f0b429]/40 transition-colors disabled:opacity-50"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-[#f0b429]" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* KPI Strip */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
        >
          {/* Card 1: Main Overall APIx */}
          <motion.div
            variants={itemVariants}
            className="lg:col-span-1 bg-[#151520] border-2 border-[#f0b429]/40 rounded-xl p-4 shadow-[0_0_20px_rgba(240,180,41,0.08)] relative overflow-hidden"
          >
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-[#f0b429]/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#94a3b8]">
              <span>NATIONAL APIx</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 font-semibold">
                LIVE
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-[#ffd481] tracking-tight">
              <MetricCounter value={overall} decimals={2} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
              <span>Base = 100.0</span>
              <span
                className={`flex items-center font-semibold ${
                  overall >= 100 ? "text-[#ef4444]" : "text-[#22c55e]"
                }`}
              >
                {overall >= 100 ? "+" : ""}
                {(overall - 100).toFixed(2)}%
              </span>
            </div>
          </motion.div>

          {/* Card 2: Domestic APIx (DAPIx) */}
          <motion.div
            variants={itemVariants}
            className="bg-[#151520] border border-[#232336] rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#94a3b8]">
              <span>DOMESTIC (DAPIx)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1b1b26] text-[#38bdf8] border border-[#38bdf8]/30">
                60% WT
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-[#38bdf8] tracking-tight">
              <MetricCounter value={domestic} decimals={2} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
              <span>Delhi, Mumbai, BLR</span>
              <span
                className={`flex items-center font-semibold ${
                  domestic >= 100 ? "text-[#ef4444]" : "text-[#22c55e]"
                }`}
              >
                {domestic >= 100 ? "+" : ""}
                {(domestic - 100).toFixed(2)}%
              </span>
            </div>
          </motion.div>

          {/* Card 3: International APIx (IAPIx) */}
          <motion.div
            variants={itemVariants}
            className="bg-[#151520] border border-[#232336] rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#94a3b8]">
              <span>INTL (IAPIx)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1b1b26] text-[#c4e7ff] border border-[#c4e7ff]/30">
                40% WT
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-[#c4e7ff] tracking-tight">
              <MetricCounter value={international} decimals={2} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
              <span>Dubai, London, SIN</span>
              <span
                className={`flex items-center font-semibold ${
                  international >= 100 ? "text-[#ef4444]" : "text-[#22c55e]"
                }`}
              >
                {international >= 100 ? "+" : ""}
                {(international - 100).toFixed(2)}%
              </span>
            </div>
          </motion.div>

          {/* Card 4: Coverage Score */}
          <motion.div
            variants={itemVariants}
            className="bg-[#151520] border border-[#232336] rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#94a3b8]">
              <span>DATA COVERAGE</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 font-semibold">
                NOMINAL
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-[#f8fafc] tracking-tight">
              <MetricCounter value={coverageScore} decimals={1} suffix="%" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
              <span>Active Corridors</span>
              <span className="text-emerald-400 font-semibold">14 / 14 Routes</span>
            </div>
          </motion.div>

          {/* Card 5: Statistical Confidence */}
          <motion.div
            variants={itemVariants}
            className="bg-[#151520] border border-[#232336] rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#94a3b8]">
              <span>STAT CONFIDENCE</span>
              <ShieldCheck className="w-3.5 h-3.5 text-[#38bdf8]" />
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-[#f8fafc] tracking-tight">
              <MetricCounter value={confidenceScore} decimals={1} suffix="%" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
              <span>Jevons Geometric</span>
              <span className="text-[#38bdf8] font-semibold">High Acuity</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Centerpiece 3D Airspace Radar Globe (Requirement 5) */}
        <motion.div
          variants={itemVariants}
          className="w-full"
        >
          <RouteGlobe
            rankingData={rankingData}
            windowCategory={windowCategory}
          />
        </motion.div>

        {/* Analytics Grid: Row 1 */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* Left 7 cols: APIx Trend Chart */}
          <motion.div variants={itemVariants} className="lg:col-span-7 h-[420px]">
            <ApixTrendChart data={trendData} windowCategory={windowCategory} />
          </motion.div>

          {/* Right 5 cols: Lead Time Curve Chart */}
          <motion.div variants={itemVariants} className="lg:col-span-5 h-[420px]">
            <LeadTimeCurveChart
              initialData={leadTimeData}
              availableRoutes={routesList.map((r) => r.route_id)}
            />
          </motion.div>
        </motion.div>

        {/* Analytics Grid: Row 2 */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* Left 6 cols: Route Ranking Chart */}
          <motion.div variants={itemVariants} className="lg:col-span-6 h-[420px]">
            <RouteRankingChart data={rankingData} />
          </motion.div>

          {/* Right 6 cols: Hikes Drops Chart */}
          <motion.div variants={itemVariants} className="lg:col-span-6 h-[420px]">
            <HikesDropsChart data={hikesDropsData} />
          </motion.div>
        </motion.div>

        {/* Airspace Corridor Telemetry Table */}
        <motion.div
          variants={itemVariants}
          className="bg-[#151520] border border-[#232336] rounded-xl overflow-hidden shadow-lg"
        >
          <div className="p-4 sm:p-5 border-b border-[#232336] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold font-space tracking-wide text-[#f8fafc] flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#38bdf8]" />
                Monitored Airspace Corridors & Observation Telemetry
              </h3>
              <p className="text-xs text-[#94a3b8] font-sans mt-0.5">
                Current cycle flight fare feeds scraped via Bright Data / Scrappa & normalized via FX Engine
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="http://127.0.0.1:8000/docs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#1b1b26] border border-[#232336] text-xs font-mono text-[#94a3b8] hover:text-[#ffd481] hover:border-[#f0b429]/40 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                API Docs
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-[#0f0f17] border-b border-[#232336] text-[#94a3b8] font-mono uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Corridor ID</th>
                  <th className="py-3 px-4">Sector</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Weight</th>
                  <th className="py-3 px-4">Price Relative</th>
                  <th className="py-3 px-4">Deviation</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f2a] font-mono">
                {rankingData.slice(0, 8).map((r, idx) => {
                  const delta = r.price_relative - 100;
                  const isUp = delta >= 0;
                  return (
                    <tr
                      key={r.route_id}
                      className="hover:bg-[#1b1b2a]/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-[#f8fafc] tracking-wide flex items-center gap-2">
                        <span className="text-[#38bdf8]">✈</span>
                        {r.route_id}
                      </td>
                      <td className="py-3 px-4 text-[#94a3b8]">
                        {r.origin_airport} → {r.destination_airport}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            r.category === "domestic"
                              ? "bg-[#1b1b26] text-[#38bdf8] border border-[#38bdf8]/30"
                              : "bg-[#1b1b26] text-[#c4e7ff] border border-[#c4e7ff]/30"
                          }`}
                        >
                          {r.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#94a3b8]">
                        {r.category === "domestic" ? "1.00 (60%)" : "1.00 (40%)"}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#ffd481] tabular-nums">
                        {r.price_relative.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        <span
                          className={`inline-flex items-center gap-0.5 font-semibold ${
                            isUp ? "text-[#ef4444]" : "text-[#22c55e]"
                          }`}
                        >
                          {isUp ? "+" : ""}
                          {delta.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          ONLINE
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#232336] bg-[#0d0d18] px-4 sm:px-8 py-4 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-[#64748b]">
          <p>
            FlyWise Real-Time Airfare Price Index (APIx) · Ministry of Statistics & Programme Implementation (MoSPI)
          </p>
          <div className="flex items-center gap-4 text-[#94a3b8]">
            <a
              href="http://127.0.0.1:8000/policy/apix.csv"
              className="hover:text-[#ffd481] transition-colors flex items-center gap-1"
            >
              Export CSV
            </a>
            <span>·</span>
            <a
              href="http://127.0.0.1:8000/policy/apix.json"
              className="hover:text-[#ffd481] transition-colors flex items-center gap-1"
            >
              Export JSON
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
