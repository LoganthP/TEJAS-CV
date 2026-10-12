import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { truncateHash, copyToClipboard } from "../../lib/format";

interface HashTextProps {
  hash: string | null | undefined;
  head?: number;
  tail?: number;
  className?: string;
  showCopy?: boolean;
}

export const HashText: React.FC<HashTextProps> = ({
  hash,
  head = 6,
  tail = 4,
  className = "",
  showCopy = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  if (!hash) return <span className="font-mono text-slate-500">—</span>;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(hash);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const truncated = truncateHash(hash, head, tail);

  return (
    <div
      className="relative inline-flex items-center gap-1.5 group"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={`font-mono tracking-tight text-slate-300 select-all cursor-text ${className}`}>
        {truncated}
      </span>

      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors"
          title="Copy full hash"
          aria-label="Copy full hash"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 animate-in zoom-in" />
          ) : (
            <Copy className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
          )}
        </button>
      )}

      {/* Tooltip on hover */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 px-2.5 py-1 text-xs font-mono text-cyan-200 bg-slate-900/95 border border-cyan-500/30 rounded shadow-xl backdrop-blur-md whitespace-nowrap pointer-events-none max-w-md overflow-hidden text-ellipsis">
          {hash}
        </div>
      )}
    </div>
  );
};
