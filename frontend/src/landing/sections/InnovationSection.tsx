import React from "react";
import { LANDING_CONTENT } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { ShieldX, Search, Link2, WifiOff, Quote } from "lucide-react";

export const InnovationSection: React.FC = () => {
  const innovationIcons = [
    <ShieldX className="w-5 h-5 text-rose-400" key="1" />,
    <Search className="w-5 h-5 text-cyan-400" key="2" />,
    <Link2 className="w-5 h-5 text-emerald-400" key="3" />,
    <WifiOff className="w-5 h-5 text-blue-400" key="4" />,
  ];

  return (
    <section id="innovation" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-10">
        {/* Section Header */}
        <div className="space-y-2">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.innovation.sectionNum} / {LANDING_CONTENT.innovation.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {LANDING_CONTENT.innovation.heading}
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            {LANDING_CONTENT.innovation.subtitle}
          </p>
        </div>

        {/* 4 Innovation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {LANDING_CONTENT.innovation.cards.map((card, idx) => (
            <TiltCard key={card.title} className="p-8 space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
                  {innovationIcons[idx % innovationIcons.length]}
                </div>
                <span className="font-mono text-xs font-bold text-cyan-400/80">
                  {card.number}
                </span>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white tracking-wide">
                  {card.title}
                </h3>
                <p className="text-sm text-slate-200 leading-relaxed font-medium">
                  {card.description}
                </p>
                <div className="pt-2 text-xs font-mono text-cyan-300">
                  → {card.highlight}
                </div>
              </div>
            </TiltCard>
          ))}
        </div>

        {/* Highlighted Statement Banner */}
        <TiltCard className="p-8 border-cyan-400/30 bg-gradient-to-r from-cyan-950/30 via-black/40 to-blue-950/30 text-center">
          <div className="flex flex-col items-center gap-3">
            <Quote className="w-8 h-8 text-cyan-400 opacity-60" />
            <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-wide max-w-3xl leading-snug">
              "{LANDING_CONTENT.innovation.callout}"
            </p>
          </div>
        </TiltCard>
      </div>
    </section>
  );
};
