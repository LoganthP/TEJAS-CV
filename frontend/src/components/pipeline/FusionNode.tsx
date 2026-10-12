import React from "react";
import { Cpu, Zap, Activity } from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";
import { CountUp } from "../ui/CountUp";
import { motion } from "framer-motion";

interface FusionNodeProps {
  active: boolean;
  riskScore: number | null;
  confidence: number | null;
  weights?: Record<string, number>;
}

export const FusionNode: React.FC<FusionNodeProps> = ({
  active,
  riskScore,
  confidence,
  weights = { data: 0.3, model: 0.3, provenance: 0.2, drift: 0.2 },
}) => {
  return (
    <GlassPanel
      className={`p-4 border transition-all duration-300 max-w-md mx-auto ${
        active
          ? "border-violet-500/50 bg-violet-950/15 shadow-glow-cyan"
          : "border-white/10"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
            <Zap className={`w-3.5 h-3.5 ${active ? "animate-bounce" : ""}`} />
          </div>
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
              Evidence Fusion Engine
            </h4>
            <span className="text-[10px] font-mono text-slate-400">
              Multi-source Bayesian evidence fusion
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-violet-500/10 text-violet-300 border border-violet-500/20">
          <Activity className="w-3 h-3 animate-pulse" />
          <span>FUSION</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3 bg-black/40 p-2.5 rounded-xl border border-white/5">
        <div className="text-center border-r border-white/10 pr-2">
          <span className="text-[10px] font-mono text-slate-400 uppercase block mb-0.5">
            Composite Risk
          </span>
          <div className="text-2xl font-mono font-bold text-slate-100 flex items-center justify-center gap-1">
            <CountUp value={riskScore} decimals={1} duration={900} />
            <span className="text-xs text-slate-500">/100</span>
          </div>
        </div>

        <div className="text-center pl-2">
          <span className="text-[10px] font-mono text-slate-400 uppercase block mb-0.5">
            Assurance Confidence
          </span>
          <div className="text-2xl font-mono font-bold text-cyan-300 flex items-center justify-center">
            <CountUp
              value={confidence !== null ? confidence * 100 : null}
              decimals={0}
              suffix="%"
              duration={900}
            />
          </div>
        </div>
      </div>

      {/* Weights breakdown chips */}
      <div className="mt-2.5 flex items-center justify-between text-[9px] font-mono text-slate-400 pt-2 border-t border-white/5">
        <span>Weights:</span>
        <span className="text-slate-300">Data 30%</span>
        <span>•</span>
        <span className="text-slate-300">Model 30%</span>
        <span>•</span>
        <span className="text-slate-300">Prov 20%</span>
        <span>•</span>
        <span className="text-slate-300">Drift 20%</span>
      </div>
    </GlassPanel>
  );
};
