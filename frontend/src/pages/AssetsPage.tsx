import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  BrainCircuit,
  Users,
  ShieldCheck,
  Layers,
  Plus,
  Play,
  Upload,
  CheckCircle2,
  FileKey,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  listAssets,
  listContributors,
  listTrustedModels,
  listBaselines,
  startJob,
  createBaseline,
  createContributor,
  trustModel,
  uploadDataset,
  uploadModel,
} from "../api/endpoints";
import { GlassPanel } from "../components/ui/GlassPanel";
import { HashText } from "../components/ui/HashText";
import { formatBytes, formatDateTime } from "../lib/format";
import { EmptyState } from "../components/ui/EmptyState";

export const AssetsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    "datasets" | "models" | "contributors" | "trusted" | "baselines"
  >("datasets");

  // Dialog states
  const [showNewAssessment, setShowNewAssessment] = useState(false);
  const [showUploadDataset, setShowUploadDataset] = useState(false);
  const [showUploadModel, setShowUploadModel] = useState(false);
  const [showNewBaseline, setShowNewBaseline] = useState(false);
  const [showNewContributor, setShowNewContributor] = useState(false);

  // New assessment form state
  const [assessDatasetId, setAssessDatasetId] = useState("");
  const [assessModelId, setAssessModelId] = useState("");
  const [assessBaselineId, setAssessBaselineId] = useState("");
  const [assessTrustedName, setAssessTrustedName] = useState("");
  const [assessLabel, setAssessLabel] = useState("");
  const [startingJob, setStartingJob] = useState(false);

  // Queries
  const { data: datasets, isLoading: loadingDatasets } = useQuery({
    queryKey: ["assets", "dataset"],
    queryFn: () => listAssets("dataset"),
  });

  const { data: models, isLoading: loadingModels } = useQuery({
    queryKey: ["assets", "model"],
    queryFn: () => listAssets("model"),
  });

  const { data: contributors } = useQuery({
    queryKey: ["contributors"],
    queryFn: listContributors,
  });

  const { data: trustedModels } = useQuery({
    queryKey: ["trustedModels"],
    queryFn: listTrustedModels,
  });

  const { data: baselines } = useQuery({
    queryKey: ["baselines"],
    queryFn: listBaselines,
  });

  const handleStartAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStartingJob(true);
      const res = await startJob({
        dataset_id: assessDatasetId || undefined,
        model_id: assessModelId || undefined,
        baseline_id: assessBaselineId || undefined,
        trusted_model: assessTrustedName || undefined,
        label: assessLabel || undefined,
      });
      setShowNewAssessment(false);
      navigate(`/jobs/${res.id}`);
    } catch (err) {
      console.error("Failed to start job", err);
    } finally {
      setStartingJob(false);
    }
  };

  const handleTrustModelClick = async (assetId: string, name: string) => {
    try {
      await trustModel(assetId, name);
      queryClient.invalidateQueries({ queryKey: ["trustedModels"] });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              REGISTRY & ASSET INVENTORY
            </span>
            <span className="text-xs font-mono text-slate-500">DEFENCE REPOSITORY</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight flex items-center gap-2.5">
            <Database className="w-7 h-7 text-cyan-400" />
            <span>Cryptographic Assets & Registry</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewAssessment(true)}
            className="px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-glass-edge hover:shadow-glow-cyan"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>New Assurance Job</span>
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto text-xs font-mono">
        {[
          { key: "datasets", label: "Datasets", count: datasets?.length, icon: Database },
          { key: "models", label: "Models", count: models?.length, icon: BrainCircuit },
          { key: "contributors", label: "Contributors", count: contributors?.length, icon: Users },
          { key: "trusted", label: "Trusted Registry", count: trustedModels?.length, icon: ShieldCheck },
          { key: "baselines", label: "Baselines", count: baselines?.length, icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-3 py-2 rounded-xl flex items-center gap-2 transition-all shrink-0 ${
                isActive
                  ? "bg-white/10 text-cyan-300 border border-cyan-500/30 shadow-glass-edge"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 text-slate-300">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1. Datasets Tab */}
      {activeTab === "datasets" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase">
              Registered Defence Vision Datasets
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {datasets?.map((ds) => (
              <GlassPanel
                key={ds.id}
                className="p-5 border-white/10 hover:border-cyan-500/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-mono text-sm font-bold text-white uppercase tracking-tight truncate">
                      {ds.name}
                    </h3>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold border ${
                        ds.status === "REGISTERED" || ds.status === "ACCEPTED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : ds.status === "QUARANTINED"
                          ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {ds.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono bg-black/40 p-2.5 rounded-xl border border-white/5 mb-3">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Contributor:</span>
                      <span className="text-cyan-300 truncate max-w-[130px]">{ds.contributor}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Samples:</span>
                      <span className="text-slate-200 font-bold">{ds.meta?.sample_count ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Ed25519 Signed:</span>
                      <span className={ds.signed ? "text-emerald-400" : "text-slate-500"}>
                        {ds.signed ? "✓ Verified" : "✕ Unsigned"}
                      </span>
                    </div>
                    <div className="pt-1 border-t border-white/5">
                      <span className="text-[10px] text-slate-500 block uppercase">Merkle Root:</span>
                      <HashText hash={ds.sha256} head={8} tail={6} className="text-xs text-violet-300" />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">
                    {formatDateTime(ds.created_at)}
                  </span>
                  <Link
                    to={`/assets/${ds.id}`}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-mono flex items-center gap-1 transition-colors"
                  >
                    <span>Inspect Samples</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      )}

      {/* 2. Models Tab */}
      {activeTab === "models" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase">
              Registered Neural Network Models & Adapters
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models?.map((md) => {
              const isTrusted = trustedModels?.some((t) => t.asset_id === md.id);
              return (
                <GlassPanel
                  key={md.id}
                  className="p-5 border-white/10 hover:border-violet-500/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-mono text-sm font-bold text-white uppercase tracking-tight truncate">
                        {md.name}
                      </h3>
                      {isTrusted && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                          TRUSTED
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs font-mono bg-black/40 p-2.5 rounded-xl border border-white/5 mb-3">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Format:</span>
                        <span className="text-cyan-300 uppercase">{md.meta?.format || "ONNX"}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Parameters:</span>
                        <span className="text-slate-200">
                          {md.meta?.param_count ? `${(md.meta.param_count / 1e6).toFixed(1)}M` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Size:</span>
                        <span className="text-slate-300">{formatBytes(md.size)}</span>
                      </div>
                      <div className="pt-1 border-t border-white/5">
                        <span className="text-[10px] text-slate-500 block uppercase">SHA-256 Hash:</span>
                        <HashText hash={md.sha256} head={8} tail={6} className="text-xs text-cyan-300" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500">
                      {formatDateTime(md.created_at)}
                    </span>

                    {!isTrusted ? (
                      <button
                        onClick={() => handleTrustModelClick(md.id, md.name)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-1 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Approve as Trusted</span>
                      </button>
                    ) : (
                      <span className="text-xs font-mono text-emerald-400">✓ In Registry</span>
                    )}
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Contributors Tab */}
      {activeTab === "contributors" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contributors?.map((c) => (
              <GlassPanel key={c.id} className="p-4 border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-white">{c.name}</span>
                  <span className="text-[10px] font-mono text-slate-400">{c.organisation || "Defence Dept"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-500 block uppercase">Ed25519 Public Key:</span>
                  <HashText hash={c.public_key} head={10} tail={8} className="text-xs text-cyan-300" />
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      )}

      {/* 4. Trusted Models Registry Tab */}
      {activeTab === "trusted" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trustedModels?.map((t) => (
              <GlassPanel key={t.id} className="p-4 border-emerald-500/30 bg-emerald-950/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-emerald-300">{t.name}</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">Signed Fingerprint (SHA256):</span>
                  <HashText hash={t.sha256} head={10} tail={8} className="text-xs text-white" />
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Registered: {formatDateTime(t.registered_at)}
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      )}

      {/* 5. Baselines Tab */}
      {activeTab === "baselines" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {baselines?.map((b) => (
              <GlassPanel key={b.id} className="p-4 border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-white">{b.name}</span>
                  <Layers className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Dataset ID: <span className="text-cyan-300">{b.dataset_id}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Created: {formatDateTime(b.created_at)}
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      )}

      {/* Modal: New Assurance Job Wizard */}
      {showNewAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <GlassPanel className="max-w-lg w-full p-6 border-cyan-500/40">
            <h3 className="text-lg font-bold font-mono text-white mb-1">
              Configure New Assurance Job
            </h3>
            <p className="text-xs text-slate-400 font-sans mb-4">
              Submit target assets to the TEJAS-CV assurance engine. Analysis will execute asynchronously and seal in the audit ledger.
            </p>

            <form onSubmit={handleStartAssessment} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Target Dataset:</label>
                <select
                  value={assessDatasetId}
                  onChange={(e) => setAssessDatasetId(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-slate-200 focus:border-cyan-400 outline-none"
                >
                  <option value="">Select Dataset (optional)...</option>
                  {datasets?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.meta?.sample_count ?? 0} samples)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Target Model:</label>
                <select
                  value={assessModelId}
                  onChange={(e) => setAssessModelId(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-slate-200 focus:border-cyan-400 outline-none"
                >
                  <option value="">Select Model (optional)...</option>
                  {models?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.meta?.format || "ONNX"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Baseline Features:</label>
                <select
                  value={assessBaselineId}
                  onChange={(e) => setAssessBaselineId(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-slate-200 focus:border-cyan-400 outline-none"
                >
                  <option value="">Select Baseline (optional)...</option>
                  {baselines?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Trusted Model Name:</label>
                <select
                  value={assessTrustedName}
                  onChange={(e) => setAssessTrustedName(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-slate-200 focus:border-cyan-400 outline-none"
                >
                  <option value="">Select Trusted Registry Reference...</option>
                  {trustedModels?.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Job Label / Tag:</label>
                <input
                  type="text"
                  placeholder="e.g. Pre-Deployment Integrity Check"
                  value={assessLabel}
                  onChange={(e) => setAssessLabel(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-slate-200 focus:border-cyan-400 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNewAssessment(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingJob}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {startingJob ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>Launch Live Pipeline</span>
                </button>
              </div>
            </form>
          </GlassPanel>
        </div>
      )}
    </div>
  );
};
