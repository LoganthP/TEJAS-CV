import React, { useState } from "react";
import { Finding } from "../../types/api";
import { GlassPanel } from "../ui/GlassPanel";
import { SeverityChip } from "./SeverityChip";
import { HashText } from "../ui/HashText";
import { EvidenceRenderer } from "./EvidenceRenderer";
import { ShieldCheck, ChevronDown, ChevronUp, AlertCircle, Sparkles } from "lucide-react";

interface FindingCardProps {
  finding: Finding;
  datasetId?: string | null;
  auditBlockIndex?: number | null;
  initiallyExpanded?: boolean;
}

export const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  datasetId,
  auditBlockIndex,
  initiallyExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return (
    <GlassPanel className="p-5 border-white/[0.08] hover:border-white/20 transition-all">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="space-y-1.5 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={finding.severity} size="sm" />
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300 uppercase">
              {finding.engine} engine
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {finding.finding_type}
            </span>
            {finding.job_label && (
              <span className="text-[10px] font-mono text-slate-400 bg-white/[0.02] px-1.5 py-0.5 rounded">
                Job: {finding.job_label}
              </span>
            )}
          </div>

          <h4 className="text-sm font-semibold text-slate-100 tracking-wide flex items-center gap-2">
            {finding.title}
          </h4>

          <p className="text-xs text-slate-300 leading-relaxed font-sans line-clamp-2">
            {finding.reason}
          </p>
        </div>

        <div className="flex items-center sm:flex-col sm:items-end gap-3 shrink-0">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-500 text-[10px]">SCORE</span>
            <span className="font-bold text-slate-200">{(finding.score || 0).toFixed(1)}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500 text-[10px]">CONF</span>
            <span className="font-bold text-cyan-400">
              {((finding.confidence || 0) * 100).toFixed(0)}%
            </span>
          </div>

          <button
            type="button"
            className="p-1 rounded text-slate-400 hover:text-white"
            aria-label="Toggle details"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Forensic Detail */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4">
          {/* Recommendation */}
          {finding.recommendation && (
            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-mono font-semibold text-cyan-300 uppercase tracking-wider block mb-0.5">
                  Assurance Recommendation
                </span>
                <span className="text-slate-300 font-sans leading-relaxed">
                  {finding.recommendation}
                </span>
              </div>
            </div>
          )}

          {/* Subject & Hash */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono bg-black/30 p-2.5 rounded-lg border border-white/5">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Subject Target</span>
              <span className="text-slate-300 truncate block">{finding.subject || "Pipeline target"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Finding Hash</span>
              <HashText hash={finding.finding_hash} head={10} tail={6} className="text-xs text-cyan-300" />
            </div>
          </div>

          {/* Evidence Details */}
          <div>
            <div className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Cryptographic / Statistical Evidence
            </div>
            <EvidenceRenderer evidence={finding.evidence} datasetId={datasetId} />
          </div>

          {/* Sealed Ledger Footer */}
          <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-violet-300">
              <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
              <span>
                {auditBlockIndex !== null && auditBlockIndex !== undefined
                  ? `Sealed in audit block #${auditBlockIndex}`
                  : "Sealed in immutable audit ledger"}
              </span>
            </div>
            <span className="text-slate-500">AUDIT TRAIL</span>
          </div>
        </div>
      )}
    </GlassPanel>
  );
};
