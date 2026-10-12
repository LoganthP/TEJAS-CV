import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Database,
  ShieldCheck,
  ShieldAlert,
  FileKey,
  Layers,
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
} from "lucide-react";
import { getAsset, listSamples, getSampleImageUrl, getSampleProof, getMlModelTrainingRecord } from "../api/endpoints";
import { GlassPanel } from "../components/ui/GlassPanel";
import { HashText } from "../components/ui/HashText";
import { formatDateTime, formatBytes } from "../lib/format";
import { MerkleProofResponse } from "../types/api";
import { ImagePropertiesDialog } from "../components/assets/ImagePropertiesDialog";

export const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pageOffset, setPageOffset] = useState(0);
  const [labelFilter, setLabelFilter] = useState("");
  const pageSize = 24;

  const [selectedProof, setSelectedProof] = useState<{
    sampleRelpath: string;
    proof: MerkleProofResponse | null;
    loading: boolean;
  } | null>(null);

  const [propertiesSampleId, setPropertiesSampleId] = useState<number | null>(null);

  const { data: asset, isLoading: loadingAsset } = useQuery({
    queryKey: ["asset", id],
    queryFn: () => getAsset(id!),
    enabled: !!id,
  });

  const isDataset = asset?.asset_type === "dataset";
  const isModel = asset?.asset_type === "model";

  const { data: samplesData, isLoading: loadingSamples } = useQuery({
    queryKey: ["assetSamples", id, pageOffset, labelFilter],
    queryFn: () => listSamples(id!, pageOffset, pageSize, labelFilter || undefined),
    enabled: !!id && isDataset,
  });

  const { data: trainingData, isLoading: loadingTraining } = useQuery({
    queryKey: ["trainingRecord", id],
    queryFn: () => getMlModelTrainingRecord(id!),
    enabled: !!id && isModel,
  });

  const handleInspectProof = async (sampleId: number, relpath: string) => {
    if (!id) return;
    setSelectedProof({ sampleRelpath: relpath, proof: null, loading: true });
    try {
      const res = await getSampleProof(id, sampleId);
      setSelectedProof({ sampleRelpath: relpath, proof: res, loading: false });
    } catch {
      setSelectedProof((p) => (p ? { ...p, loading: false } : null));
    }
  };

  if (!asset && !loadingAsset) {
    return (
      <div className="py-12 text-center text-xs font-mono text-slate-400">
        Asset not found.
      </div>
    );
  }

  const classCounts = asset?.meta?.class_counts || {};

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/assets")}
          className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Assets Inventory</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                DATASET DETAIL INSPECTION
              </span>
              <span className="text-xs font-mono text-slate-500">{asset?.id}</span>
            </div>
            <h1 className="text-2xl font-bold font-mono text-white tracking-tight">
              {asset?.name}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono px-3 py-1 rounded-full font-bold border uppercase ${
                asset?.status === "REGISTERED" || asset?.status === "ACCEPTED"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : asset?.status === "QUARANTINED"
                  ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
              }`}
            >
              {asset?.status}
            </span>
          </div>
        </div>
      </div>

      {/* Dataset Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
        <GlassPanel className="p-4 border-white/10">
          <span className="text-slate-500 text-[10px] uppercase block mb-1">Merkle Root</span>
          <HashText hash={asset?.sha256} head={8} tail={6} className="text-cyan-300 text-xs" />
        </GlassPanel>

        <GlassPanel className="p-4 border-white/10">
          <span className="text-slate-500 text-[10px] uppercase block mb-1">Total Samples</span>
          <span className="text-lg font-bold text-white">
            {samplesData?.total ?? asset?.meta?.sample_count ?? 0}
          </span>
        </GlassPanel>

        <GlassPanel className="p-4 border-white/10">
          <span className="text-slate-500 text-[10px] uppercase block mb-1">Digital Signature</span>
          <span className={asset?.signed ? "text-emerald-400 font-bold" : "text-slate-500"}>
            {asset?.signed ? "✓ Ed25519 Verified" : "✕ Unsigned"}
          </span>
        </GlassPanel>

        <GlassPanel className="p-4 border-white/10">
          <span className="text-slate-500 text-[10px] uppercase block mb-1">Primary Contributor</span>
          <span className="text-slate-200 truncate block">{asset?.contributor}</span>
        </GlassPanel>
      </div>

      {/* Class distribution strip */}
      {isDataset && Object.keys(classCounts).length > 0 && (
        <GlassPanel className="p-4 border-white/10">
          <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block mb-2">
            Class Breakdown ({Object.keys(classCounts).length} classes)
          </span>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {Object.entries(classCounts).map(([cls, cnt]) => (
              <div
                key={cls}
                onClick={() => setLabelFilter(labelFilter === cls ? "" : cls)}
                className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                  labelFilter === cls
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                    : "bg-black/40 text-slate-400 border-white/5 hover:border-white/20"
                }`}
              >
                <span>{cls}: </span>
                <span className="font-bold text-slate-200">{String(cnt)}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* Samples Grid (Dataset Only) */}
      {isDataset && (
        <GlassPanel className="p-5 border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Forensic Sample Grid
              </span>
              {labelFilter && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                  Filtered: {labelFilter}
                </span>
              )}
            </div>

            {/* Pagination controls */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <button
                onClick={() => setPageOffset((p) => Math.max(0, p - pageSize))}
                disabled={pageOffset === 0}
                className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-400">
                {pageOffset + 1}–{Math.min(pageOffset + pageSize, samplesData?.total || 0)} of{" "}
                {samplesData?.total || 0}
              </span>
              <button
                onClick={() => setPageOffset((p) => p + pageSize)}
                disabled={pageOffset + pageSize >= (samplesData?.total || 0)}
                className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loadingSamples ? (
            <div className="py-16 text-center text-xs font-mono text-cyan-400 animate-pulse">
              Loading cryptographic dataset samples...
            </div>
          ) : samplesData?.items && samplesData.items.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {samplesData.items.map((sample) => (
                <div
                  key={sample.id}
                  className="p-2 rounded-xl bg-black/40 border border-white/5 hover:border-cyan-500/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div
                      onClick={() => setPropertiesSampleId(sample.id)}
                      className="aspect-square bg-slate-900 rounded-lg overflow-hidden mb-2 relative flex items-center justify-center cursor-pointer group"
                      title="Click to view image properties"
                    >
                      <img
                        src={getSampleImageUrl(id!, sample.id)}
                        alt={sample.relpath}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/70 text-[9px] font-mono text-cyan-300">
                        {sample.label}
                      </div>
                    </div>

                    <div className="text-[10px] font-mono text-slate-400 truncate mb-1" title={sample.relpath}>
                      {sample.relpath}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-1">
                    <button
                      onClick={() => setPropertiesSampleId(sample.id)}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center gap-1 transition-colors"
                      title="View Properties (General, Signatures, Security, Details, Versions)"
                    >
                      <Info className="w-3 h-3 text-cyan-400" />
                      <span>Props</span>
                    </button>
                    <button
                      onClick={() => handleInspectProof(sample.id, sample.relpath)}
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    >
                      Proof
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs font-mono text-slate-400">
              No samples found.
            </div>
          )}
        </GlassPanel>
      )}

      {/* IMAGE PROPERTIES DIALOG */}
      {propertiesSampleId !== null && (
        <ImagePropertiesDialog
          datasetId={id!}
          sampleId={propertiesSampleId}
          sampleList={samplesData?.items?.map((s) => s.id) || []}
          onClose={() => setPropertiesSampleId(null)}
          onSelectSample={(newId) => setPropertiesSampleId(newId)}
        />
      )}

      {/* Training Record (Model Only) */}
      {isModel && (
        <GlassPanel className="p-5 border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Training Verification Record
              </span>
            </div>
          </div>

          {loadingTraining ? (
            <div className="py-16 text-center text-xs font-mono text-fuchsia-400 animate-pulse">
              Loading cryptographic training record...
            </div>
          ) : trainingData?.record ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 flex-1">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Architecture</div>
                  <div className="text-white">{trainingData.record.architecture}</div>
                </div>
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 flex-1">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Source Dataset ID</div>
                  <div className="text-cyan-300">{trainingData.record.dataset_id}</div>
                </div>
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 flex-1">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Final Val Accuracy</div>
                  <div className="text-emerald-400 font-bold">
                    {(trainingData.record.validation_accuracy * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              {trainingData.record.poison && (
                <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 text-xs font-mono">
                  <div className="text-rose-400 font-bold mb-2 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Adversarial Trojan Detected in Training Record</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[11px]">
                    <div>
                      <div className="text-slate-500">Target Class</div>
                      <div className="text-rose-300">{trainingData.record.poison.target_class}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Poison Rate</div>
                      <div className="text-rose-300">{(trainingData.record.poison.rate * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Attack Success Rate</div>
                      <div className="text-rose-300">
                        {trainingData.record.poison.measured_attack_success_rate !== undefined 
                          ? (trainingData.record.poison.measured_attack_success_rate * 100).toFixed(1) + "%"
                          : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Pattern & Position</div>
                      <div className="text-rose-300">
                        {trainingData.record.poison.pattern} @ {trainingData.record.poison.position}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[11px] font-mono text-slate-400 uppercase font-bold mb-2">Training Epochs</h4>
                <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                  {trainingData.record.history?.map((ep: any, idx: number) => (
                    <div key={idx} className="flex flex-wrap items-center gap-4 p-2 rounded bg-white/5 text-[10px] font-mono">
                      <div className="w-16 text-slate-500">Epoch {ep.epoch}</div>
                      <div className="flex-1 text-slate-300">Loss: {ep.metrics.loss?.toFixed(4)}</div>
                      <div className="flex-1 text-emerald-400">Val Acc: {(ep.metrics.val_accuracy * 100).toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono font-bold ${
                trainingData.signature_valid
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Platform Verification Signature</span>
                </div>
                <span>{trainingData.signature_valid ? "VALID" : "INVALID"}</span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs font-mono text-slate-400">
              No training record found.
            </div>
          )}
        </GlassPanel>
      )}

      {/* Merkle Proof Modal */}
      {selectedProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <GlassPanel className="max-w-xl w-full p-6 border-cyan-500/40">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                  Merkle Inclusion Verification
                </h3>
              </div>
              <button
                onClick={() => setSelectedProof(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {selectedProof.loading ? (
              <div className="py-8 text-center text-xs font-mono text-cyan-400">
                Validating cryptographic tree traversal...
              </div>
            ) : selectedProof.proof ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="text-slate-400">Sample Path:</span>
                  <span className="text-cyan-300">{selectedProof.sampleRelpath}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Leaf SHA-256:</span>
                  <div className="p-2 rounded bg-black/60 text-[11px] text-cyan-300 break-all border border-white/5">
                    {selectedProof.proof.leaf_sha256}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Dataset Merkle Root:</span>
                  <div className="p-2 rounded bg-black/60 text-[11px] text-violet-300 break-all border border-white/5">
                    {selectedProof.proof.merkle_root}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center justify-between font-bold">
                  <span>Cryptographic Proof Status:</span>
                  <span>{selectedProof.proof.verified ? "VERIFIED (MATHEMATICALLY BOUND)" : "FAILED"}</span>
                </div>
              </div>
            ) : null}
          </GlassPanel>
        </div>
      )}
    </div>
  );
};
