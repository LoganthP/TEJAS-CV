import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { FlowLine } from "../visuals/FlowLine";
import { Database, Cpu, FileCheck, Users, ShieldAlert, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";

export const ConceptSection: React.FC = () => {
  return (
    <section id="concept" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-8">
        {/* Section Header */}
        <div className="space-y-2">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.concept.sectionNum} / {LANDING_CONTENT.concept.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.concept.heading}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {LANDING_CONTENT.concept.subtitle}
          </p>
        </div>

        {/* Conceptual Diagram Container */}
        <TiltCard className="p-6 sm:p-8 lg:p-10 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Column: Inputs */}
            <div className="lg:col-span-3 space-y-3">
              <div className="font-mono text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>{LANDING_CONTENT.concept.inputs.title}</span>
              </div>

              <div className="space-y-2.5">
                {LANDING_CONTENT.concept.inputs.items.map((item) => (
                  <div
                    key={item.label}
                    className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-cyan-400/40 transition-colors"
                  >
                    <div className="font-semibold text-xs sm:text-sm text-white">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {item.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Center Column: The Glowing Assurance Core (4 Engines) */}
            <div className="lg:col-span-6 relative p-6 rounded-2xl bg-gradient-to-b from-[#0c1424] to-[#060a12] border border-cyan-500/30 shadow-2xl overflow-hidden space-y-4">
              {/* Scanline sweep */}
              <div className="scanline-sweep scan-sweep-active opacity-60" />

              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="font-mono text-xs font-bold tracking-widest text-cyan-300 uppercase">
                    TEJAS-CV ASSURANCE CORE
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-400">
                  AIR-GAPPED INSTANCE
                </span>
              </div>

              {/* 4 Engine Tiles with slow scanning lines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                {LANDING_CONTENT.concept.engines.map((eng) => (
                  <div
                    key={eng.title}
                    className="p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-cyan-400/40 transition-all space-y-1.5 relative overflow-hidden group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/20 font-semibold tracking-wider">
                        {eng.status}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </div>
                    <div className="font-bold text-xs sm:text-sm text-white group-hover:text-cyan-200 transition-colors">
                      {eng.title}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {eng.subtitle}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[10px] font-mono text-slate-400">
                <span>PARALLEL EXECUTION</span>
                <span className="text-cyan-400">SHA256 CHECKSUM VERIFIED</span>
              </div>
            </div>

            {/* Right Column: Assured Outputs */}
            <div className="lg:col-span-3 space-y-3">
              <div className="font-mono text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{LANDING_CONTENT.concept.outputs.title}</span>
              </div>

              {/* Decision Verdict Chips */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                <span className="text-[10px] font-mono text-slate-400 tracking-wider uppercase block">
                  Verdict Chips
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-mono text-[10px] font-bold">
                    ACCEPT
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-bold">
                    REVIEW
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/40 font-mono text-[10px] font-bold">
                    QUARANTINE
                  </span>
                </div>
              </div>

              {/* Assured Artifacts */}
              <div className="space-y-1.5">
                {LANDING_CONTENT.concept.outputs.items.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-slate-200"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Small Caption */}
          <div className="text-center pt-2">
            <span className="font-mono text-xs text-slate-500 italic">
              "{LANDING_CONTENT.concept.caption}"
            </span>
          </div>
        </TiltCard>
      </div>
    </section>
  );
};
