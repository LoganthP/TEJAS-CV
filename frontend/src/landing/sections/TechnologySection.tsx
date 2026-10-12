import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { Layout, Terminal, KeyRound, HardDrive } from "lucide-react";

export const TechnologySection: React.FC = () => {
  const categoryIcons: Record<string, React.ReactNode> = {
    Interface: <Layout className="w-5 h-5 text-cyan-400" />,
    Analysis: <Terminal className="w-5 h-5 text-blue-400" />,
    "Trust Layer": <KeyRound className="w-5 h-5 text-emerald-400" />,
    Storage: <HardDrive className="w-5 h-5 text-amber-400" />,
  };

  return (
    <section id="technology" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-10">
        {/* Section Header */}
        <div className="space-y-2">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.technology.sectionNum} / {LANDING_CONTENT.technology.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.technology.heading}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {LANDING_CONTENT.technology.subtitle}
          </p>
        </div>

        {/* 4 Technology Groups */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {LANDING_CONTENT.technology.groups.map((grp) => (
            <TiltCard key={grp.category} className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center">
                  {categoryIcons[grp.category] || <Terminal className="w-5 h-5 text-cyan-400" />}
                </div>
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  {grp.category}
                </h3>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                {grp.items.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs font-mono text-slate-300"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </TiltCard>
          ))}
        </div>

        {/* Note */}
        <div className="text-center pt-2">
          <span className="font-mono text-xs text-slate-500 italic">
            "{LANDING_CONTENT.technology.disclaimer}"
          </span>
        </div>
      </div>
    </section>
  );
};
