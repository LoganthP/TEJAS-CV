import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { FlowLine } from "../visuals/FlowLine";
import { ShieldCheck, Database, Cpu, Activity, CheckCircle, HelpCircle, ShieldAlert } from "lucide-react";

export const SolutionSection: React.FC = () => {
  return (
    <section id="solution" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-10">
        {/* Section Header */}
        <div className="space-y-3 max-w-3xl">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.solution.sectionNum} / {LANDING_CONTENT.solution.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.solution.heading}
          </h2>
          <p className="text-base sm:text-lg text-cyan-200 font-medium italic">
            "{LANDING_CONTENT.solution.lead}"
          </p>
        </div>

        {/* Central Architecture Flow Diagram */}
        <TiltCard className="p-8 sm:p-10 lg:p-12 space-y-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 relative">
            {/* Step 1: Inputs (Data · Model · Outputs) */}
            <div className="w-full lg:w-1/4 flex flex-col gap-3">
              <span className="font-mono text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                EXISTING PIPELINE ASSETS
              </span>
              <div className="space-y-2.5">
                {LANDING_CONTENT.solution.flowItems.map((item, idx) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-cyan-400/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 font-mono text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{item.label}</div>
                      <div className="text-[11px] text-slate-400">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Glowing Connector: Left -> Center */}
            <div className="hidden lg:flex w-16 items-center justify-center">
              <FlowLine orientation="horizontal" length="100%" color="#22d3ee" />
            </div>
            <div className="flex lg:hidden h-10 items-center justify-center">
              <FlowLine orientation="vertical" length={40} color="#22d3ee" />
            </div>

            {/* Step 2: TEJAS-CV Offline Assurance Core */}
            <div className="w-full lg:w-2/5 p-6 rounded-2xl bg-gradient-to-b from-cyan-950/40 via-blue-950/20 to-black/60 border border-cyan-400/40 shadow-xl shadow-cyan-950/40 text-center space-y-4 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-400 text-slate-950 font-mono text-[10px] font-bold tracking-widest uppercase">
                INDEPENDENT LAYER
              </div>

              <div className="space-y-1 pt-2">
                <h3 className="text-2xl font-black tracking-wider text-white">
                  {LANDING_CONTENT.solution.hubTitle}
                </h3>
                <p className="text-xs text-cyan-300 font-mono">
                  {LANDING_CONTENT.solution.hubSubtitle}
                </p>
              </div>

              {/* Assurance Chips */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                {LANDING_CONTENT.solution.hubChips.map((chip) => (
                  <span
                    key={chip}
                    className="px-2.5 py-1 rounded-md bg-white/[0.05] border border-cyan-500/30 text-slate-200 font-mono text-[11px]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Glowing Connector: Center -> Right */}
            <div className="hidden lg:flex w-16 items-center justify-center">
              <FlowLine orientation="horizontal" length="100%" color="#22d3ee" />
            </div>
            <div className="flex lg:hidden h-10 items-center justify-center">
              <FlowLine orientation="vertical" length={40} color="#22d3ee" />
            </div>

            {/* Step 3: Outcomes (Evidence -> Decision) */}
            <div className="w-full lg:w-1/4 flex flex-col gap-3">
              <span className="font-mono text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                CRYPTOGRAPHIC ASSURANCE
              </span>
              <div className="space-y-2.5">
                {LANDING_CONTENT.solution.outcomes.map((item, idx) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-emerald-400/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400 font-mono text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{item.label}</div>
                      <div className="text-[11px] text-slate-400">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Descriptive Clarification */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
            <p className="text-sm sm:text-base text-slate-300 max-w-4xl mx-auto leading-relaxed">
              {LANDING_CONTENT.solution.description}
            </p>
          </div>
        </TiltCard>
      </div>
    </section>
  );
};
