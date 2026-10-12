import React from "react";
import { Check, Loader2, Circle } from "lucide-react";

interface StageNodeProps {
  label: string;
  sublabel?: string;
  status: "pending" | "running" | "completed" | "failed";
}

export const StageNode: React.FC<StageNodeProps> = ({
  label,
  sublabel,
  status,
}) => {
  const statusStyles = {
    pending: "border-white/10 bg-white/[0.02] text-slate-500",
    running: "border-cyan-400 bg-cyan-500/10 text-cyan-300 shadow-glow-cyan animate-pulse",
    completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    failed: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  };

  return (
    <div
      className={`px-3 py-2 rounded-xl border flex items-center gap-2 transition-all duration-300 ${statusStyles[status]}`}
    >
      <div className="shrink-0">
        {status === "running" && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
        {status === "completed" && <Check className="w-4 h-4 text-emerald-400" />}
        {status === "failed" && <Circle className="w-4 h-4 text-rose-400 fill-rose-400" />}
        {status === "pending" && <Circle className="w-4 h-4 text-slate-600" />}
      </div>
      <div>
        <div className="font-mono text-xs font-bold tracking-wider uppercase">
          {label}
        </div>
        {sublabel && (
          <div className="text-[10px] text-slate-400 font-mono">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
};
