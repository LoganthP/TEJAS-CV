import React from "react";
import { LANDING_CONTENT } from "../content";
import { AssuranceCore } from "../visuals/AssuranceCore";
import { ArrowDown } from "lucide-react";

interface HeroSectionProps {
  onScrollTo: (id: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onScrollTo }) => {
  return (
    <section
      id="hero"
      className="presentation-section relative z-10 overflow-hidden flex flex-col justify-center"
    >
      <div className="w-full max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* Left Column: Typography & CTA */}
        <div className="lg:col-span-7 flex flex-col items-start text-left space-y-8">
          {/* Huge Title with subtle light shimmer sweep */}
          <div className="space-y-3">
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05] title-shimmer">
              {LANDING_CONTENT.hero.title}
            </h1>
            <p className="text-lg sm:text-xl lg:text-2xl text-slate-300 font-normal italic max-w-2xl leading-relaxed">
              {LANDING_CONTENT.hero.subtitle}
            </p>
          </div>

          {/* Tagline & Core Philosophy */}
          <div className="border-l-2 border-cyan-400/40 pl-4 py-1 space-y-1.5">
            <div className="font-mono text-sm sm:text-base font-bold tracking-widest text-cyan-300 uppercase">
              {LANDING_CONTENT.hero.tagline}
            </div>
            <div className="text-base sm:text-lg text-slate-200 font-medium italic">
              {LANDING_CONTENT.hero.motto}
            </div>
          </div>

          {/* CTA */}
          <div className="pt-2 flex items-center">
            <button
              onClick={() => onScrollTo("problem")}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-cyan-400/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 focus:outline-none"
            >
              <span>{LANDING_CONTENT.hero.primaryCta}</span>
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Glowing Assurance Core */}
        <div className="lg:col-span-5 flex items-center justify-center relative">
          <AssuranceCore interactive={true} />
        </div>
      </div>
    </section>
  );
};
