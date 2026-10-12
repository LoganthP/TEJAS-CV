import React from "react";
import { Link, Layers, FileCheck, ExternalLink, Download } from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";
import { motion } from "framer-motion";

interface AuditSealNodeProps {
  auditBlock: number | null;
  jobId: string;
  onDownloadReport?: () => void;
}

export const AuditSealNode: React.FC<AuditSealNodeProps> = ({
  auditBlock,
  jobId,
  onDownloadReport,
}) => {
  if (auditBlock === null || auditBlock === undefined) {
    return (
      <div className="max-w-md mx-auto p-3 rounded-xl border border-white/5 bg-white/[0.01] text-center text-xs font-mono text-slate-500">
        Audit block unsealed — awaiting decision finalization
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="max-w-md mx-auto"
    >
      <GlassPanel className="p-4 border-violet-500/40 bg-violet-950/20 shadow-glow-cyan text-center">
        <div className="flex items-center justify-center gap-2 text-violet-300 font-mono text-xs font-semibold uppercase tracking-wider mb-1.5">
          <Layers className="w-4 h-4 text-violet-400 animate-spin" />
          <span>Cryptographic Ledger Sealing</span>
        </div>

        <div className="text-xl font-mono font-bold text-white mb-2 flex items-center justify-center gap-2">
          <Link className="w-5 h-5 text-cyan-400 rotate-45" />
          <span>Audit Block #{auditBlock}</span>
        </div>

        <p className="text-xs text-slate-400 mb-3 font-sans">
          Decision and forensic evidence hash-chained and signed with Ed25519 platform key into the immutable ledger.
        </p>

        <div className="flex items-center justify-center gap-2">
          {onDownloadReport && (
            <button
              onClick={onDownloadReport}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Signed Report</span>
            </button>
          )}

          <a
            href="/audit"
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-mono flex items-center gap-1.5 transition-colors"
          >
            <span>Ledger Explorer</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </GlassPanel>
    </motion.div>
  );
};
