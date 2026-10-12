import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, RotateCcw, Loader2, ShieldAlert, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { verifyAuditChain, getDemoTampers, restoreAuditBlock, restoreInferenceRecord, resetLab } from "../../api/endpoints";
import { useAuth } from "../../hooks/useAuth";
import { useSystemStatus } from "../../hooks/useSystemStatus";

interface LedgerBannerProps {
  systemHealth?: string;
}

export const LedgerBanner: React.FC<LedgerBannerProps> = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isCompromised, invalidateStatus } = useSystemStatus();
  const isAdmin = user?.role === "admin";

  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Debounced verification query (staleTime 10s)
  const { data: verifyData } = useQuery({
    queryKey: ["auditVerifyGlobal"],
    queryFn: verifyAuditChain,
    enabled: isCompromised,
    staleTime: 10_000,
    refetchInterval: false,
  });

  const { data: tampers } = useQuery({
    queryKey: ["demoTampersGlobal"],
    queryFn: getDemoTampers,
    enabled: isCompromised && isAdmin,
    staleTime: 10_000,
  });

  const invalidateAll = useCallback(() => {
    invalidateStatus();
    queryClient.invalidateQueries({ queryKey: ["auditVerifyGlobal"] });
    queryClient.invalidateQueries({ queryKey: ["demoTampersGlobal"] });
    queryClient.invalidateQueries({ queryKey: ["auditBlocksPaged"] });
    queryClient.invalidateQueries({ queryKey: ["auditVerify"] });
    queryClient.invalidateQueries({ queryKey: ["demoTampers"] });
    queryClient.invalidateQueries({ queryKey: ["inferenceRecords"] });
    queryClient.invalidateQueries({ queryKey: ["inferenceVerify"] });
  }, [invalidateStatus, queryClient]);

  const handleRestore = async () => {
    try {
      setRestoring(true);
      setRestoreError(null);
      const currentTampers = tampers || (await getDemoTampers());

      if (currentTampers.audit_blocks) {
        for (const idx of currentTampers.audit_blocks) {
          await restoreAuditBlock(idx);
        }
      }
      if (currentTampers.inference_records) {
        for (const id of currentTampers.inference_records) {
          await restoreInferenceRecord(id);
        }
      }

      await verifyAuditChain();
      invalidateAll();
    } catch (e: any) {
      setRestoreError(e.message || "Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("This will wipe all demo data and reset the lab. Proceed?")) return;
    try {
      setRestoring(true);
      await resetLab();
      invalidateAll();
      navigate("/lab");
    } catch (e: any) {
      setRestoreError(e.message || "Reset failed");
    } finally {
      setRestoring(false);
    }
  };

  if (!isCompromised) return null;

  const brokenBlock = verifyData?.first_invalid_index;
  const hasDemoTampers =
    tampers &&
    ((tampers.audit_blocks && tampers.audit_blocks.length > 0) ||
      (tampers.inference_records && tampers.inference_records.length > 0));
      
  // Check if broken block is actually recorded in demo tampers
  const brokenIsDemoEdit =
    brokenBlock != null && tampers?.audit_blocks?.includes(brokenBlock);

  return (
    <div className="bg-rose-950/40 border-b border-rose-500/30 px-6 py-2.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="min-w-0 flex-1">
            <div className="text-xs sm:text-sm font-mono font-bold text-rose-300 flex items-center gap-2 flex-wrap">
              <span>
                ⚠ Audit ledger compromised{brokenBlock != null ? ` at block #${brokenBlock}` : ""}.
              </span>
              <span className="text-rose-200/80 font-normal">
                While it is, every new assessment is quarantined by design. Results produced now are not meaningful.
              </span>
            </div>

            {brokenBlock != null && !brokenIsDemoEdit && (
              <p className="text-xs text-amber-300 font-mono mt-1">
                These edits were not made by the demo tools and cannot be undone; reset the lab.
              </p>
            )}

            {!isAdmin && (
              <p className="text-xs text-slate-400 font-mono mt-0.5 italic">
                Ask an administrator to restore or reset the lab.
              </p>
            )}

            {restoreError && (
              <p className="text-xs text-rose-400 font-mono mt-1">{restoreError}</p>
            )}

            {showDetails && verifyData && (
              <div className="mt-2 p-2.5 rounded-lg bg-black/60 border border-white/10 text-[11px] font-mono text-slate-300 space-y-1">
                <div>First Invalid Block Index: #{verifyData.first_invalid_index ?? "Unknown"}</div>
                <div>Total Blocks Evaluated: {verifyData.length}</div>
                <div>Head Hash: {verifyData.head_hash || "—"}</div>
                {verifyData.blocks?.find((b) => b.index === brokenBlock)?.issues && (
                  <div className="text-rose-300">
                    Integrity Issues: {verifyData.blocks.find((b) => b.index === brokenBlock)?.issues.join(", ")}
                  </div>
                )}
                <div className="pt-1">
                  <button
                    onClick={() => navigate("/audit")}
                    className="text-cyan-300 hover:underline flex items-center gap-1"
                  >
                    <span>Open Audit Ledger</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 flex items-center gap-1 transition-colors"
          >
            <span>{showDetails ? "Hide details" : "Show details"}</span>
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {isAdmin && (
            <>
              {hasDemoTampers && (
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs text-emerald-300 font-mono font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  <span>Restore demo edits</span>
                </button>
              )}

              <button
                onClick={handleReset}
                disabled={restoring}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-white font-mono font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset lab</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
