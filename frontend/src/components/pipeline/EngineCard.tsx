import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Clock,
  MinusCircle,
  HelpCircle,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { Check, EngineName, Severity } from "../../types/api";
import { GlassPanel } from "../ui/GlassPanel";
import { formatDuration } from "../../lib/format";
import { motion, AnimatePresence } from "framer-motion";

interface EngineCardProps {
  engine: EngineName;
  name: string;
  icon: React.ElementType;
  progress: number;
  message: string;
  completed: boolean;
  score?: number | null;
  duration_s?: number;
  error?: string | null;
  findings: { type: string; severity: Severity; title: string; confidence: number }[];
  checks: Check[];
  onViewEvidence?: () => void;
}

export const EngineCard: React.FC<EngineCardProps> = ({
  engine,
  name,
  icon: Icon,
  progress,
  message,
  completed,
  score,
  duration_s,
  error,
  findings,
  checks,
  onViewEvidence,
}) => {
  // Determine card health status from worst finding severity:
  // INFO/LOW -> PASSED (green)
  // MEDIUM -> WARNING (amber)
  // HIGH/CRITICAL -> ANOMALY (red)
  let status: "running" | "ok" | "warning" | "danger" = "running";
  let anomalyFindingTitle: string | null = null;
  let warningFindingTitle: string | null = null;

  if (completed) {
    if (error) {
      status = "danger";
      anomalyFindingTitle = `Engine error: ${error}`;
    } else {
      const critOrHigh = findings.find(
        (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
      );
      const medium = findings.find((f) => f.severity === "MEDIUM");

      if (critOrHigh) {
        status = "danger";
        anomalyFindingTitle = critOrHigh.title || `Finding: ${critOrHigh.type}`;
      } else if (medium) {
        status = "warning";
        warningFindingTitle = medium.title || `Finding: ${medium.type}`;
      } else {
        status = "ok";
      }
    }
  }

  const borderStyles = {
    running: "border-cyan-500/30 hover:border-cyan-500/50",
    ok: "border-emerald-500/40 hover:border-emerald-500/60 bg-emerald-950/10",
    warning: "border-amber-500/40 hover:border-amber-500/60 bg-amber-950/10",
    danger: "border-rose-500/50 hover:border-rose-500/70 bg-rose-950/15 shadow-glow-quarantine",
  };

  const statusBadge = {
    running: { label: "ANALYSING", icon: Loader2, class: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
    ok: { label: "PASSED", icon: CheckCircle2, class: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    warning: { label: "WARNING", icon: AlertTriangle, class: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
    danger: { label: "ANOMALY", icon: ShieldAlert, class: "text-rose-400 bg-rose-500/15 border-rose-500/30 animate-pulse" },
  }[status];

  const StatusIcon = statusBadge.icon;
  const pillTooltip = status === "danger" && anomalyFindingTitle
    ? `ANOMALY: ${anomalyFindingTitle}`
    : status === "warning" && warningFindingTitle
    ? `WARNING: ${warningFindingTitle}`
    : statusBadge.label;

  const renderCheckIcon = (checkStatus: Check["status"]) => {
    switch (checkStatus) {
      case "PASSED":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "FLAGGED":
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case "SKIPPED":
        return <MinusCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
      case "UNAVAILABLE":
        return <HelpCircle className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />;
      case "ERROR":
        return <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      default:
        return <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
    }
  };

  return (
    <GlassPanel
      onClick={onViewEvidence}
      className={`p-4 flex flex-col justify-between transition-all duration-300 h-full cursor-pointer group ${borderStyles[status]}`}
      title={status === "danger" && anomalyFindingTitle ? `Click to view evidence: ${anomalyFindingTitle}` : "Click to view engine findings"}
    >
      {/* Header */}
      <div>
        {/* Responsive header: grid auto 1fr auto, below 260px wraps pill under title */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1 basis-40">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 shrink-0 group-hover:border-cyan-400/40 transition-colors">
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3
                className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100 truncate block leading-tight"
                title={name}
              >
                {name}
              </h3>
              <span className="text-[10px] font-mono text-slate-400 block truncate mt-0.5">
                {engine.toUpperCase()} ASSURANCE
              </span>
            </div>
          </div>

          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border whitespace-nowrap shrink-0 ${statusBadge.class}`}
            title={pillTooltip}
          >
            <StatusIcon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
            <span>{statusBadge.label}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1 mb-3">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">Progress</span>
            <span className="text-cyan-300 font-bold">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden border border-white/5">
            <motion.div
              className={`h-full rounded-full ${
                status === "danger"
                  ? "bg-rose-500"
                  : status === "warning"
                  ? "bg-amber-400"
                  : "bg-gradient-to-r from-cyan-500 to-emerald-400"
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Live Message */}
        <div className="p-2 rounded-lg bg-black/40 border border-white/5 min-h-[42px] mb-3 flex items-center">
          <p className="text-[11px] font-mono text-slate-300 leading-snug line-clamp-2">
            {message || "Engine running..."}
          </p>
        </div>

        {/* Score & Duration */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-3 bg-white/[0.02] p-2 rounded-lg border border-white/5">
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">Engine Score</span>
            <span className="text-slate-200 font-bold">
              {score !== null && score !== undefined ? score.toFixed(1) : "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">Duration</span>
            <span className="text-slate-300 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-500" />
              {formatDuration(duration_s)}
            </span>
          </div>
        </div>

        {/* Checks List */}
        {checks && checks.length > 0 && (
          <div className="space-y-1.5 mb-3 border-t border-white/5 pt-2">
            <div className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Security Checks</span>
              <span className="text-slate-500">{checks.length} verified</span>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {checks.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-[10px] font-mono p-1 rounded bg-black/20 hover:bg-black/40 transition-colors"
                  title={c.detail}
                >
                  <div className="flex items-center gap-1.5 truncate mr-2">
                    {renderCheckIcon(c.status)}
                    <span className="truncate text-slate-300">{c.name}</span>
                  </div>
                  <span
                    className={`text-[9px] font-semibold ${
                      c.status === "PASSED"
                        ? "text-emerald-400"
                        : c.status === "FLAGGED"
                        ? "text-rose-400"
                        : "text-slate-500"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Slide-in findings list */}
      <AnimatePresence>
        {findings && findings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-2 border-t border-white/10"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider">
                Findings ({findings.length})
              </span>
              <span className="text-[10px] font-mono text-cyan-300 group-hover:text-cyan-200 flex items-center gap-0.5">
                <span>View Evidence</span>
                <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>

            <div className="space-y-1 max-h-20 overflow-y-auto">
              {findings.map((f, i) => (
                <div
                  key={i}
                  className="text-[10px] font-mono p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 truncate"
                  title={f.title}
                >
                  [{f.severity}] {f.title}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassPanel>
  );
};
