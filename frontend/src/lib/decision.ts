import { Decision } from "../types/api";

export interface DecisionConfig {
  label: Decision;
  colorHex: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  glowClass: string;
  description: string;
}

export const DECISION_CONFIGS: Record<Decision, DecisionConfig> = {
  ACCEPT: {
    label: "ACCEPT",
    colorHex: "#34d399",
    badgeBg: "bg-emerald-500/10",
    badgeBorder: "border-emerald-500/30",
    badgeText: "text-emerald-400",
    glowClass: "shadow-glow-accept",
    description: "Model & data integrity verified. Safe for operational deployment.",
  },
  REVIEW: {
    label: "REVIEW",
    colorHex: "#fbbf24",
    badgeBg: "bg-amber-500/10",
    badgeBorder: "border-amber-500/30",
    badgeText: "text-amber-400",
    glowClass: "shadow-glow-review",
    description: "Anomalies or environmental shift detected. Human review required.",
  },
  QUARANTINE: {
    label: "QUARANTINE",
    colorHex: "#f43f5e",
    badgeBg: "bg-rose-500/15",
    badgeBorder: "border-rose-500/30",
    badgeText: "text-rose-400",
    glowClass: "shadow-glow-quarantine",
    description: "Critical integrity breach or attack indicators detected. Isolate asset immediately.",
  },
};

export function getDecisionConfig(decision: Decision | string | null | undefined): DecisionConfig | null {
  if (!decision) return null;
  return DECISION_CONFIGS[decision as Decision] || null;
}
