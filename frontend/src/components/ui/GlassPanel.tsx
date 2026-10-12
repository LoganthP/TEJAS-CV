import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: "cyan" | "accept" | "review" | "quarantine" | "none";
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className = "",
  hover = false,
  glow = "none",
  ...props
}) => {
  const glowClasses = {
    cyan: "shadow-glow-cyan border-cyan-500/30",
    accept: "shadow-glow-accept border-emerald-500/30",
    review: "shadow-glow-review border-amber-500/30",
    quarantine: "shadow-glow-quarantine border-rose-500/30",
    none: "",
  };

  return (
    <div
      className={twMerge(
        clsx(
          "glass-panel text-slate-100 transition-all duration-200",
          hover && "glass-panel-hover cursor-pointer",
          glowClasses[glow],
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};
