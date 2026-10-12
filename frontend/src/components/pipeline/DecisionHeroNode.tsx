import React from "react";
import { CheckCircle2, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";
import { Decision } from "../../types/api";
import { getDecisionConfig } from "../../lib/decision";
import { motion } from "framer-motion";

interface DecisionHeroNodeProps {
  decision: Decision | null;
  isComplete: boolean;
  isFailed?: boolean;
}

export const DecisionHeroNode: React.FC<DecisionHeroNodeProps> = ({
  decision,
  isComplete,
  isFailed,
}) => {
  const config = getDecisionConfig(decision);

  if (isFailed) {
    return (
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-lg mx-auto p-6 rounded-2xl border-2 border-rose-500 bg-rose-950/30 text-center shadow-glow-quarantine"
      >
        <div className="flex items-center justify-center gap-3 text-rose-400 mb-2">
          <ShieldAlert className="w-10 h-10 animate-bounce" />
          <span className="font-mono text-4xl sm:text-5xl font-black tracking-widest uppercase">
            EXECUTION FAILED
          </span>
        </div>
        <p className="text-sm font-mono text-rose-300">Pipeline encountered a fatal assurance error.</p>
      </motion.div>
    );
  }

  if (!isComplete || !config) {
    return (
      <div className="max-w-lg mx-auto p-6 rounded-2xl border border-white/10 bg-black/40 text-center">
        <div className="flex items-center justify-center gap-3 text-slate-400 mb-1">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <span className="font-mono text-2xl sm:text-3xl font-bold tracking-widest text-slate-400 uppercase">
            EVALUATING INTEGRITY...
          </span>
        </div>
        <p className="text-xs font-mono text-slate-500">
          Awaiting engine convergence & Bayesian evidence synthesis
        </p>
      </div>
    );
  }

  const iconMap = {
    ACCEPT: CheckCircle2,
    REVIEW: AlertTriangle,
    QUARANTINE: ShieldAlert,
  };
  const Icon = iconMap[config.label];

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, rotateX: 90 }}
      animate={{ scale: 1, opacity: 1, rotateX: 0 }}
      transition={{ type: "spring", damping: 15, stiffness: 200 }}
      className={`max-w-xl mx-auto p-7 rounded-2xl border-2 text-center transition-all ${config.badgeBg} ${config.badgeBorder} ${config.glowClass}`}
    >
      <div className="flex items-center justify-center gap-4 mb-2">
        <Icon className={`w-12 h-12 sm:w-14 sm:h-14 shrink-0 ${config.badgeText}`} />
        <h2
          className={`font-mono text-4xl sm:text-5xl md:text-6xl font-black tracking-widest uppercase ${config.badgeText}`}
        >
          {config.label}
        </h2>
      </div>

      <p className="text-sm sm:text-base font-sans font-medium text-slate-200 mt-2 max-w-md mx-auto leading-relaxed">
        {config.description}
      </p>

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-center gap-4 text-xs font-mono text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.colorHex }} />
          ASSURANCE SEAL BINDING
        </span>
        <span>•</span>
        <span>DEFENCE GRADE JUDGEMENT</span>
      </div>
    </motion.div>
  );
};
