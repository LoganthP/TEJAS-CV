import React, { useState, useMemo, useEffect } from "react";
import { ShieldCheck, ShieldAlert, RefreshCw, AlertOctagon, Filter, ArrowDown, ArrowUp, ArrowUpDown, Layers, X } from "lucide-react";
import { AuditBlock, ChainVerification } from "../../types/api";
import { BlockCard } from "./BlockCard";
import { verifyAuditChain } from "../../api/endpoints";
import { GlassPanel } from "../ui/GlassPanel";

interface ChainVerifierProps {
  blocks: AuditBlock[];
  verificationData: ChainVerification | null | undefined;
  demoTampers: { audit_blocks: number[]; inference_records: string[] } | null | undefined;
  onRefresh?: () => void;
}

export const ChainVerifier: React.FC<ChainVerifierProps> = ({ blocks, verificationData, demoTampers, onRefresh }) => {
  const [verifying, setVerifying] = useState(false);
  const [scanIndex, setScanIndex] = useState<number | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<AuditBlock | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "OLDEST">("NEWEST");

  const handleVerifyChain = async () => {
    try {
      setVerifying(true);
      if (onRefresh) onRefresh();

      // Perform fast animated scan down the chain (~40ms per block)
      const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!isReducedMotion) {
        for (let i = 0; i < blocks.length; i++) {
          setScanIndex(blocks[i].index);
          await new Promise((r) => setTimeout(r, 40));
        }
      }
    } catch (err) {
      console.error("Verification animation failed", err);
    } finally {
      setVerifying(false);
      setScanIndex(null);
    }
  };

  // Map verification status to each block
  const blockStatusMap = new Map<
    number,
    { status: "VALID" | "TAMPERED" | "UNTRUSTED_DOWNSTREAM"; issues: string[] }
  >();

  if (verificationData?.blocks) {
    verificationData.blocks.forEach((b) => {
      blockStatusMap.set(b.index, { status: b.status, issues: b.issues || [] });
    });
  }

  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    blocks.forEach(b => types.add(b.event_type));
    return Array.from(types);
  }, [blocks]);

  const filteredBlocks = useMemo(() => {
    let result = [...blocks];
    
    if (filterType !== "ALL") {
      result = result.filter(b => b.event_type === filterType);
    }
    
    if (filterStatus !== "ALL") {
      result = result.filter(b => {
        const s = blockStatusMap.get(b.index)?.status || "UNVERIFIED";
        if (filterStatus === "BROKEN") return s === "TAMPERED";
        if (filterStatus === "DOWNSTREAM") return s === "UNTRUSTED_DOWNSTREAM";
        if (filterStatus === "VALID") return s === "VALID";
        return true;
      });
    }

    if (sortOrder === "NEWEST") {
      result.sort((a, b) => b.index - a.index);
    } else {
      result.sort((a, b) => a.index - b.index);
    }

    return result;
  }, [blocks, blockStatusMap, filterType, filterStatus, sortOrder]);

  return (
    <div className="space-y-4">
      {/* Verification Action Header */}
      <GlassPanel className="p-4 border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select 
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-black/60 border border-white/10 rounded px-2 py-1 text-xs font-mono text-slate-200 outline-none"
            >
              <option value="ALL">All Status</option>
              <option value="VALID">Valid</option>
              <option value="BROKEN">Broken</option>
              <option value="DOWNSTREAM">Downstream</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <select 
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-black/60 border border-white/10 rounded px-2 py-1 text-xs font-mono text-slate-200 outline-none max-w-[150px]"
            >
              <option value="ALL">All Types</option>
              {eventTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortOrder(o => o === "NEWEST" ? "OLDEST" : "NEWEST")}
              className="flex items-center gap-1.5 px-2 py-1 bg-black/60 border border-white/10 rounded text-xs font-mono text-slate-300 hover:text-white"
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortOrder === "NEWEST" ? "Newest First" : "Oldest First"}
            </button>
          </div>
        </div>

        <button
          onClick={handleVerifyChain}
          disabled={verifying}
          className="px-5 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-glass-edge hover:shadow-glow-cyan disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${verifying ? "animate-spin" : ""}`} />
          <span>{verifying ? "VERIFYING IMMUTABLE CHAIN..." : "VERIFY ENTIRE CHAIN"}</span>
        </button>
      </GlassPanel>

      {/* Vertical Chain of Block Cards */}
      <div className="max-w-3xl mx-auto space-y-1">
        {filteredBlocks.map((block, idx) => {
          const v = blockStatusMap.get(block.index);
          const isScanningThis = scanIndex === block.index;
          const isDemoTamper = demoTampers?.audit_blocks?.includes(block.index);
          
          // Determine if we should show downward connector
          // We show it if it's not the last item in the list, and we are not heavily filtering (which breaks logical chain visual)
          const showConnector = idx < filteredBlocks.length - 1 && filterStatus === "ALL" && filterType === "ALL";

          return (
            <div key={block.index} id={`block-${block.index}`} className="scroll-mt-24 transition-all duration-300">
              <BlockCard
                block={block}
                verificationStatus={v ? v.status : "UNVERIFIED"}
                issues={v ? v.issues : []}
                isScanning={isScanningThis}
                isDemoTamper={!!isDemoTamper}
                onSelectBlock={setSelectedBlock}
              />
              
              {showConnector && (
                <div className="w-0.5 h-6 mx-auto my-1 flex items-center justify-center overflow-hidden">
                  <div className={`w-0.5 h-full ${
                    v?.status === "VALID" 
                      ? "bg-emerald-500/50" 
                      : v?.status === "TAMPERED" 
                        ? "border-l-2 border-dashed border-rose-500/50 bg-transparent w-0" 
                        : "border-l-2 border-dashed border-amber-500/50 bg-transparent w-0"
                  }`} />
                </div>
              )}
            </div>
          );
        })}
        {filteredBlocks.length === 0 && (
          <div className="py-12 text-center text-slate-400 font-mono text-sm">
            No blocks match the current filters.
          </div>
        )}
      </div>

      {/* Block Detail Drawer / Modal */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <GlassPanel className="max-w-2xl w-full p-6 border-cyan-500/30 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  Audit Block #{selectedBlock.index} Detail
                </h3>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2 bg-black/30 p-2.5 rounded-lg border border-white/5">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Event Type</span>
                  <span className="text-slate-200">{selectedBlock.event_type}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Subject</span>
                  <span className="text-cyan-300">{selectedBlock.subject}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Timestamp</span>
                  <span className="text-slate-300">{selectedBlock.timestamp}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Leaf Count</span>
                  <span className="text-slate-200">{selectedBlock.leaf_count}</span>
                </div>
              </div>

              {/* Actor Person Chip if present */}
              {(selectedBlock.payload?.actor || selectedBlock.payload?.created_by || selectedBlock.payload?.username) && (
                <div className="flex items-center gap-2 p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-slate-500 text-[10px] uppercase">Sealed By Actor:</span>
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>{String(selectedBlock.payload?.actor || selectedBlock.payload?.created_by || selectedBlock.payload?.username)}</span>
                  </div>
                </div>
              )}

              <div>
                <span className="text-slate-400 block mb-1">Block Hash:</span>
                <div className="p-2 rounded bg-black/50 text-[11px] text-cyan-300 break-all border border-white/5 select-all font-mono">
                  {selectedBlock.block_hash}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Previous Hash:</span>
                <div className="p-2 rounded bg-black/50 text-[11px] text-slate-300 break-all border border-white/5 select-all font-mono">
                  {selectedBlock.previous_hash}
                </div>
              </div>
              
              <div>
                <span className="text-slate-400 block mb-1">Merkle Root:</span>
                <div className="p-2 rounded bg-black/50 text-[11px] text-violet-300 break-all border border-white/5 select-all font-mono">
                  {selectedBlock.merkle_root || "—"}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Ed25519 Hex Signature:</span>
                <div className="p-2 rounded bg-black/50 text-[11px] text-violet-300 break-all border border-white/5 select-all font-mono">
                  {selectedBlock.signature}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Block Payload (Sealed Body):</span>
                <pre className="p-3 rounded-lg bg-black/70 text-[11px] text-slate-200 border border-white/5 overflow-x-auto">
                  {(() => {
                    const jsonStr = JSON.stringify(selectedBlock.payload, null, 2);
                    if (jsonStr.includes("tampered_note")) {
                      return (
                        <span dangerouslySetInnerHTML={{
                          __html: jsonStr.replace(/"tampered_note"/g, '<span class="text-rose-400 font-bold">"tampered_note"</span>')
                        }} />
                      );
                    }
                    return jsonStr;
                  })()}
                </pre>
              </div>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
};
