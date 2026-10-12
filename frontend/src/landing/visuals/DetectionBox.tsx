import React from "react";

interface DetectionBoxProps {
  label: string;
  confidence?: string;
  className?: string;
  status?: "normal" | "warning" | "alert" | "accept";
  showTarget?: boolean;
}

export const DetectionBox: React.FC<DetectionBoxProps> = ({
  label,
  confidence = "0.98",
  className = "",
  status = "normal",
  showTarget = false,
}) => {
  const colorMap = {
    normal: {
      border: "border-cyan-400/60",
      bg: "bg-cyan-500/10",
      badge: "bg-cyan-950/80 text-cyan-300 border-cyan-400/40",
      target: "border-cyan-400/50",
    },
    accept: {
      border: "border-emerald-400/60",
      bg: "bg-emerald-500/10",
      badge: "bg-emerald-950/80 text-emerald-300 border-emerald-400/40",
      target: "border-emerald-400/50",
    },
    warning: {
      border: "border-amber-400/60",
      bg: "bg-amber-500/10",
      badge: "bg-amber-950/80 text-amber-300 border-amber-400/40",
      target: "border-amber-400/50",
    },
    alert: {
      border: "border-rose-400/60",
      bg: "bg-rose-500/10",
      badge: "bg-rose-950/80 text-rose-300 border-rose-400/40",
      target: "border-rose-400/50",
    },
  };

  const currentTheme = colorMap[status];

  return (
    <div className={`relative ${currentTheme.bg} ${className} pointer-events-none`}>
      {/* 4 Corner Brackets */}
      {/* Top Left */}
      <div className={`absolute -top-0.5 -left-0.5 w-2.5 h-2.5 border-t-2 border-l-2 ${currentTheme.border}`} />
      {/* Top Right */}
      <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 border-t-2 border-r-2 ${currentTheme.border}`} />
      {/* Bottom Left */}
      <div className={`absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 border-b-2 border-l-2 ${currentTheme.border}`} />
      {/* Bottom Right */}
      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-b-2 border-r-2 ${currentTheme.border}`} />

      {/* Target Reticle Crosshair (optional) */}
      {showTarget && (
        <div className="absolute inset-0 flex items-center justify-center opacity-40">
          <div className={`w-3 h-3 border border-dashed rounded-full ${currentTheme.target}`} />
          <div className={`absolute w-4 h-[1px] bg-cyan-400/40`} />
          <div className={`absolute h-4 w-[1px] bg-cyan-400/40`} />
        </div>
      )}

      {/* Tag with Class Label and Confidence */}
      <div
        className={`absolute -top-5 left-0 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase rounded border ${currentTheme.badge} flex items-center gap-1 shadow-sm whitespace-nowrap`}
      >
        <span>{label}</span>
        <span className="opacity-80 font-normal">{confidence}</span>
      </div>
    </div>
  );
};
