import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { FlowLine } from "../visuals/FlowLine";
import { Layers, Binary, ShieldCheck, GitMerge, CheckCircle, FileSignature } from "lucide-react";

export const ArchitectureSection: React.FC = () => {
  const stageIcons = [
    <Layers className="w-5 h-5 text-cyan-400" key="1" />,
    <Binary className="w-5 h-5 text-blue-400" key="2" />,
    <ShieldCheck className="w-5 h-5 text-indigo-400" key="3" />,
    <GitMerge className="w-5 h-5 text-amber-400" key="4" />,
    <CheckCircle className="w-5 h-5 text-emerald-400" key="5" />,
    <FileSignature className="w-5 h-5 text-cyan-400" key="6" />,
  ];

  return (
    <section id="architecture" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-8">
        {/* Section Header */}
        <div className="space-y-2">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.architecture.sectionNum} / {LANDING_CONTENT.architecture.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.architecture.heading}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {LANDING_CONTENT.architecture.subtitle}
          </p>
        </div>

        {/* Vertical Pipeline with animated connectors */}
        <TiltCard className="p-8 sm:p-10 max-w-4xl mx-auto space-y-6">
          <div className="relative flex flex-col space-y-3">
            {LANDING_CONTENT.architecture.stages.map((stg, idx) => (
              <React.Fragment key={stg.index}>
                <div className="flex items-center gap-4 sm:gap-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-cyan-400/40 hover:bg-white/[0.04] transition-all">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center flex-shrink-0">
                    {stageIcons[idx % stageIcons.length]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-cyan-400 font-bold">
                          STAGE 0{stg.index}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-white">
                          {stg.name}
                        </h3>
                      </div>
                      <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/10 uppercase hidden sm:inline-block">
                        {stg.type}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                      {stg.details}
                    </p>
                  </div>
                </div>

                {/* Flow connector between items (except last) */}
                {idx < LANDING_CONTENT.architecture.stages.length - 1 && (
                  <div className="flex justify-center -my-1">
                    <FlowLine orientation="vertical" length={20} color="#22d3ee" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="pt-4 border-t border-white/10 text-center">
            <span className="font-mono text-xs text-cyan-300">
              Assurance Pipeline Execution: Zero External Dependencies · 100% Deterministic & Verifiable
            </span>
          </div>
        </TiltCard>
      </div>
    </section>
  );
};
