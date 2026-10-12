import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { ArrowRight, XCircle, CheckCircle2 } from "lucide-react";

export const ImpactSection: React.FC = () => {
  return (
    <section id="impact" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-10">
        {/* Section Header */}
        <div className="space-y-2">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.impact.sectionNum} / {LANDING_CONTENT.impact.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.impact.heading}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {LANDING_CONTENT.impact.subtitle}
          </p>
        </div>

        {/* Side-by-Side Comparison Container */}
        <TiltCard className="p-8 sm:p-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-11 gap-6 items-center">
            {/* Left: Traditional Approach */}
            <div className="md:col-span-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-rose-500/20">
                <XCircle className="w-5 h-5 text-rose-400" />
                <h3 className="font-mono text-sm font-bold text-rose-300 uppercase tracking-wider">
                  {LANDING_CONTENT.impact.traditionalLabel}
                </h3>
              </div>

              <div className="space-y-3">
                {LANDING_CONTENT.impact.rows.map((row) => (
                  <div
                    key={row.traditional}
                    className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 flex items-center gap-3 text-slate-300 text-xs sm:text-sm"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                    <span>{row.traditional}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Center: Animated Transformation Arrow */}
            <div className="md:col-span-1 flex flex-col items-center justify-center py-2 md:py-0">
              <div className="p-3 rounded-full bg-white/[0.04] border border-white/10 text-cyan-400">
                <ArrowRight className="w-6 h-6 animate-pulse" />
              </div>
            </div>

            {/* Right: TEJAS-CV Approach */}
            <div className="md:col-span-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-mono text-sm font-bold text-emerald-300 uppercase tracking-wider">
                  {LANDING_CONTENT.impact.tejasLabel}
                </h3>
              </div>

              <div className="space-y-3">
                {LANDING_CONTENT.impact.rows.map((row) => (
                  <div
                    key={row.tejas}
                    className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center gap-3 text-slate-100 font-medium text-xs sm:text-sm"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span>{row.tejas}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Expected Outcome Statement */}
          <div className="pt-6 border-t border-white/10 text-center max-w-3xl mx-auto">
            <p className="text-sm sm:text-base text-cyan-200 font-medium italic leading-relaxed">
              "{LANDING_CONTENT.impact.expectedOutcome}"
            </p>
          </div>
        </TiltCard>
      </div>
    </section>
  );
};
