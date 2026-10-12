import React, { useState } from "react";
import { Layers, ShieldCheck, ShieldAlert, AlertTriangle, ArrowDown, ChevronRight, Hash } from "lucide-react";
import { AuditBlock } from "../../types/api";
import { GlassPanel } from "../ui/GlassPanel";
import { HashText } from "../ui/HashText";
import { formatDateTime } from "../../lib/format";

interface BlockCardProps {
  block: AuditBlock;
  verificationStatus?: "VALID" | "TAMPERED" | "UNTRUSTED_DOWNSTREAM" | "UNVERIFIED";
  issues?: string[];
  isScanning?: boolean;
  isDemoTamper?: boolean;
  onSelectBlock?: (block: AuditBlock) => void;
}

export const BlockCard: React.FC<BlockCardProps> = ({
  block,
  verificationStatus = "UNVERIFIED",
  issues = [],
  isScanning = false,
  isDemoTamper = false,
  onSelectBlock,
}) => {
  const statusConfig = {
    UNVERIFIED: {
      border: "border-white/10",
      badge: "bg-white/5 text-slate-400 border-white/10",
      icon: Layers,
      label: "BLOCK",
    },
    VALID: {
      border: "border-emerald-500/40 bg-emerald-950/10 shadow-glow-accept",
      badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      icon: ShieldCheck,
      label: "VALID ✓",
    },
    TAMPERED: {
      border: "border-rose-500/70 bg-rose-950/20 shadow-glow-quarantine animate-pulse",
      badge: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      icon: ShieldAlert,
      label: "TAMPERED ⚠",
    },
    UNTRUSTED_DOWNSTREAM: {
      border: "border-amber-500/40 bg-amber-950/15 border-dashed",
      badge: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      icon: AlertTriangle,
      label: "UNTRUSTED DOWNSTREAM",
    },
  }[verificationStatus];

  const StatusIcon = statusConfig.icon;

  return (
    <div className="relative">
      <GlassPanel
        className={`p-4 border transition-all duration-300 cursor-pointer ${statusConfig.border} ${
          isScanning ? "border-cyan-400 bg-cyan-950/20 shadow-glow-cyan" : ""
        }`}
        onClick={() => onSelectBlock && onSelectBlock(block)}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-white">
              #{block.index}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
                  {block.event_type}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {block.subject}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 block">
                {formatDateTime(block.timestamp)}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 self-start sm:self-auto">
            {isDemoTamper && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-widest whitespace-nowrap">
                Demo Edit
              </span>
            )}
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold flex items-center gap-1 border ${statusConfig.badge}`}
              >
                <StatusIcon className="w-3.5 h-3.5" />
                <span>{statusConfig.label}</span>
              </span>

              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
          </div>
        </div>

        {/* Cryptographic hashes strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs font-mono">
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">Block Hash</span>
            <HashText hash={block.block_hash} head={8} tail={6} className="text-cyan-300 text-xs" />
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">Previous Hash</span>
            <HashText hash={block.previous_hash} head={8} tail={6} className="text-slate-400 text-xs" />
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block">
              Merkle Root ({block.leaf_count} leaves)
            </span>
            <HashText hash={block.merkle_root || "—"} head={8} tail={6} className="text-violet-300 text-xs" />
          </div>
        </div>

        {/* Issues list if tampered */}
        {issues.length > 0 && (
          <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-mono space-y-1">
            <div className="text-rose-400 font-bold uppercase text-[10px] tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Cryptographic Integrity Failures Detected:</span>
            </div>
            {issues.map((iss, i) => (
              <div key={i} className="text-rose-300 text-[11px] pl-4">
                • {iss}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

    </div>
  );
};
