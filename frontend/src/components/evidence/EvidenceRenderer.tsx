import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import { Check, X, ShieldCheck, FileKey, ExternalLink, Image as ImageIcon } from "lucide-react";
import { HashText } from "../ui/HashText";
import { GlassPanel } from "../ui/GlassPanel";
import { getSampleProof, getSampleImageUrl } from "../../api/endpoints";
import { MerkleProofResponse } from "../../types/api";

interface EvidenceRendererProps {
  evidence: Record<string, any> | null | undefined;
  datasetId?: string | null;
}

export const EvidenceRenderer: React.FC<EvidenceRendererProps> = ({
  evidence,
  datasetId,
}) => {
  const [proofModal, setProofModal] = useState<{
    sampleId: number;
    sampleRelpath?: string;
    proof: MerkleProofResponse | null;
    loading: boolean;
  } | null>(null);

  if (!evidence || Object.keys(evidence).length === 0) {
    return (
      <div className="text-xs text-slate-500 font-mono italic p-3 rounded-lg bg-black/20 border border-white/5">
        No cryptographic or statistical evidence payload attached.
      </div>
    );
  }

  // 1. Check for Expected vs Observed
  const hasExpectedObserved =
    ("expected" in evidence || "expected_hash" in evidence) &&
    ("observed" in evidence || "observed_hash" in evidence);

  // 2. Check for Trigger Tests (Backdoor / Trojan)
  const triggers =
    evidence.trigger_tests ||
    evidence.triggers ||
    (Array.isArray(evidence) && evidence[0]?.attack_success_rate !== undefined ? evidence : null);

  // 3. Check for Sample lists (poisoned or anomalous images)
  const samples =
    evidence.sample_ids ||
    evidence.samples ||
    evidence.flagged_samples ||
    evidence.anomalous_samples;

  // 4. Check for Contributor Attribution
  const contributorAttribution =
    evidence.contributor_attribution ||
    evidence.contributor_scores ||
    evidence.contributors;

  // 5. Check for Class Distribution / Shift
  const classDist =
    evidence.class_distributions ||
    evidence.distribution_shift ||
    (evidence.reference_distribution && evidence.current_distribution);

  // 6. Check for Statistical P-Values or OOD rate
  const hasStats =
    evidence.p_value !== undefined ||
    evidence.mmd_p_value !== undefined ||
    evidence.ood_rate !== undefined ||
    evidence.ood_fraction !== undefined ||
    evidence.drift_magnitude !== undefined;

  const handleFetchProof = async (sampleId: number, relpath?: string) => {
    if (!datasetId) return;
    setProofModal({ sampleId, sampleRelpath: relpath, proof: null, loading: true });
    try {
      const res = await getSampleProof(datasetId, sampleId);
      setProofModal({ sampleId, sampleRelpath: relpath, proof: res, loading: false });
    } catch {
      setProofModal((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Expected vs Observed Side-by-Side Diff */}
      {hasExpectedObserved && (
        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
          <div className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileKey className="w-3.5 h-3.5" />
            <span>Cryptographic Fingerprint Comparison</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center justify-between text-emerald-400 mb-1">
                <span className="font-semibold text-[11px] tracking-wider uppercase">EXPECTED / TRUSTED</span>
                <Check className="w-4 h-4" />
              </div>
              <div className="text-slate-200 break-all select-all font-mono">
                {String(evidence.expected || evidence.expected_hash)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
              <div className="flex items-center justify-between text-rose-400 mb-1">
                <span className="font-semibold text-[11px] tracking-wider uppercase">OBSERVED / ACTUAL</span>
                <X className="w-4 h-4" />
              </div>
              <div className="text-slate-200 break-all select-all font-mono">
                {String(evidence.observed || evidence.observed_hash)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Trigger Tests (Backdoor/Trojan) Bar Chart */}
      {Array.isArray(triggers) && triggers.length > 0 && (
        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">
              Trojan Trigger Evaluation (Attack Success Rate)
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Target class:{" "}
              <span className="text-cyan-300 font-semibold">
                {evidence.target_class || triggers[0]?.target_class || "target"}
              </span>
            </div>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={triggers.map((t: any) => ({
                  name: t.name || t.trigger || "trigger",
                  asr: Number((t.attack_success_rate * 100).toFixed(1)),
                  isControl:
                    t.is_control ||
                    t.name?.toLowerCase().includes("control") ||
                    t.trigger?.toLowerCase().includes("clean"),
                }))}
                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              >
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f141b",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    fontFamily: "JetBrains Mono",
                    fontSize: "12px",
                  }}
                  formatter={(val: any) => [`${val}%`, "ASR"]}
                />
                <Bar dataKey="asr" radius={[4, 4, 0, 0]}>
                  {triggers.map((entry: any, index: number) => {
                    const isControl =
                      entry.is_control ||
                      entry.name?.toLowerCase().includes("control") ||
                      entry.trigger?.toLowerCase().includes("clean");
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={isControl ? "#38bdf8" : entry.attack_success_rate > 0.5 ? "#f43f5e" : "#fbbf24"}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3. Sample Thumbnails & Merkle Inclusion Proofs */}
      {Array.isArray(samples) && samples.length > 0 && datasetId && (
        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Flagged Forensic Samples ({samples.length})</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Click sample for cryptographic Merkle proof
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
            {samples.slice(0, 12).map((item: any, idx: number) => {
              const sid = typeof item === "object" ? item.id || item.sample_id : item;
              const relpath = typeof item === "object" ? item.relpath || item.name : `sample_${sid}`;
              return (
                <div
                  key={idx}
                  className="group relative rounded-lg overflow-hidden border border-white/10 bg-slate-900/60 p-1 flex flex-col gap-1 hover:border-cyan-500/50 transition-all"
                >
                  <div className="aspect-square bg-black/60 rounded flex items-center justify-center overflow-hidden">
                    <img
                      src={getSampleImageUrl(datasetId, sid)}
                      alt={relpath}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        // Fallback icon if image cannot be rendered directly
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-mono text-slate-400 truncate max-w-[60px]">
                      #{sid}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleFetchProof(sid, relpath)}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-colors"
                    >
                      Proof
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Contributor Attribution */}
      {contributorAttribution && typeof contributorAttribution === "object" && (
        <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
          <div className="text-xs font-mono font-semibold text-violet-400 uppercase tracking-wider">
            Contributor Risk Attribution
          </div>
          <div className="space-y-1.5">
            {Object.entries(contributorAttribution).map(([contributor, val]: [string, any]) => {
              const score = typeof val === "number" ? val : val.risk || val.score || 0;
              const pct = Math.min(100, Math.max(0, score > 1 ? score : score * 100));
              return (
                <div key={contributor} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">{contributor}</span>
                    <span className={pct > 60 ? "text-rose-400" : pct > 30 ? "text-amber-400" : "text-emerald-400"}>
                      {pct.toFixed(1)}% risk
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        pct > 60 ? "bg-rose-500" : pct > 30 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Statistical P-Values & OOD Metric Tiles */}
      {hasStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(evidence.p_value !== undefined || evidence.mmd_p_value !== undefined) && (
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">
                MMD p-value
              </span>
              <span className="text-sm font-mono font-bold text-cyan-300">
                {(evidence.p_value ?? evidence.mmd_p_value ?? 0).toFixed(4)}
              </span>
            </div>
          )}

          {(evidence.ood_rate !== undefined || evidence.ood_fraction !== undefined) && (
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">
                OOD Fraction
              </span>
              <span className="text-sm font-mono font-bold text-amber-400">
                {(((evidence.ood_rate ?? evidence.ood_fraction) as number) * 100).toFixed(1)}%
              </span>
            </div>
          )}

          {evidence.drift_magnitude !== undefined && (
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/10">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">
                Drift Magnitude
              </span>
              <span className="text-sm font-mono font-bold text-violet-300">
                {Number(evidence.drift_magnitude).toFixed(2)}
              </span>
            </div>
          )}

          {evidence.environmental_factors && (
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 col-span-2">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">
                Suspected Shift Conditions
              </span>
              <span className="text-xs text-amber-300 font-mono">
                {Array.isArray(evidence.environmental_factors)
                  ? evidence.environmental_factors.join(", ")
                  : String(evidence.environmental_factors)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 6. Generic Pretty Key/Value Tree for remaining or all details */}
      <details className="group rounded-xl border border-white/5 bg-black/30 p-3">
        <summary className="text-xs font-mono text-slate-400 cursor-pointer hover:text-cyan-300 flex items-center justify-between select-none">
          <span>Inspect Full Evidence Tree (JSON)</span>
          <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>
        <div className="mt-3 p-2.5 rounded-lg bg-black/60 border border-white/5 overflow-x-auto">
          <pre className="text-[11px] font-mono text-cyan-200/90 leading-relaxed">
            {JSON.stringify(evidence, null, 2)}
          </pre>
        </div>
      </details>

      {/* Merkle Proof Modal */}
      {proofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <GlassPanel className="max-w-xl w-full p-6 border-cyan-500/30">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                  Merkle Inclusion Proof
                </h3>
              </div>
              <button
                onClick={() => setProofModal(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {proofModal.loading ? (
              <div className="py-8 text-center text-xs font-mono text-cyan-400 animate-pulse">
                Calculating cryptographic proof path...
              </div>
            ) : proofModal.proof ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-slate-400">Sample:</span>
                  <span className="text-cyan-300">{proofModal.sampleRelpath || `#${proofModal.sampleId}`}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-slate-400">Leaf Index:</span>
                  <span className="text-slate-200">#{proofModal.proof.leaf_index}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Leaf SHA-256:</span>
                  <div className="p-2 rounded bg-black/50 text-[11px] text-cyan-300 break-all border border-white/5">
                    {proofModal.proof.leaf_sha256}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Merkle Root:</span>
                  <div className="p-2 rounded bg-black/50 text-[11px] text-violet-300 break-all border border-white/5">
                    {proofModal.proof.merkle_root}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between text-emerald-400 font-semibold">
                  <span>Cryptographic Status:</span>
                  <span>{proofModal.proof.verified ? "VERIFIED (MATHEMATICALLY BOUND)" : "FAILED"}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-rose-400 font-mono">Failed to load proof.</div>
            )}
          </GlassPanel>
        </div>
      )}
    </div>
  );
};
