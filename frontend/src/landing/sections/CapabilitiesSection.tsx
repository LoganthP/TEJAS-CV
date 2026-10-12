import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { Database, Cpu, ShieldCheck, SunMedium, FileText, WifiOff } from "lucide-react";

export const CapabilitiesSection: React.FC = () => {
  const capabilityIcons = [
    <Database className="w-5 h-5 text-cyan-400" key="1" />,
    <Cpu className="w-5 h-5 text-blue-400" key="2" />,
    <ShieldCheck className="w-5 h-5 text-emerald-400" key="3" />,
    <SunMedium className="w-5 h-5 text-amber-400" key="4" />,
    <FileText className="w-5 h-5 text-indigo-400" key="5" />,
    <WifiOff className="w-5 h-5 text-rose-400" key="6" />,
  ];

  return (
    <section id="capabilities" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-10">
        {/* Section Header */}
        <div className="space-y-2">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.capabilities.sectionNum} / {LANDING_CONTENT.capabilities.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.capabilities.heading}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {LANDING_CONTENT.capabilities.subtitle}
          </p>
        </div>

        {/* 6 Glass Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {LANDING_CONTENT.capabilities.items.map((item, idx) => (
            <TiltCard
              key={item.id}
              className="p-7 flex flex-col justify-between space-y-4 hover:border-cyan-400/40 transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
                    {capabilityIcons[idx % capabilityIcons.length]}
                  </div>
                  <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                    {item.badge}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-cyan-400/80 font-bold">
                      {item.number}.
                    </span>
                    <h3 className="text-lg font-bold text-white tracking-wide">
                      {item.title}
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span>VERIFIABLE PILLAR</span>
                <span className="text-cyan-400">ONLINE</span>
              </div>
            </TiltCard>
          ))}
        </div>
      </div>
    </section>
  );
};
