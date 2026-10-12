import React from "react";
import { DetectionBox } from "./DetectionBox";
import { Database, Cpu, ShieldCheck, Activity } from "lucide-react";

interface AssuranceCoreProps {
  interactive?: boolean;
  simplified?: boolean;
  className?: string;
}

export const AssuranceCore: React.FC<AssuranceCoreProps> = ({
  interactive = true,
  simplified = false,
  className = "",
}) => {
  return (
    <div
      className={`relative w-full max-w-[480px] aspect-square mx-auto flex items-center justify-center select-none ${className}`}
    >
      {/* Outer Glow Halo */}
      <div className="absolute inset-4 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none animate-breathe" />

      {/* Outer Orbit Ring 1 (Concentric) */}
      <div className="absolute inset-0 rounded-full border border-cyan-500/15" />
      <div className="absolute inset-8 rounded-full border border-dashed border-cyan-500/20" />
      <div className="absolute inset-16 rounded-full border border-white/10" />

      {/* Radar sweeping hand */}
      {!simplified && (
        <div className="absolute inset-12 rounded-full overflow-hidden pointer-events-none">
          <div className="w-full h-full animate-radar origin-center">
            <div className="w-1/2 h-1/2 bg-gradient-to-br from-cyan-400/20 via-cyan-500/5 to-transparent origin-bottom-right" />
          </div>
        </div>
      )}

      {/* Four Peripheral Feeding Nodes: Data · Model · Provenance · Drift */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0a1020]/90 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] tracking-wider uppercase backdrop-blur-md shadow-lg shadow-cyan-950/50 z-20">
        <Database className="w-3 h-3 text-cyan-400" />
        <span>DATA</span>
      </div>

      <div className="absolute top-1/2 -right-3 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0a1020]/90 border border-blue-500/30 text-blue-300 font-mono text-[10px] tracking-wider uppercase backdrop-blur-md shadow-lg shadow-blue-950/50 z-20">
        <Cpu className="w-3 h-3 text-blue-400" />
        <span>MODEL</span>
      </div>

      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0a1020]/90 border border-emerald-500/30 text-emerald-300 font-mono text-[10px] tracking-wider uppercase backdrop-blur-md shadow-lg shadow-emerald-950/50 z-20">
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        <span>PROVENANCE</span>
      </div>

      <div className="absolute top-1/2 -left-3 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0a1020]/90 border border-amber-500/30 text-amber-300 font-mono text-[10px] tracking-wider uppercase backdrop-blur-md shadow-lg shadow-amber-950/50 z-20">
        <Activity className="w-3 h-3 text-amber-400" />
        <span>DRIFT</span>
      </div>

      {/* Connector lines from nodes toward the central hub */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        viewBox="0 0 400 400"
      >
        <line x1="200" y1="25" x2="200" y2="110" stroke="rgba(34, 211, 238, 0.4)" strokeWidth="1.5" strokeDasharray="3 4" />
        <line x1="375" y1="200" x2="290" y2="200" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="1.5" strokeDasharray="3 4" />
        <line x1="200" y1="375" x2="200" y2="290" stroke="rgba(52, 211, 153, 0.4)" strokeWidth="1.5" strokeDasharray="3 4" />
        <line x1="25" y1="200" x2="110" y2="200" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="1.5" strokeDasharray="3 4" />
      </svg>

      {/* Central Simulated Reconnaissance / Vision Tile */}
      <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-2xl bg-[#090e1a] border border-cyan-500/30 shadow-2xl overflow-hidden p-3 flex flex-col justify-between z-10">
        {/* Synthetic Tactical Aerial Grid */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:16px_16px]" />

        {/* Scanline sweep */}
        <div className="scanline-sweep scan-sweep-active" />

        {/* Diagonal topographical grid lines */}
        <svg
          className="absolute inset-0 w-full h-full opacity-15 pointer-events-none"
          viewBox="0 0 200 200"
        >
          <path d="M 0 50 Q 80 40 200 60" fill="none" stroke="#22d3ee" strokeWidth="1" />
          <path d="M 0 110 Q 120 90 200 130" fill="none" stroke="#22d3ee" strokeWidth="1" />
          <path d="M 0 160 Q 60 180 200 170" fill="none" stroke="#22d3ee" strokeWidth="1" />
        </svg>

        {/* Computer Vision Detection Boxes on the tile */}
        <div className="relative w-full h-full">
          {/* Target 1: Runway / Airfield */}
          <DetectionBox
            label="AIRFIELD"
            confidence="0.97"
            status="accept"
            showTarget={true}
            className="absolute top-4 left-3 w-20 h-14"
          />

          {/* Target 2: Vehicle Asset */}
          <DetectionBox
            label="CONVOY"
            confidence="0.94"
            status="normal"
            className="absolute bottom-5 right-4 w-16 h-12"
          />

          {/* Target 3: Anomaly / Trigger Scan */}
          <DetectionBox
            label="TRIGGER TEST"
            confidence="ZERO-DAY"
            status="warning"
            className="absolute top-10 right-3 w-14 h-10"
          />
        </div>

        {/* Core status badge overlay */}
        <div className="relative z-10 flex items-center justify-between text-[8px] font-mono tracking-wider text-cyan-300/80 bg-black/60 px-2 py-1 rounded border border-white/10 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>ASSURANCE CORE ACTIVE</span>
          </div>
          <span className="text-slate-400 font-sans">SHA256: 4f8a...e12b</span>
        </div>
      </div>
    </div>
  );
};
