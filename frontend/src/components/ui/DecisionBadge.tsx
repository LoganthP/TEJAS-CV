import React from "react";
import { CheckCircle2, AlertTriangle, ShieldAlert, Clock } from "lucide-react";
import { Decision } from "../../types/api";
import { getDecisionConfig } from "../../lib/decision";

interface DecisionBadgeProps {
  decision: Decision | string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  showIcon?: boolean;
  className?: string;
  animate?: boolean;
}

export const DecisionBadge: React.FC<DecisionBadgeProps> = ({
  decision,
  size = "md",
  showIcon = true,
  className = "",
  animate = false,
}) => {
  const config = getDecisionConfig(decision);

  if (!config) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-slate-800/60 border border-slate-700/60 text-slate-400 ${className}`}
      >
        <Clock className="w-3.5 h-3.5 animate-spin" />
        {decision || "PENDING"}
      </span>
    );
  }

  const iconMap = {
    ACCEPT: CheckCircle2,
    REVIEW: AlertTriangle,
    QUARANTINE: ShieldAlert,
  };

  const Icon = iconMap[config.label];

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs font-mono gap-1",
    md: "px-2.5 py-1 text-xs font-mono font-semibold gap-1.5 tracking-wider",
    lg: "px-4 py-2 text-sm font-mono font-bold gap-2 tracking-widest",
    xl: "px-6 py-3 text-lg font-mono font-black gap-3 tracking-widest uppercase",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
    xl: "w-7 h-7",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border shadow-sm ${config.badgeBg} ${config.badgeBorder} ${config.badgeText} ${sizeClasses[size]} ${
        animate ? `${config.glowClass} animate-in fade-in zoom-in duration-300` : ""
      } ${className}`}
    >
      {showIcon && <Icon className={`${iconSizes[size]} shrink-0`} />}
      <span>{config.label}</span>
    </span>
  );
};
