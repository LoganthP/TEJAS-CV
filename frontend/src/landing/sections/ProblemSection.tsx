import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { AlertTriangle, ShieldAlert, FileQuestion, Radio } from "lucide-react";

export const ProblemSection: React.FC = () => {
  const challengeIcons = [
    <ShieldAlert className="w-5 h-5 text-amber-400" key="1" />,
    <AlertTriangle className="w-5 h-5 text-rose-400" key="2" />,
    <FileQuestion className="w-5 h-5 text-cyan-400" key="3" />,
    <Radio className="w-5 h-5 text-blue-400" key="4" />,
  ];

  return (
    <section id="problem" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-8">
        {/* Section Header */}
        <div className="space-y-2">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.problem.sectionNum} / {LANDING_CONTENT.problem.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.problem.heading}
          </h2>
        </div>

        {/* Large Glass Card */}
        <TiltCard className="p-8 sm:p-10 lg:p-12 space-y-10">
          {/* Top Row: The Problem & Why It Matters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 pb-8 border-b border-white/10">
            {/* The Problem */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-semibold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>{LANDING_CONTENT.problem.theProblemHeading}</span>
              </div>
              <p className="text-base sm:text-lg text-slate-200 leading-relaxed font-medium">
                {LANDING_CONTENT.problem.theProblemBody}
              </p>
            </div>

            {/* Why It Matters */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-semibold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>{LANDING_CONTENT.problem.whyItMattersHeading}</span>
              </div>
              <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
                {LANDING_CONTENT.problem.whyItMattersBody}
              </p>
            </div>
          </div>

          {/* Bottom Section: 4 Current Challenges */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
              CURRENT CRITICAL CHALLENGES IN DEFENCE AI
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {LANDING_CONTENT.problem.challenges.map((c, index) => (
                <div
                  key={c.number}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-cyan-500/30 hover:bg-white/[0.04] transition-all"
                >
                  <div className="mt-0.5 p-2 rounded-lg bg-black/40 border border-white/10 flex-shrink-0">
                    {challengeIcons[index % challengeIcons.length]}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-cyan-400/80 font-bold">
                        {c.number}.
                      </span>
                      <h4 className="text-sm font-semibold text-white">
                        {c.title}
                      </h4>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {c.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TiltCard>
      </div>
    </section>
  );
};
