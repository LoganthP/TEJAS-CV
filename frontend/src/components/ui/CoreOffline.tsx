import React from "react";
import { AlertOctagon, RefreshCw, Terminal } from "lucide-react";
import { GlassPanel } from "./GlassPanel";

interface CoreOfflineProps {
  onRetry: () => void;
  error?: string | null;
}

export const CoreOffline: React.FC<CoreOfflineProps> = ({ onRetry, error }) => {
  return (
    <div className="min-h-screen bg-bg-dark flex items-center justify-center p-6 bg-grid-pattern relative overflow-hidden">
      <div className="absolute inset-0 bg-radial-gradient from-rose-500/5 via-transparent to-transparent pointer-events-none" />
      
      <GlassPanel className="max-w-lg w-full p-8 text-center border-rose-500/30 relative z-10">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-6 shadow-glow-quarantine animate-pulse">
          <AlertOctagon className="w-8 h-8" />
        </div>

        <div className="inline-block px-3 py-1 rounded-full text-xs font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-3">
          SYSTEM DISCONNECTED
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          Assurance Core Offline
        </h1>

        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          The assurance service is temporarily unavailable. Your browser has kept your sign-in details. Retry when the service is available.
        </p>

        <div className="bg-black/50 border border-white/5 rounded-xl p-3 mb-6 text-left font-mono text-xs text-slate-300">
          <div className="flex items-center gap-2 text-slate-500 mb-1 border-b border-white/5 pb-1">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Connection details</span>
          </div>
          {error && (
            <div className="mt-2 pt-2 border-t border-white/5 text-rose-400/90 break-words text-[11px]">
              Error: {error}
            </div>
          )}
        </div>

        <button
          onClick={onRetry}
          className="w-full py-3 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-mono text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:shadow-glow-cyan"
        >
          <RefreshCw className="w-4 h-4" />
          Reconnect to Assurance Core
        </button>
      </GlassPanel>
    </div>
  );
};
