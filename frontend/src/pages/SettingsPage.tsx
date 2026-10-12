import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Settings,
  Shield,
  Key,
  Cpu,
  Radio,
  Sliders,
  AlertCircle,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { GlassPanel } from "../components/ui/GlassPanel";
import { HashText } from "../components/ui/HashText";

export const SettingsPage: React.FC = () => {
  const { systemStatus: status, isLoading } = useSystemStatus();

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            CONFIGURATION & SPECIFICATIONS
          </span>
          <span className="text-xs font-mono text-slate-500">SYSTEM STATUS</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-cyan-400" />
          <span>System Specifications & Doctrine</span>
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Air-Gapped Network & Operating Mode */}
        <GlassPanel className="p-5 border-white/10 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-white/10">
            <Radio className="w-5 h-5 text-cyan-400" />
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
              Isolation & Network Envelope
            </h3>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between p-2 rounded bg-black/40">
              <span className="text-slate-400">System Mode:</span>
              <span className="text-cyan-300 font-bold">{status?.mode || "AIR-GAPPED"}</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-black/40">
              <span className="text-slate-400">External Network Dependencies:</span>
              <span className="text-emerald-400 font-bold">
                {status?.external_network_dependencies?.length
                  ? status.external_network_dependencies.join(", ")
                  : "None (Zero Outbound Access)"}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-black/40">
              <span className="text-slate-400">Core Engine Version:</span>
              <span className="text-slate-200">{status?.version || "1.0.0"}</span>
            </div>
          </div>
        </GlassPanel>

        {/* 2. Cryptographic Signing Engine */}
        <GlassPanel className="p-5 border-white/10 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-white/10">
            <Key className="w-5 h-5 text-violet-400" />
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
              Cryptographic Key Architecture
            </h3>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between p-2 rounded bg-black/40">
              <span className="text-slate-400">Signing Algorithm:</span>
              <span className="text-violet-300 font-bold">{status?.signing?.algorithm || "Ed25519"}</span>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px] uppercase mb-1">Platform Key ID:</span>
              <div className="p-2 rounded bg-black/40 border border-white/5 text-cyan-300 break-all">
                {status?.signing?.key_id || "—"}
              </div>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px] uppercase mb-1">
                Root Public Key (Hex):
              </span>
              <div className="p-2 rounded bg-black/40 border border-white/5 text-slate-300 break-all">
                {status?.signing?.public_key || "—"}
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* 3. Embedder & Neural Adapters */}
        <GlassPanel className="p-5 border-white/10 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-white/10">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
              Visual Embedder & Runtime Adapters
            </h3>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between p-2 rounded bg-black/40">
              <span className="text-slate-400">Embedder Engine:</span>
              <span className="text-cyan-300 font-bold">{status?.embedder || "handcrafted-v1"}</span>
            </div>

            <p className="text-[11px] text-slate-400 font-sans p-2 rounded bg-black/20 leading-relaxed">
              {status?.embedder_note || "Deterministic vision features extracted without cloud telemetry."}
            </p>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2 rounded bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block">ONNX</span>
                <span className={status?.adapters?.onnx ? "text-emerald-400 font-bold" : "text-slate-500"}>
                  {status?.adapters?.onnx ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="p-2 rounded bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block">ONNX Runtime</span>
                <span
                  className={
                    status?.adapters?.onnxruntime ? "text-emerald-400 font-bold" : "text-slate-500"
                  }
                >
                  {status?.adapters?.onnxruntime ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="p-2 rounded bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block">PyTorch</span>
                <span className={status?.adapters?.torch ? "text-emerald-400 font-bold" : "text-slate-500"}>
                  {status?.adapters?.torch ? "Active" : "Offline"}
                </span>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* 4. Fusion Weights & Decision Thresholds */}
        <GlassPanel className="p-5 border-white/10 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-white/10">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
              Bayesian Fusion Parameters
            </h3>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block">Review Threshold</span>
                <span className="text-base font-bold text-amber-400">
                  {status?.fusion?.review_at ?? 35}.0
                </span>
              </div>
              <div className="p-2.5 rounded bg-black/40 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase block">Quarantine Threshold</span>
                <span className="text-base font-bold text-rose-400">
                  {status?.fusion?.quarantine_at ?? 70}.0
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded bg-black/40 border border-white/5 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block">Engine Weights:</span>
              <div className="flex items-center justify-between text-slate-300">
                <span>Data: {((status?.fusion?.weights?.data || 0.3) * 100).toFixed(0)}%</span>
                <span>Model: {((status?.fusion?.weights?.model || 0.3) * 100).toFixed(0)}%</span>
                <span>Prov: {((status?.fusion?.weights?.provenance || 0.2) * 100).toFixed(0)}%</span>
                <span>Drift: {((status?.fusion?.weights?.drift || 0.2) * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* 5. Known Limitations Panel — "Honest by design" */}
      <GlassPanel className="p-6 border-white/10 bg-black/40 space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <AlertCircle className="w-5 h-5 text-cyan-400" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
            Honest by Design: Known System Limitations
          </h3>
        </div>

        <p className="text-xs text-slate-400 font-sans leading-relaxed">
          TEJAS-CV adheres to defence integrity transparency standards. The system does not claim omniscience; all evaluations reflect bounded statistical and cryptographic guarantees.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-sans text-slate-300">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <strong className="text-cyan-300 font-mono text-[11px] block">
              1. Non-exhaustive Trigger Search
            </strong>
            <span>
              Trojan trigger testing inspects clean control classes against predefined patch distributions. Custom or novel imperceptible triggers may evade single-pass heuristic probes.
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <strong className="text-cyan-300 font-mono text-[11px] block">
              2. Distribution Shift vs. Malice
            </strong>
            <span>
              Statistical drift detection evaluates Maximum Mean Discrepancy (MMD). Environmental shifts (e.g. haze, overcast sensor degradation) are surfaced as REVIEW, not malicious compromise.
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <strong className="text-cyan-300 font-mono text-[11px] block">
              3. Offline Key Custody
            </strong>
            <span>
              Platform keys are stored in secure local keyrings. Physical host compromise bypasses software-level signature authenticity guarantees.
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <strong className="text-cyan-300 font-mono text-[11px] block">
              4. Hardware Acceleration Fallback
            </strong>
            <span>
              When Torch or CUDA hardware is unavailable in air-gapped field rigs, lightweight handcrafted feature extraction ensures non-blocking operational assurance.
            </span>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
};
