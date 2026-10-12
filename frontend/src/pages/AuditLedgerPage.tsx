import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAuditBlocks,
  verifyIndependent,
  getDemoTampers,
  restoreAuditBlock,
  restoreInferenceRecord,
  tamperAuditBlock,
  resetLab,
  verifyAuditChain,
  verifyInferenceChain,
} from "../api/endpoints";
import { ChainVerifier } from "../components/ledger/ChainVerifier";
import {
  Layers,
  Loader2,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { GlassPanel } from "../components/ui/GlassPanel";
import { useGlobalEventsContext } from "../components/EventsProvider";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";

const PAGE_SIZE = 50;

const AuditLedgerContent: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { latestEvent } = useGlobalEventsContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [verifyingIndependent, setVerifyingIndependent] = useState(false);
  const [indepOutput, setIndepOutput] = useState<{ exit_code: number; ok: boolean; lines: string[] } | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [indepError, setIndepError] = useState<string | null>(null);
  const [indepElapsed, setIndepElapsed] = useState(0);

  const [demoToolsOpen, setDemoToolsOpen] = useState(false);
  const [tamperIndex, setTamperIndex] = useState<number>(1);
  const [actionLoading, setActionLoading] = useState(false);

  // Pagination
  const [currentOffset, setCurrentOffset] = useState(0);
  const [allBlocks, setAllBlocks] = useState<any[]>([]);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounce event-based verification to at most once every 10s
  const lastVerifyEventRef = useRef(0);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["auditBlocksPaged"] });
    queryClient.invalidateQueries({ queryKey: ["auditVerify"] });
    queryClient.invalidateQueries({ queryKey: ["auditVerifyGlobal"] });
    queryClient.invalidateQueries({ queryKey: ["inferenceVerify"] });
    queryClient.invalidateQueries({ queryKey: ["demoTampers"] });
    queryClient.invalidateQueries({ queryKey: ["systemStatus"] });
  }, [queryClient]);

  useEffect(() => {
    if (!latestEvent) return;
    const now = Date.now();
    if (now - lastVerifyEventRef.current > 10_000) {
      lastVerifyEventRef.current = now;
      invalidateAll();
    }
  }, [latestEvent, invalidateAll]);

  // Initial page load - fetch first 50 blocks
  const {
    data: initialData,
    isLoading: blocksLoading,
    error: blocksError,
    refetch: refetchBlocks,
  } = useQuery({
    queryKey: ["auditBlocksPaged", 0],
    queryFn: () => getAuditBlocks(0, PAGE_SIZE),
    staleTime: 10_000,
    retry: 2,
  });

  useEffect(() => {
    if (initialData) {
      setAllBlocks(initialData.items || []);
      setTotalBlocks(initialData.total || 0);
      setCurrentOffset(initialData.items?.length || 0);
    }
  }, [initialData]);

  const loadMore = async () => {
    if (loadingMore || currentOffset >= totalBlocks) return;
    try {
      setLoadingMore(true);
      const data = await getAuditBlocks(currentOffset, PAGE_SIZE);
      setAllBlocks((prev) => [...prev, ...(data.items || [])]);
      setCurrentOffset((prev) => prev + (data.items?.length || 0));
    } catch (e) {
      console.error("Failed to load more blocks", e);
    } finally {
      setLoadingMore(false);
    }
  };

  const { data: verifyData } = useQuery({
    queryKey: ["auditVerify"],
    queryFn: () => verifyAuditChain(),
    staleTime: 10_000,
  });

  const { data: tampers } = useQuery({
    queryKey: ["demoTampers"],
    queryFn: getDemoTampers,
    staleTime: 10_000,
    enabled: isAdmin,
  });

  const { data: inferenceVerify } = useQuery({
    queryKey: ["inferenceVerify"],
    queryFn: verifyInferenceChain,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (allBlocks.length > 0 && tamperIndex === 1) {
      const decisionBlocks = allBlocks.filter((b) => b.event_type === "ASSURANCE_DECISION");
      if (decisionBlocks.length > 0) {
        setTamperIndex(decisionBlocks[0].index);
      } else {
        setTamperIndex(allBlocks[allBlocks.length - 1].index);
      }
    }
  }, [allBlocks, tamperIndex]);

  const handleIndependentVerify = async () => {
    try {
      setVerifyingIndependent(true);
      setIndepOutput(null);
      setIndepError(null);
      setIndepElapsed(0);

      const startTime = Date.now();
      const timer = setInterval(() => {
        setIndepElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        const res = await verifyIndependent();
        setIndepOutput(res);
      } catch (e: any) {
        if (e.status === 504 || e.message?.includes("timed out") || e.message?.includes("504")) {
          setIndepError(
            "Independent verification timed out. With many benchmark datasets, re-hashing all stored files can take 30–90 seconds. Please retry."
          );
        } else {
          setIndepError(e.message || "Independent verification failed");
        }
      } finally {
        clearInterval(timer);
        setIndepElapsed(Math.floor((Date.now() - startTime) / 1000));
      }
    } finally {
      setVerifyingIndependent(false);
    }
  };

  const handleRestoreDemoEdit = async (index: number) => {
    try {
      setActionLoading(true);
      await restoreAuditBlock(index);
      invalidateAll();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreAllDemoEdits = async () => {
    try {
      setActionLoading(true);
      if (tampers?.audit_blocks) {
        for (const index of tampers.audit_blocks) {
          await restoreAuditBlock(index);
        }
      }
      if (tampers?.inference_records) {
        for (const recordId of tampers.inference_records) {
          await restoreInferenceRecord(recordId);
        }
      }
      invalidateAll();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreInference = async (id: string) => {
    try {
      setActionLoading(true);
      await restoreInferenceRecord(id);
      invalidateAll();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTamperBlock = async () => {
    if (tamperIndex === 0) {
      alert("Genesis block #0 should not be tampered via default UI demo. Please choose another.");
      return;
    }
    if (
      confirm(
        `This will tamper block #${tamperIndex} directly in the database to simulate insider alteration. All downstream blocks will become UNTRUSTED. Proceed?`
      )
    ) {
      try {
        setActionLoading(true);
        await tamperAuditBlock(tamperIndex);
        invalidateAll();
      } catch (e) {
        console.error(e);
      } finally {
        setActionLoading(false);
      }
    }
  };

  const handleResetLab = async () => {
    if (confirm("This will wipe all demo data and reset the lab to its initial state. Proceed?")) {
      try {
        setActionLoading(true);
        await resetLab();
        invalidateAll();
        navigate("/lab");
      } catch (e) {
        console.error(e);
      } finally {
        setActionLoading(false);
      }
    }
  };

  const renderIndependentLines = (lines: string[]) => {
    return lines.map((line, i) => {
      const isOk = line.startsWith("[OK]");
      const isFail = line.startsWith("[!!]");
      const isHeader = line.startsWith("---");

      if (isHeader) return <div key={i} className="text-slate-500 font-bold mt-2">{line}</div>;

      if (isOk || isFail) {
        return (
          <div key={i} className="flex items-start gap-2 py-0.5">
            {isOk ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <span className={isOk ? "text-emerald-300" : "text-rose-300 font-bold"}>
              {line.substring(4)}
            </span>
          </div>
        );
      }

      return (
        <div key={i} className="pl-6 text-slate-400 text-xs">
          {line}
        </div>
      );
    });
  };

  const isLedgerIntact = verifyData?.valid;

  // Error state
  if (blocksError) {
    return (
      <div className="py-16 max-w-md mx-auto text-center space-y-4">
        <AlertOctagon className="w-12 h-12 text-rose-400 mx-auto" />
        <h2 className="text-lg font-mono font-bold text-white">Failed to load audit ledger</h2>
        <p className="text-sm font-mono text-slate-400">
          {(blocksError as any)?.message || "Failed to communicate with assurance core"}
        </p>
        <button
          onClick={() => refetchBlocks()}
          className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Verdict Banner */}
      {verifyData && (
        <div
          className={`p-4 rounded-xl border text-sm font-mono flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            isLedgerIntact
              ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300 shadow-glow-accept"
              : "bg-rose-950/30 border-rose-500/60 text-rose-300 shadow-glow-quarantine"
          }`}
        >
          <div className="flex items-center gap-3">
            {isLedgerIntact ? (
              <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
            ) : (
              <AlertOctagon className="w-8 h-8 text-rose-400 shrink-0 animate-pulse" />
            )}
            <div>
              <div className="font-black tracking-wider uppercase text-lg">
                {isLedgerIntact
                  ? `Ledger intact: ${verifyData.length} blocks, all hashes, links and signatures valid`
                  : `Ledger compromised at block #${verifyData.first_invalid_index}`}
              </div>
              {!isLedgerIntact && verifyData.first_invalid_index != null && (
                <div className="text-xs text-rose-200/80 font-sans mt-1 max-w-2xl">
                  {(() => {
                    const badBlock = verifyData.blocks.find(
                      (b) => b.index === verifyData.first_invalid_index
                    );
                    const issueCode = badBlock?.issues[0] || "payload altered";
                    let plainIssue = issueCode;
                    if (issueCode.includes("payload altered"))
                      plainIssue = "the recorded content was changed";
                    if (issueCode.includes("header altered"))
                      plainIssue = "the block's metadata was changed";
                    if (issueCode.includes("chain link broken"))
                      plainIssue = "a block was removed or reordered";
                    if (issueCode.includes("bad signature"))
                      plainIssue = "not signed by the platform key";

                    return `(${badBlock?.event_type || "BLOCK"}): ${plainIssue}. Blocks #${
                      verifyData.first_invalid_index + 1
                    }…#${verifyData.length} can no longer be trusted.`;
                  })()}
                </div>
              )}
              {isLedgerIntact && (
                <div className="text-xs text-emerald-500/80 mt-1">
                  Head hash: {verifyData.head_hash} | Verified: {verifyData.verified_at}
                </div>
              )}
            </div>
          </div>

          {!isLedgerIntact && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  const el = document.getElementById(`block-${verifyData.first_invalid_index}`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("ring-2", "ring-rose-500", "ring-offset-2", "ring-offset-black");
                    setTimeout(
                      () =>
                        el.classList.remove(
                          "ring-2",
                          "ring-rose-500",
                          "ring-offset-2",
                          "ring-offset-black"
                        ),
                      2000
                    );
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs text-rose-300 font-bold transition-colors"
              >
                Jump to block #{verifyData.first_invalid_index}
              </button>

              {isAdmin &&
                verifyData.first_invalid_index != null &&
                tampers?.audit_blocks?.includes(verifyData.first_invalid_index) && (
                  <button
                    onClick={() => handleRestoreDemoEdit(verifyData.first_invalid_index!)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs text-emerald-300 font-bold transition-colors disabled:opacity-50"
                  >
                    Restore demo edit
                  </button>
                )}

              {isAdmin && (
                <button
                  onClick={handleResetLab}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-white font-bold transition-colors disabled:opacity-50"
                >
                  Reset lab
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Demo Controls Accordion — in normal flow under banner, collapsed by default, admin only */}
      {isAdmin && (
        <GlassPanel className="border-amber-500/30 overflow-hidden">
          <button
            className="w-full p-3.5 flex items-center justify-between bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
            onClick={() => setDemoToolsOpen(!demoToolsOpen)}
          >
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-500" />
              <span className="font-mono text-xs font-bold text-amber-400 uppercase tracking-wider">
                Demo Tools (Simulated Insider Alteration)
              </span>
            </div>
            {demoToolsOpen ? (
              <ChevronUp className="w-4 h-4 text-amber-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-amber-500" />
            )}
          </button>

          {demoToolsOpen && (
            <div className="p-4 border-t border-amber-500/20 space-y-4 bg-black/40">
              <div>
                <label className="text-[10px] uppercase font-mono text-slate-400 mb-1 block">
                  Select a block to tamper:
                </label>
                <div className="flex gap-2">
                  <select
                    value={tamperIndex}
                    onChange={(e) => setTamperIndex(Number(e.target.value))}
                    className="flex-1 bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500/50"
                  >
                    {allBlocks.map((b) => (
                      <option key={b.index} value={b.index}>
                        #{b.index} - {b.event_type}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleTamperBlock}
                    disabled={actionLoading}
                    className="px-4 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold rounded transition-colors disabled:opacity-50"
                  >
                    Tamper Block
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2">
                <button
                  onClick={handleRestoreAllDemoEdits}
                  disabled={
                    actionLoading ||
                    (!tampers?.audit_blocks?.length && !tampers?.inference_records?.length)
                  }
                  className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold rounded transition-colors disabled:opacity-50"
                >
                  Restore all demo edits
                </button>
                <button
                  onClick={handleResetLab}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-mono font-bold rounded transition-colors disabled:opacity-50"
                >
                  Reset lab completely
                </button>
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
            CRYPTOGRAPHIC IMMUTABLE STORE
          </span>
          <span className="text-xs font-mono text-slate-500">
            ED25519 HASH-CHAIN INTEGRITY
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight flex items-center gap-2.5">
            <Layers className="w-7 h-7 text-violet-400" />
            <span>Assurance Audit Ledger</span>
          </h1>
          <button
            onClick={handleIndependentVerify}
            disabled={verifyingIndependent}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-mono flex items-center gap-2 transition-all shadow-glass-edge disabled:opacity-50 self-start sm:self-auto"
          >
            {verifyingIndependent ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Running independent verifier (re-hashing all stored files) ({indepElapsed}s)…</span>
              </>
            ) : (
              <>
                <Terminal className="w-4 h-4" />
                <span>Independent Verification</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Main Ledger List with Skeleton Loader */}
          {blocksLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse p-4 space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5" />
                    <div className="h-4 w-40 bg-white/5 rounded" />
                  </div>
                  <div className="h-8 w-full bg-white/5 rounded" />
                </div>
              ))}
            </div>
          ) : allBlocks.length > 0 ? (
            <>
              <ChainVerifier
                blocks={allBlocks}
                verificationData={verifyData}
                demoTampers={tampers}
                onRefresh={invalidateAll}
              />
              {currentOffset < totalBlocks && (
                <div className="text-center pt-2">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 transition-colors disabled:opacity-50 shadow-glass-edge"
                  >
                    {loadingMore ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span>Loading next 50 blocks…</span>
                      </span>
                    ) : (
                      `Load more (${currentOffset} of ${totalBlocks} blocks)`
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={Layers}
              title="Audit Ledger Empty"
              description="The genesis block has not yet been sealed. Run a job or initialize the attack lab."
            />
          )}
        </div>

        <div className="space-y-6">
          {/* Independent Verification Panel */}
          {(indepOutput || indepError || verifyingIndependent) && (
            <GlassPanel className="p-4 border-slate-700 bg-slate-900/90 overflow-hidden space-y-3">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                  Independent Verifier
                </h3>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                A standalone script importing no TEJAS-CV code. It re-hashes every stored file and checks digital signatures against the public key only.
              </p>

              {verifyingIndependent ? (
                <div className="flex flex-col items-center gap-2 text-xs font-mono text-cyan-400 py-6">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="font-bold">Re-hashing all stored files…</span>
                  <span className="text-slate-400 text-[11px] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{indepElapsed}s elapsed</span>
                  </span>
                </div>
              ) : indepError ? (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-mono text-rose-300 leading-relaxed">
                  {indepError}
                </div>
              ) : indepOutput ? (
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-slate-400">STATUS ({indepElapsed}s):</span>
                    <span
                      className={`px-3 py-0.5 rounded font-bold ${
                        indepOutput.ok
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {indepOutput.ok ? "PASS" : "FAIL"}
                    </span>
                  </div>

                  <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                    {renderIndependentLines(indepOutput.lines)}
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <button
                      onClick={() => setShowRawOutput(!showRawOutput)}
                      className="text-[10px] text-slate-500 hover:text-slate-300 font-mono"
                    >
                      {showRawOutput ? "Hide raw output" : "Show raw output"}
                    </button>
                    {showRawOutput && (
                      <pre className="mt-2 p-2 bg-black/50 rounded border border-white/5 text-[9px] text-emerald-500/80 whitespace-pre-wrap overflow-x-auto">
                        {indepOutput.lines.join("\n")}
                      </pre>
                    )}
                  </div>
                </div>
              ) : null}
            </GlassPanel>
          )}

          {/* Inference chain section */}
          {inferenceVerify && (
            <GlassPanel
              className={`p-4 border-l-4 ${
                inferenceVerify.valid
                  ? "border-l-emerald-500 border-white/5"
                  : "border-l-rose-500 border-rose-500/30"
              }`}
            >
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider mb-1">
                Inference Chain Verification
              </h3>
              <p className="text-xs text-slate-300 mb-3">
                {inferenceVerify.records.length} records evaluated,{" "}
                {inferenceVerify.records.filter((r) => r.status !== "VALID").length} failing.
              </p>

              {!inferenceVerify.valid && (
                <div className="space-y-3">
                  <p className="text-[10px] text-rose-300/80 bg-rose-500/10 p-2 rounded-lg">
                    Inference records{" "}
                    {inferenceVerify.records
                      .filter((r) => r.status !== "VALID")
                      .map((r) => `#${r.seq}`)
                      .join(" and ")}{" "}
                    were edited on purpose by the demo attack scenarios.
                  </p>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {inferenceVerify.records
                      .filter((r) => r.status !== "VALID")
                      .map((r) => (
                        <div
                          key={r.id}
                          className="p-2 bg-black/40 border border-white/5 rounded-lg text-xs font-mono"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-rose-400 font-bold">Record #{r.seq}</span>
                            {isAdmin && tampers?.inference_records?.includes(r.id) && (
                              <button
                                onClick={() => handleRestoreInference(r.id)}
                                disabled={actionLoading}
                                className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/30 transition-colors font-bold text-[10px]"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {r.issues.join(", ")}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
};

export const AuditLedgerPage: React.FC = () => {
  return (
    <ErrorBoundary fallbackTitle="Audit Ledger Panel Error">
      <AuditLedgerContent />
    </ErrorBoundary>
  );
};
