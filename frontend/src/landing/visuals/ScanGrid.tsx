import React from "react";

export const ScanGrid: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* 40px technology grid pattern */}
      <div className="absolute inset-0 tech-grid-pattern opacity-80" />

      {/* Deep ambient radial glow (Cyan and Blue) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] radial-glow-cyan" />
      <div className="absolute bottom-1/4 right-1/4 w-[1100px] h-[800px] radial-glow-blue" />
      <div className="absolute top-3/4 left-1/4 w-[800px] h-[600px] radial-glow-cyan opacity-50" />

      {/* Subtle vignette around edges */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#05070d]/60 via-transparent to-[#05070d]/80 pointer-events-none" />
    </div>
  );
};
