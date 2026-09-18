"use client";

import React from "react";
import { ArrowUpRight, ArrowDownRight, Compass, Globe, PlaneTakeoff } from "lucide-react";

interface StatItem {
  id: string;
  title: string;
  code: string;
  value: number;
  deltaPct: number;
  caption: string;
  sparkline: number[];
  color: string;
  icon: any;
}

const STAT_ITEMS: StatItem[] = [
  {
    id: "overall",
    title: "Overall APIx (Composite)",
    code: "C-APIx",
    value: 106.84,
    deltaPct: +1.42,
    caption: "75% Dom / 25% Intl basket · 124 Sectors · Top Mover: DEL-SXR (+14.2%)",
    sparkline: [102.1, 103.4, 104.2, 103.8, 105.1, 105.4, 106.84],
    color: "#0284C7",
    icon: Compass,
  },
  {
    id: "domestic",
    title: "Domestic APIx (DAPIx)",
    code: "D-APIx",
    value: 108.62,
    deltaPct: +1.85,
    caption: "75% National Weight · 98 City-Pairs · Top Mover: DEL-BOM (+11.6%)",
    sparkline: [103.5, 104.8, 105.9, 105.2, 107.0, 107.4, 108.62],
    color: "#0D9488",
    icon: PlaneTakeoff,
  },
  {
    id: "international",
    title: "International APIx (IAPIx)",
    code: "I-APIx",
    value: 101.48,
    deltaPct: +0.22,
    caption: "25% National Weight · 26 Intl Pairs · Top Mover: DEL-DXB (+6.5%)",
    sparkline: [98.2, 99.4, 100.1, 99.8, 100.5, 101.2, 101.48],
    color: "#6366F1",
    icon: Globe,
  },
];

// Helper to generate SVG sparkline path
function generateSparklinePath(points: number[], width = 200, height = 36) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  return `M ${coords.join(" L ")}`;
}

export default function StatCardsRow() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {STAT_ITEMS.map((item) => {
        const Icon = item.icon;
        const isUp = item.deltaPct >= 0;
        const sparklinePath = generateSparklinePath(item.sparkline, 240, 36);

        return (
          <div
            key={item.id}
            className="bg-white border border-[#CFE3F7] rounded-xl p-5 shadow-[0_2px_12px_rgba(46,127,204,0.08)] flex flex-col justify-between relative overflow-hidden group hover:border-[#BAE6FD] hover:shadow-[0_4px_16px_rgba(46,127,204,0.12)] transition-all"
          >
            {/* Top Row: Title + Code Pill */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="p-1.5 rounded-lg text-white"
                  style={{ backgroundColor: item.color }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-semibold font-space tracking-wide text-[#0C4A6E]">
                  {item.title}
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#F0F9FF] text-[#0369A1] border border-[#CFE3F7]">
                {item.code}
              </span>
            </div>

            {/* Value & 24h Delta */}
            <div className="flex items-baseline justify-between mt-3 mb-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold font-mono text-[#0C4A6E] tracking-tight">
                  {item.value.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-[#64748B]">pts</span>
              </div>

              <div
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                  isUp
                    ? "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]"
                    : "bg-[#ECFDF5] text-[#16A34A] border border-[#A7F3D0]"
                }`}
              >
                {isUp ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {isUp ? `+${item.deltaPct}%` : `${item.deltaPct}%`}
                <span className="text-[10px] font-normal text-[#64748B] ml-0.5">24h</span>
              </div>
            </div>

            {/* Context Caption */}
            <p className="text-[11px] text-[#64748B] font-sans leading-relaxed my-1">
              {item.caption}
            </p>

            {/* Sparkline Graphic in Sky Accent */}
            <div className="w-full h-9 mt-2 pt-1 border-t border-[#F1F5F9] relative flex items-center">
              <svg
                viewBox="0 0 240 36"
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id={`sparkGrad-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={item.color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={item.color} stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                {/* Filled area below path */}
                <path
                  d={`${sparklinePath} L 240,36 L 0,36 Z`}
                  fill={`url(#sparkGrad-${item.id})`}
                />

                {/* Stroke line */}
                <path
                  d={sparklinePath}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* End pulse dot */}
                <circle
                  cx="240"
                  cy={36 - ((item.sparkline[item.sparkline.length - 1] - Math.min(...item.sparkline)) / (Math.max(...item.sparkline) - Math.min(...item.sparkline) || 1)) * 28 - 4}
                  r="3"
                  fill={item.color}
                />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
