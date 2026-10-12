import { Severity } from "../types/api";

export const SEVERITY_ORDER: Severity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

export interface SeverityConfig {
  label: string;
  chipClass: string;
  borderClass: string;
  dotClass: string;
  bgClass: string;
  textClass: string;
}

export const SEVERITY_CONFIGS: Record<Severity, SeverityConfig> = {
  INFO: {
    label: "INFO",
    chipClass: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    borderClass: "border-slate-500/30",
    dotClass: "bg-slate-400",
    bgClass: "bg-slate-500/10",
    textClass: "text-slate-300",
  },
  LOW: {
    label: "LOW",
    chipClass: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    borderClass: "border-sky-500/30",
    dotClass: "bg-sky-400",
    bgClass: "bg-sky-500/10",
    textClass: "text-sky-300",
  },
  MEDIUM: {
    label: "MEDIUM",
    chipClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    borderClass: "border-amber-500/30",
    dotClass: "bg-amber-400",
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-300",
  },
  HIGH: {
    label: "HIGH",
    chipClass: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    borderClass: "border-orange-500/30",
    dotClass: "bg-orange-400",
    bgClass: "bg-orange-500/10",
    textClass: "text-orange-300",
  },
  CRITICAL: {
    label: "CRITICAL",
    chipClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    borderClass: "border-rose-500/40",
    dotClass: "bg-rose-400 animate-pulse",
    bgClass: "bg-rose-500/15",
    textClass: "text-rose-300",
  },
};

export function getSeverityConfig(sev: string | undefined): SeverityConfig {
  const upper = (sev?.toUpperCase() || "INFO") as Severity;
  return SEVERITY_CONFIGS[upper] || SEVERITY_CONFIGS.INFO;
}
