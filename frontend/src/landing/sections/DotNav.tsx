import React from "react";

interface DotNavProps {
  sections: { id: string; label: string }[];
  activeSection: string;
  onSelect: (id: string) => void;
}

export const DotNav: React.FC<DotNavProps> = ({
  sections,
  activeSection,
  onSelect,
}) => {
  return (
    <nav
      className="dot-nav-wrapper fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col items-center gap-3.5 bg-black/30 backdrop-blur-md p-2 rounded-full border border-white/10 shadow-xl"
      aria-label="Section Navigation"
    >
      {sections.map((section) => {
        const isActive = activeSection === section.id;
        return (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            className="group relative flex items-center justify-center p-1 focus:outline-none"
            aria-label={`Scroll to ${section.label}`}
          >
            {/* Hover Tooltip showing section title */}
            <span className="absolute right-7 px-2.5 py-1 rounded bg-[#0a1020]/95 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] tracking-wider whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-lg">
              {section.label}
            </span>

            {/* Dot Indicator */}
            <span
              className={`block rounded-full transition-all duration-300 ${
                isActive
                  ? "w-2.5 h-6 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                  : "w-2 h-2 bg-slate-500 group-hover:bg-cyan-300 group-hover:scale-125"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
};
