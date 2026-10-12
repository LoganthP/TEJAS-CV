import React from "react";
import { Severity } from "../../types/api";
import { getSeverityConfig } from "../../lib/severity";

interface SeverityChipProps {
  severity: Severity | string;
  size?: "sm" | "md";
  className?: string;
}

export const SeverityChip: React.FC<SeverityChipProps> = ({
  severity,
  size = "md",
  className = "",
}) => {
  const config = getSeverityConfig(severity);

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border font-mono font-semibold tracking-wider uppercase ${config.chipClass} ${sizeClasses[size]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      <span>{config.label}</span>
    </span>
  );
};
