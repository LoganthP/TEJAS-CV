import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { FlowLine } from "../visuals/FlowLine";
import { Fingerprint, Cpu, FileText, CheckCircle2, ShieldCheck } from "lucide-react";

export const WorkflowSection: React.FC = () => {
  const stepIcons = [
    <Fingerprint className="w-5 h-5 text-cyan-400" key="1" />,
    <Cpu className="w-5 h-5 text-blue-400" key="2" />,
    <FileText className="w-5 h-5 text-amber-400" key="3" />,
    <CheckCircle2 className="w-5 h-5 text-emerald-400" key="4" />,
    <ShieldCheck className="w-5 h-5 text-indigo-400" key="5" />,
  ];

  return (
    <section id="workflow" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-10">
        {/* Section Header */}
        <div className="space-y-2">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.workflow.sectionNum} / {LANDING_CONTENT.workflow.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.workflow.heading}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {LANDING_CONTENT.workflow.subtitle}
          </p>
        </div>

        {/* 5-Step Horizontal Flow on Desktop, Stacking Vertically on Mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 relative">
          {LANDING_CONTENT.workflow.steps.map((step, idx) => (
            <div key={step.step} className="flex flex-col relative">
              <TiltCard className="p-6 h-full flex flex-col justify-between space-y-4">
                {/* Header: Step Number & Badge */}
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-cyan-400/30 flex items-center justify-center">
                    {stepIcons[idx % stepIcons.length]}
                  </div>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/25 tracking-wider">
                    {step.tag}
                  </span>
                </div>

                {/* Step Details */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500 font-bold">
                      {step.step}.
                    </span>
                    <h3 className="text-lg font-bold text-white tracking-wide">
                      {step.title}
                    </h3>
                  </div>
                  <div className="font-mono text-xs text-cyan-300 font-medium">
                    {step.action}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-1">
                    {step.description}
                  </p>
                </div>

                {/* Bottom Sequence Counter */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>STAGE {idx + 1} OF 5</span>
                  <span className="text-cyan-400 font-bold">→</span>
                </div>
              </TiltCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
