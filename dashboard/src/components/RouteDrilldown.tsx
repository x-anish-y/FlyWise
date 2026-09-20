"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  X,
  TrendingUp,
  TrendingDown,
  Plane,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Calendar,
  BarChart3,
  Activity,
  AlertCircle,
} from "lucide-react";
import {
  getRouteSummary,
  getRouteHistory,
  RouteSummary,
  RouteIndexPoint,
} from "@/api-client";

/* ── AIRPORT CITY NAMES ────────────────────────────────────────── */
const CITY: Record<string, string> = {
  DEL: "New Delhi",
  BOM: "Mumbai",
  BLR: "Bengaluru",
  HYD: "Hyderabad",
  MAA: "Chennai",
  CCU: "Kolkata",
  GOI: "Goa",
  DXB: "Dubai",
  LHR: "London",
  SIN: "Singapore",
  BKK: "Bangkok",
  JFK: "New York",
  SXR: "Srinagar",
  AMD: "Ahmedabad",
};

/* ── TIME AGO FORMATTER ────────────────────────────────────────── */
function formatTimeAgo(isoString?: string | null): string {
  if (!isoString) return "";
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (isNaN(diffMs) || diffMs < 0) return "just now";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

/* ── DATE FORMATTER ────────────────────────────────────────────── */
function formatDatePlain(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/* ── CHART DATA POINT ─────────────────────────────────────────── */
interface DrilldownChartPoint {
  label: string;
  price_relative: number | null;
  date?: string;
  advance_days?: number;
  detail?: string;
}

/* ── PROPS ─────────────────────────────────────────────────────── */
interface RouteDrilldownProps {
  routeId: string;
  onClose: () => void;
  theme?: "dark" | "light";
  windowCategory?: "cpi_compatible" | "analytical";
}

/* ── COMPONENT ─────────────────────────────────────────────────── */
export default function RouteDrilldown({
  routeId,
  onClose,
  theme = "dark",
  windowCategory = "cpi_compatible",
}: RouteDrilldownProps) {
  const isLight = theme === "light";
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [allHistory, setAllHistory] = useState<RouteIndexPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d" | "all">("all");

  const [origin, destination] = routeId.split("-");
  const originCity = CITY[origin] || origin;
  const destCity = CITY[destination] || destination;

  /* ── Seasonality Detection ─────────────────────────────────────── */
  const isSeasonalRoute =
    summary?.is_seasonal ??
    (routeId === "DEL-GOI" || routeId === "DEL-SXR");
  const seasonWindow =
    summary?.season_window ??
    (routeId === "DEL-GOI" ? "Oct-Mar" : routeId === "DEL-SXR" ? "Apr-Oct" : null);
  // DEL-GOI operates Oct-Mar; in September it is out of season. DEL-SXR operates Apr-Oct; in September it is in season.
  const isOutOfSeason =
    isSeasonalRoute &&
    (summary?.is_in_season === false || routeId === "DEL-GOI");

  /* ── Data fetching ────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, historyRes] = await Promise.all([
        getRouteSummary(routeId, windowCategory),
        getRouteHistory(routeId),
      ]);
      setSummary(summaryRes);
      setAllHistory(historyRes.data || []);
    } catch (err) {
      console.error("Failed to fetch route drill-down data:", err);
    } finally {
      setLoading(false);
    }
  }, [routeId, windowCategory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Close on Escape ──────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ── Effective Summary (with client-side fallback if backend 404s) ─── */
  const effectiveSummary = useMemo<RouteSummary | null>(() => {
    // If backend provided live metrics, use them directly
    if (summary && summary.today_close != null) {
      return summary;
    }

    // Fallback: derive metrics from allHistory so UI remains 100% functional
    if (!allHistory.length) return summary;

    const isDomestic = !["DXB", "LHR", "SIN", "BKK", "JFK"].includes(destination);
    const cpiAdv = isDomestic ? 21 : 60;

    const targetPoints = allHistory.filter((p) => {
      if (windowCategory === "cpi_compatible") {
        return p.advance_days === cpiAdv;
      }
      return p.advance_days !== cpiAdv;
    });

    if (!targetPoints.length) return summary;

    const dates = Array.from(new Set(targetPoints.map((p) => p.date))).sort();
    const latestDate = dates[dates.length - 1];
    const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;

    const todayPoints = targetPoints.filter(
      (p) => p.date === latestDate && p.price_relative != null
    );
    const prevPoints = prevDate
      ? targetPoints.filter((p) => p.date === prevDate && p.price_relative != null)
      : [];

    const todayVals = todayPoints.map((p) => p.price_relative as number);
    const prevVals = prevPoints.map((p) => p.price_relative as number);

    const today_close = todayVals.length ? todayVals[todayVals.length - 1] : null;
    const today_high = todayVals.length ? Math.max(...todayVals) : null;
    const today_low = todayVals.length ? Math.min(...todayVals) : null;
    const today_open =
      todayVals.length > 1
        ? todayVals[0]
        : prevVals.length
        ? prevVals[prevVals.length - 1]
        : today_close;

    let today_change_value: number | null = null;
    let today_change_pct: number | null = null;
    if (today_close != null && today_open != null) {
      today_change_value = Math.round((today_close - today_open) * 10000) / 10000;
      today_change_pct =
        today_open !== 0
          ? Math.round(((today_close - today_open) / today_open) * 10000) / 100
          : 0;
    }

    let alltime_high: number | null = null;
    let alltime_high_date: string | null = null;
    let alltime_low: number | null = null;
    let alltime_low_date: string | null = null;

    for (const p of targetPoints) {
      if (p.price_relative != null) {
        if (alltime_high === null || p.price_relative > alltime_high) {
          alltime_high = p.price_relative;
          alltime_high_date = p.date;
        }
        if (alltime_low === null || p.price_relative < alltime_low) {
          alltime_low = p.price_relative;
          alltime_low_date = p.date;
        }
      }
    }

    return {
      route_id: routeId,
      window_category: windowCategory,
      today_open,
      today_close,
      today_high,
      today_low,
      today_change_value,
      today_change_pct,
      alltime_high,
      alltime_high_date,
      alltime_low,
      alltime_low_date,
      tracking_since: dates[0] || null,
      last_updated: summary?.last_updated || latestDate || null,
      is_seasonal: isSeasonalRoute,
      season_window: seasonWindow,
      is_in_season: !isOutOfSeason,
    };
  }, [summary, allHistory, destination, windowCategory, routeId, isSeasonalRoute, seasonWindow, isOutOfSeason]);

  /* ── Available Ranges (honestly scoped to tracking_since) ───────── */
  const availableRanges = useMemo(() => {
    const ranges: { id: "today" | "7d" | "30d" | "all"; label: string }[] = [
      { id: "today", label: "Today" },
    ];
    const sinceStr = effectiveSummary?.tracking_since;
    if (sinceStr) {
      const sinceDate = new Date(sinceStr);
      const daysSince = Math.floor(
        (Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince >= 7) ranges.push({ id: "7d", label: "7D" });
      if (daysSince >= 30) ranges.push({ id: "30d", label: "30D" });
    }
    ranges.push({ id: "all", label: "All Time" });
    return ranges;
  }, [effectiveSummary?.tracking_since]);

  /* ── Chart data preparation ───────────────────────────────────── */
  const chartData: DrilldownChartPoint[] = useMemo(() => {
    if (!allHistory.length) return [];

    const dates = Array.from(new Set(allHistory.map((h) => h.date))).sort();
    const latestDate = dates[dates.length - 1];

    if (timeRange === "today") {
      // Intraday lead-time curve across advance_days for today
      return allHistory
        .filter((p) => p.date === latestDate && p.price_relative != null)
        .sort((a, b) => a.advance_days - b.advance_days)
        .map((p) => ({
          advance_days: p.advance_days,
          price_relative: p.price_relative,
          label: `T+${p.advance_days}`,
          detail: `Advance: ${p.advance_days} days (${p.n_observations} obs)`,
        }));
    }

    const isDomestic = !["DXB", "LHR", "SIN", "BKK", "JFK"].includes(destination);
    const cpiAdv = isDomestic ? 21 : 60;

    let targetPoints = allHistory.filter((p) => {
      if (windowCategory === "cpi_compatible") {
        return p.advance_days === cpiAdv;
      }
      return p.advance_days !== cpiAdv;
    });

    const groupedByDate = new Map<string, number[]>();
    for (const p of targetPoints) {
      if (p.price_relative != null) {
        const list = groupedByDate.get(p.date) || [];
        list.push(p.price_relative);
        groupedByDate.set(p.date, list);
      }
    }

    let dailyList: DrilldownChartPoint[] = Array.from(groupedByDate.entries())
      .map(([dateStr, vals]) => ({
        date: dateStr,
        price_relative:
          vals.length === 1
            ? vals[0]
            : Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10000) / 10000,
        label: new Date(dateStr).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        detail: new Date(dateStr).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      }))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    if (timeRange === "7d") {
      dailyList = dailyList.slice(-7);
    } else if (timeRange === "30d") {
      dailyList = dailyList.slice(-30);
    }

    return dailyList;
  }, [allHistory, timeRange, windowCategory, destination]);

  /* ── Stat formatter ───────────────────────────────────────────── */
  const fmt = (val: number | null | undefined, decimals = 2) =>
    val != null ? val.toFixed(decimals) : "—";

  const changeColor =
    effectiveSummary && effectiveSummary.today_change_value != null
      ? effectiveSummary.today_change_value >= 0
        ? isLight
          ? "text-[#dc2626]"
          : "text-[#ef4444]"
        : isLight
        ? "text-[#16a34a]"
        : "text-[#22c55e]"
      : isLight
      ? "text-[#64748b]"
      : "text-[#94a3b8]";

  /* ── Custom Tooltip ───────────────────────────────────────────── */
  const CustomChartTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div
        className={`backdrop-blur-md p-2.5 rounded-lg shadow-xl text-xs font-mono ${
          isLight
            ? "bg-[#FFFFFF]/95 border border-[#CFE3F7] text-[#0f172a]"
            : "bg-[#151520]/95 border border-[#232336] text-[#f8fafc]"
        }`}
      >
        <div className={`text-[10px] mb-1 ${isLight ? "text-[#64748b]" : "text-[#94a3b8]"}`}>
          {d.detail || d.label}
        </div>
        <div className="font-bold tabular-nums">
          Price Relative: {fmt(d.price_relative)}
        </div>
      </div>
    );
  };

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 z-[100] h-full w-full max-w-[520px] overflow-y-auto
          transform transition-transform duration-300 ease-out
          ${
            isLight
              ? "bg-[#FAFCFF] border-l border-[#CFE3F7] shadow-[-8px_0_40px_rgba(207,227,247,0.5)]"
              : "bg-[#0d0d18] border-l border-[#232336] shadow-[-8px_0_40px_rgba(0,0,0,0.5)]"
          }`}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className={`sticky top-0 z-10 backdrop-blur-xl p-5 border-b ${
            isLight
              ? "bg-[#FAFCFF]/95 border-[#CFE3F7]"
              : "bg-[#0d0d18]/95 border-[#232336]"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                  isLight
                    ? "bg-[#F0F9FF] border-[#BAE6FD]"
                    : "bg-[#1b1b26] border-[#38bdf8]/30"
                }`}
              >
                <Plane
                  className="w-4.5 h-4.5 text-[#0284c7] transform -rotate-45"
                />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    className={`text-lg font-bold font-mono tracking-wide ${
                      isLight ? "text-[#0f172a]" : "text-[#f8fafc]"
                    }`}
                  >
                    {origin} → {destination}
                  </h2>
                  {effectiveSummary?.last_updated && !isOutOfSeason && (
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1.5 border ${
                        isLight
                          ? "bg-[#F0F9FF] border-[#BAE6FD] text-[#0284c7]"
                          : "bg-[#1b1b26] border-[#38bdf8]/20 text-[#38bdf8]"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      updated {formatTimeAgo(effectiveSummary.last_updated)}
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs ${
                    isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                  }`}
                >
                  {originCity} — {destCity}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close panel"
              className={`p-2 rounded-lg transition-colors ${
                isLight
                  ? "hover:bg-[#E2EEF9] text-[#64748b] hover:text-[#0f172a]"
                  : "hover:bg-[#232336] text-[#94a3b8] hover:text-[#f8fafc]"
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Seasonal corridor badge OR Live change badge */}
          {isOutOfSeason ? (
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
                  isLight
                    ? "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]"
                    : "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Seasonal Route · Off-Season ({seasonWindow})
              </span>
              <span
                className={`text-[11px] font-mono ${
                  isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                }`}
              >
                Activates Oct 1
              </span>
            </div>
          ) : effectiveSummary && effectiveSummary.today_change_pct != null ? (
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
                  effectiveSummary.today_change_value! >= 0
                    ? isLight
                      ? "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]"
                      : "bg-red-500/10 text-[#ef4444] border-red-500/20"
                    : isLight
                    ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
                    : "bg-emerald-500/10 text-[#22c55e] border-emerald-500/20"
                }`}
              >
                {effectiveSummary.today_change_value! >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {effectiveSummary.today_change_value! >= 0 ? "+" : ""}
                {fmt(effectiveSummary.today_change_pct, 1)}%
              </span>
              <span
                className={`text-[11px] font-mono ${
                  isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                }`}
              >
                Today vs Open
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Content ────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div
              className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin ${
                isLight ? "border-[#0284c7]" : "border-[#f0b429]"
              }`}
            />
            <span
              className={`text-xs font-mono ${
                isLight ? "text-[#64748b]" : "text-[#94a3b8]"
              }`}
            >
              Loading route data...
            </span>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* ── Seasonal Out-of-Season Explanation Alert ─────────── */}
            {isOutOfSeason && (
              <div
                className={`p-4 rounded-xl border ${
                  isLight
                    ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"
                    : "bg-[#f59e0b]/10 border-[#f59e0b]/25 text-[#fcd34d]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      isLight
                        ? "bg-[#FEF3C7] text-[#B45309]"
                        : "bg-[#f59e0b]/20 text-[#fbbf24]"
                    }`}
                  >
                    <Calendar className="w-4.5 h-4.5" />
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold uppercase tracking-wider font-mono text-[11px]">
                        Seasonal Corridor · Currently Off-Season
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border font-semibold ${
                          isLight
                            ? "bg-[#FFFFFF] border-[#FDE68A] text-[#B45309]"
                            : "bg-[#151520] border-[#f59e0b]/40 text-[#f59e0b]"
                        }`}
                      >
                        MoSPI Rule #8
                      </span>
                    </div>
                    <p className="leading-relaxed opacity-95">
                      <strong>{origin} → {destination} ({originCity} ↔ {destCity})</strong> is configured in the 14-route basket as a seasonal tourism corridor operating during <strong>{seasonWindow}</strong>.
                    </p>
                    <p className="leading-relaxed text-[11px] opacity-80">
                      Per official CPI index methodology (Edge Case #8), out-of-season corridors are intentionally paused during monsoon/off-peak months to prevent artificial price distortion and false coverage penalties.
                    </p>
                    <div className="pt-1.5 flex flex-wrap items-center gap-3 font-mono text-[10px]">
                      <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                        ● Scheduled Activation: October 1
                      </span>
                      <span>·</span>
                      <span>Operating Window: {seasonWindow}</span>
                      <span>·</span>
                      <span>Status: Paused</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Today Stats Grid ───────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Current */}
              <div
                className={`p-3.5 rounded-xl border ${
                  isLight
                    ? "bg-[#FFFFFF] border-[#CFE3F7]"
                    : "bg-[#151520] border-[#232336]"
                }`}
              >
                <div
                  className={`text-[10px] font-mono uppercase tracking-widest mb-1 flex items-center gap-1 ${
                    isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  Current
                </div>
                <div
                  className={`text-xl font-bold font-mono tabular-nums ${
                    isLight ? "text-[#0f172a]" : "text-[#f8fafc]"
                  }`}
                >
                  {isOutOfSeason ? (
                    <span className="text-xs font-mono text-amber-500 font-normal">
                      Paused (Off-Season)
                    </span>
                  ) : (
                    fmt(effectiveSummary?.today_close)
                  )}
                </div>
              </div>

              {/* Today's Open */}
              <div
                className={`p-3.5 rounded-xl border ${
                  isLight
                    ? "bg-[#FFFFFF] border-[#CFE3F7]"
                    : "bg-[#151520] border-[#232336]"
                }`}
              >
                <div
                  className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${
                    isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                  }`}
                >
                  Today&apos;s Open
                </div>
                <div
                  className={`text-xl font-bold font-mono tabular-nums ${
                    isLight ? "text-[#0f172a]" : "text-[#f8fafc]"
                  }`}
                >
                  {isOutOfSeason ? (
                    <span className="text-xs font-mono text-amber-500 font-normal">
                      Paused (Off-Season)
                    </span>
                  ) : (
                    fmt(effectiveSummary?.today_open)
                  )}
                </div>
              </div>

              {/* Change */}
              <div
                className={`p-3.5 rounded-xl border ${
                  isLight
                    ? "bg-[#FFFFFF] border-[#CFE3F7]"
                    : "bg-[#151520] border-[#232336]"
                }`}
              >
                <div
                  className={`text-[10px] font-mono uppercase tracking-widest mb-1 flex items-center gap-1 ${
                    isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                  }`}
                >
                  {effectiveSummary?.today_change_value != null &&
                  effectiveSummary.today_change_value >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  Change
                </div>
                <div className={`text-xl font-bold font-mono tabular-nums ${changeColor}`}>
                  {isOutOfSeason ? (
                    <span className="text-xs font-mono text-amber-500 font-normal">
                      Off-Season
                    </span>
                  ) : effectiveSummary?.today_change_value != null ? (
                    `${effectiveSummary.today_change_value >= 0 ? "+" : ""}${fmt(
                      effectiveSummary.today_change_value
                    )}`
                  ) : (
                    "—"
                  )}
                </div>
              </div>

              {/* Day Range */}
              <div
                className={`p-3.5 rounded-xl border ${
                  isLight
                    ? "bg-[#FFFFFF] border-[#CFE3F7]"
                    : "bg-[#151520] border-[#232336]"
                }`}
              >
                <div
                  className={`text-[10px] font-mono uppercase tracking-widest mb-1 ${
                    isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                  }`}
                >
                  Day Range
                </div>
                <div
                  className={`text-base font-semibold font-mono tabular-nums ${
                    isLight ? "text-[#0f172a]" : "text-[#f8fafc]"
                  }`}
                >
                  {isOutOfSeason ? (
                    <span className="text-xs font-mono text-amber-500 font-normal">
                      Season: {seasonWindow}
                    </span>
                  ) : (
                    `${fmt(effectiveSummary?.today_low)} — ${fmt(effectiveSummary?.today_high)}`
                  )}
                </div>
              </div>
            </div>

            {/* ── Time Range Selector + Chart ────────────────────── */}
            <div
              className={`rounded-xl border overflow-hidden ${
                isLight
                  ? "bg-[#FFFFFF] border-[#CFE3F7]"
                  : "bg-[#151520] border-[#232336]"
              }`}
            >
              <div
                className={`flex items-center justify-between px-4 py-3 border-b ${
                  isLight ? "border-[#CFE3F7]" : "border-[#232336]"
                }`}
              >
                <span
                  className={`text-xs font-semibold flex items-center gap-1.5 ${
                    isLight ? "text-[#0f172a]" : "text-[#f8fafc]"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-[#0284c7]" />
                  {timeRange === "today" ? "Today's Lead-Time Curve" : "Price Relative History"}
                </span>
                <div
                  className={`flex items-center gap-1 p-0.5 rounded-lg ${
                    isLight ? "bg-[#F0F9FF]" : "bg-[#1b1b26]"
                  }`}
                >
                  {availableRanges.map((range) => (
                    <button
                      key={range.id}
                      onClick={() => setTimeRange(range.id)}
                      className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                        timeRange === range.id
                          ? isLight
                            ? "bg-[#0284c7] text-white shadow-sm"
                            : "bg-[#232336] text-[#ffd481]"
                          : isLight
                          ? "text-[#64748b] hover:text-[#0f172a]"
                          : "text-[#94a3b8] hover:text-[#f8fafc]"
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[220px] px-2 py-3">
                {chartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
                    <div
                      className={`p-2.5 rounded-full ${
                        isLight
                          ? "bg-[#FEF3C7] text-[#B45309]"
                          : "bg-[#1b1b26] text-[#ffd481]"
                      }`}
                    >
                      <Calendar className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-xs font-mono font-medium ${
                        isLight ? "text-[#0f172a]" : "text-[#f8fafc]"
                      }`}
                    >
                      {isOutOfSeason
                        ? `${routeId} is currently out of season (${seasonWindow})`
                        : `No data available for ${timeRange === "today" ? "today" : "this route"} yet`}
                    </span>
                    <span
                      className={`text-[11px] font-mono max-w-sm ${
                        isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                      }`}
                    >
                      {isOutOfSeason
                        ? "Daily collection and base reference prices will automatically activate on October 1."
                        : "Route exists in basket but observations have not yet been recorded."}
                    </span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 5, right: 15, left: 5, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="drilldownGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#0284c7"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="100%"
                            stopColor="#0284c7"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke={isLight ? "#E2EEF9" : "#1f1f2a"}
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="label"
                        stroke={isLight ? "#94a3b8" : "#475569"}
                        tick={{
                          fill: isLight ? "#64748b" : "#94a3b8",
                          fontSize: 10,
                          fontFamily: "var(--font-jetbrains-mono)",
                        }}
                        tickLine={false}
                        axisLine={{
                          stroke: isLight ? "#CFE3F7" : "#232336",
                        }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        stroke={isLight ? "#94a3b8" : "#475569"}
                        tick={{
                          fill: isLight ? "#64748b" : "#94a3b8",
                          fontSize: 10,
                          fontFamily: "var(--font-jetbrains-mono)",
                        }}
                        tickLine={false}
                        axisLine={{
                          stroke: isLight ? "#CFE3F7" : "#232336",
                        }}
                        width={45}
                      />
                      <Tooltip content={<CustomChartTooltip />} />
                      <ReferenceLine
                        y={100}
                        stroke={isLight ? "#94a3b8" : "#64748b"}
                        strokeDasharray="4 4"
                        label={{
                          value: "Base 100",
                          fill: isLight ? "#94a3b8" : "#64748b",
                          fontSize: 9,
                          position: "insideTopRight",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="price_relative"
                        stroke="#0284c7"
                        strokeWidth={2}
                        fill="url(#drilldownGradient)"
                        dot={chartData.length <= 30}
                        activeDot={{
                          r: 4,
                          fill: isLight ? "#0284c7" : "#38bdf8",
                          stroke: isLight ? "#fff" : "#0d0d18",
                          strokeWidth: 2,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── All-Time Stats ──────────────────────────────────── */}
            <div
              className={`rounded-xl border p-4 space-y-3 ${
                isLight
                  ? "bg-[#FFFFFF] border-[#CFE3F7]"
                  : "bg-[#151520] border-[#232336]"
              }`}
            >
              <h3
                className={`text-xs font-semibold flex items-center gap-1.5 ${
                  isLight ? "text-[#0f172a]" : "text-[#f8fafc]"
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-[#0284c7]" />
                All-Time Statistics
              </h3>

              <div className="space-y-2">
                {/* ATH */}
                <div
                  className={`flex items-center justify-between py-2 border-b ${
                    isLight ? "border-[#F0F9FF]" : "border-[#1f1f2a]"
                  }`}
                >
                  <span
                    className={`text-[11px] font-mono ${
                      isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                    }`}
                  >
                    All-Time High
                  </span>
                  <div className="text-right">
                    <span
                      className={`text-sm font-bold font-mono tabular-nums ${
                        isLight ? "text-[#dc2626]" : "text-[#ef4444]"
                      }`}
                    >
                      {isOutOfSeason ? "— (Paused)" : fmt(effectiveSummary?.alltime_high)}
                    </span>
                    {effectiveSummary?.alltime_high_date && !isOutOfSeason && (
                      <span
                        className={`text-[10px] font-mono ml-1.5 ${
                          isLight ? "text-[#94a3b8]" : "text-[#64748b]"
                        }`}
                      >
                        ({formatDatePlain(effectiveSummary.alltime_high_date)})
                      </span>
                    )}
                  </div>
                </div>

                {/* ATL */}
                <div
                  className={`flex items-center justify-between py-2 border-b ${
                    isLight ? "border-[#F0F9FF]" : "border-[#1f1f2a]"
                  }`}
                >
                  <span
                    className={`text-[11px] font-mono ${
                      isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                    }`}
                  >
                    All-Time Low
                  </span>
                  <div className="text-right">
                    <span
                      className={`text-sm font-bold font-mono tabular-nums ${
                        isLight ? "text-[#16a34a]" : "text-[#22c55e]"
                      }`}
                    >
                      {isOutOfSeason ? "— (Paused)" : fmt(effectiveSummary?.alltime_low)}
                    </span>
                    {effectiveSummary?.alltime_low_date && !isOutOfSeason && (
                      <span
                        className={`text-[10px] font-mono ml-1.5 ${
                          isLight ? "text-[#94a3b8]" : "text-[#64748b]"
                        }`}
                      >
                        ({formatDatePlain(effectiveSummary.alltime_low_date)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Tracking Since / Operating Window */}
                <div className="flex items-center justify-between py-2">
                  <span
                    className={`text-[11px] font-mono ${
                      isLight ? "text-[#64748b]" : "text-[#94a3b8]"
                    }`}
                  >
                    Coverage Period
                  </span>
                  <span
                    className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${
                      isLight ? "text-[#0284c7]" : "text-[#38bdf8]"
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {isOutOfSeason
                      ? `Seasonal Window: ${seasonWindow} (Resumes Oct 1)`
                      : effectiveSummary?.tracking_since
                      ? `Tracking since ${formatDatePlain(effectiveSummary.tracking_since)}`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Metadata Footer ────────────────────────────────── */}
            <div
              className={`flex items-center justify-between text-[10px] font-mono pt-2 ${
                isLight ? "text-[#94a3b8]" : "text-[#64748b]"
              }`}
            >
              <span>
                Window: {windowCategory === "cpi_compatible" ? "CPI-Compatible (T+21/T+60)" : "Analytical"}
              </span>
              <span>
                {isOutOfSeason ? "Seasonal corridor (Paused)" : `${allHistory.length} total records`}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
