import React from "react";
import { AlertTriangle, ShieldAlert, RotateCcw, Play, X, Loader2 } from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";

interface LedgerGuardDialogProps {
  isOpen: boolean;
  onRestore: () => Promise<void>;
  onRunAnyway: () => void;
  onCancel: () => void;
  restoring?: boolean;
  targetActionLabel?: string;
}

export const LedgerGuardDialog: React.FC<LedgerGuardDialogProps> = ({
  isOpen,
  onRestore,
  onRunAnyway,
  onCancel,
  restoring = false,
  targetActionLabel = "execution",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <GlassPanel className="max-w-md w-full p-6 border-rose-500/40 bg-slate-900/95 shadow-2xl space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                Ledger Compromised
              </h3>
              <span className="text-[10px] font-mono text-rose-300">
                Guaranteed Quarantine Warning
              </span>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={restoring}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs font-mono text-slate-300 leading-relaxed bg-black/40 p-3 rounded-lg border border-white/5">
          The audit ledger is currently compromised. By design, the provenance assurance engine will raise an{" "}
          <strong className="text-rose-400">AUDIT_LEDGER_COMPROMISED</strong> critical finding, causing this{" "}
          {targetActionLabel} to produce a <strong className="text-rose-400">QUARANTINE</strong> verdict regardless of the data.
          <br /><br />
          Restore or reset the ledger first for meaningful results?
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onCancel}
            disabled={restoring}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-300 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onRestore}
            disabled={restoring}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-mono font-bold text-emerald-300 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            <span>Restore</span>
          </button>

          <button
            type="button"
            onClick={onRunAnyway}
            disabled={restoring}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-mono font-bold text-rose-300 transition-colors flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run anyway</span>
          </button>
        </div>
      </GlassPanel>
    </div>
  );
};
