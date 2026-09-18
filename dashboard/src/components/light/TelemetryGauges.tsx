"use client";

import React from "react";
import { ShieldCheck, Activity, Cpu, CheckCircle2, AlertTriangle } from "lucide-react";

interface TelemetryGaugesProps {
  coverageScore?: number;
  confidenceScore?: number;
}

export default function TelemetryGauges({
  coverageScore = 100,
  confidenceScore = 98.5,
}: TelemetryGaugesProps) {
  // SVG Circle calculations (radius = 36, circumference = ~226.19)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  const covOffset = circumference - (coverageScore / 100) * circumference;
  const confOffset = circumference - (confidenceScore / 100) * circumference;

  return (
    <div className="bg-white border border-[#CFE3F7] rounded-xl shadow-[0_2px_12px_rgba(46,127,204,0.08)] p-5 flex flex-col h-full justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E2EEF9]">
        <div>
          <h3 className="text-base font-semibold font-space tracking-wide text-[#0C4A6E] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0284C7]" />
            Telemetry Integrity
          </h3>
          <p className="text-xs text-[#64748B] font-sans mt-0.5">
            Statistical sampling acuity & regulatory compliance audit
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857]">
          <CheckCircle2 className="w-2.5 h-2.5" />
          HEALTHY
        </span>
      </div>

      {/* Circular Ring Gauges */}
      <div className="grid grid-cols-2 gap-4 py-4 my-auto">
        {/* Gauge 1: Coverage Score */}
        <div className="flex flex-col items-center text-center">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 88 88">
              {/* Track */}
              <circle
                cx="44"
                cy="44"
                r={radius}
                stroke="#E2EEF9"
                strokeWidth="8"
                fill="transparent"
              />
              {/* Indicator */}
              <circle
                cx="44"
                cy="44"
                r={radius}
                stroke="#0284C7"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={covOffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center font-mono">
              <span className="text-xl font-bold text-[#0C4A6E] tracking-tight">
                {coverageScore.toFixed(0)}%
              </span>
              <span className="text-[9px] uppercase tracking-wider text-[#64748B]">Coverage</span>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#0F172A] mt-2">Corridor Coverage</span>
          <span className="text-[11px] font-mono text-[#0284C7]">14 / 14 City Pairs Active</span>
        </div>

        {/* Gauge 2: Confidence Score */}
        <div className="flex flex-col items-center text-center">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 88 88">
              {/* Track */}
              <circle
                cx="44"
                cy="44"
                r={radius}
                stroke="#E2EEF9"
                strokeWidth="8"
                fill="transparent"
              />
              {/* Indicator */}
              <circle
                cx="44"
                cy="44"
                r={radius}
                stroke="#0369A1"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={confOffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center font-mono">
              <span className="text-xl font-bold text-[#0C4A6E] tracking-tight">
                {confidenceScore.toFixed(1)}%
              </span>
              <span className="text-[9px] uppercase tracking-wider text-[#64748B]">Confidence</span>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#0F172A] mt-2">Jevons Precision</span>
          <span className="text-[11px] font-mono text-[#0369A1]">p &lt; 0.001 Significance</span>
        </div>
      </div>

      {/* Readout Metrics Below */}
      <div className="pt-3 border-t border-[#E2EEF9] space-y-2 font-mono text-xs">
        <div className="flex items-center justify-between text-[#475569]">
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            Anomalies Filtered:
          </span>
          <span className="font-semibold text-[#0F172A] tabular-nums">38 outliers rejected</span>
        </div>

        <div className="flex items-center justify-between text-[#475569]">
          <span className="flex items-center gap-1.5 text-[11px]">
            <Activity className="w-3 h-3 text-[#0284C7]" />
            Pipeline Sampling Latency:
          </span>
          <span className="font-semibold text-[#0F172A] tabular-nums">112 ms</span>
        </div>

        <div className="flex items-center justify-between text-[#475569]">
          <span className="flex items-center gap-1.5 text-[11px]">
            <Cpu className="w-3 h-3 text-[#0369A1]" />
            WAF / Proxy Bypass Rate:
          </span>
          <span className="font-semibold text-[#16A34A] tabular-nums">99.4% clean harvest</span>
        </div>
      </div>
    </div>
  );
}
