import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Binary,
  Upload,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCw,
  RefreshCw,
  Send,
  Loader2,
  CheckCircle2,
  FileCheck,
  User,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  listInference,
  runInference,
  verifyInferenceChain,
  attestInference,
  listAssets,
  listTrustedModels,
  getDemoTampers,
  restoreInferenceRecord,
} from "../api/endpoints";
import { GlassPanel } from "../components/ui/GlassPanel";
import { HashText } from "../components/ui/HashText";
import { formatDateTime } from "../lib/format";
import { InferenceRecord, InferenceChainVerification, Asset, TrustedModel } from "../types/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "../hooks/useAuth";

const PAGE_SIZE = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const InferencePage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showTestModels, setShowTestModels] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [lastProducedRecord, setLastProducedRecord] = useState<InferenceRecord | null>(null);

  // Verification state
  const [chainVerification, setChainVerification] = useState<InferenceChainVerification | null>(null);
  const [verifyingChain, setVerifyingChain] = useState(false);

  // Attestation state
  const [attestationResult, setAttestationResult] = useState<{
    valid: boolean;
    reason: string;
    checks: Record<string, boolean>;
    attestations?: number;
  } | null>(null);
  const [attesting, setAttesting] = useState(false);
  const [localAttestationCounts, setLocalAttestationCounts] = useState<Record<string, number>>({});

  // History pagination
  const [page, setPage] = useState(1);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Queries
  const { data: models } = useQuery<Asset[]>({
    queryKey: ["modelAssetsForInference"],
    queryFn: () => listAssets("model"),
    staleTime: 30_000,
  });

  const { data: trustedModels } = useQuery<TrustedModel[]>({
    queryKey: ["trustedModelsList"],
    queryFn: listTrustedModels,
    staleTime: 30_000,
  });

  const { data: demoTampers } = useQuery({
    queryKey: ["demoTampersInference"],
    queryFn: getDemoTampers,
    enabled: isAdmin,
    staleTime: 10_000,
  });

  const { data: records, isLoading: loadingRecords } = useQuery<InferenceRecord[]>({
    queryKey: ["inferenceRecords"],
    queryFn: () => listInference(undefined, 200),
    staleTime: 10_000,
  });

  // Verify chain on mount once
  useEffect(() => {
    handleVerifyChain();
  }, []);

  // Categorize models: Approved, Trained here, Other
  const { approvedModels, trainedModels, otherModels } = useMemo(() => {
    if (!models) return { approvedModels: [], trainedModels: [], otherModels: [] };

    const trustedIds = new Set(trustedModels?.map((tm) => tm.asset_id) || []);

    const filterTest = (m: Asset) => {
      if (showTestModels) return true;
      const name = (m.name || "").toLowerCase();
      const id = (m.id || "").toLowerCase();
      return !name.startsWith("[bench") && !name.startsWith("[pack") && !id.startsWith("[bench") && !id.startsWith("[pack");
    };

    const eligible = models.filter(filterTest);

    const approved = eligible.filter((m) => trustedIds.has(m.id));
    const trained = eligible.filter((m) => !trustedIds.has(m.id) && m.meta?.training_record);
    const other = eligible.filter((m) => !trustedIds.has(m.id) && !m.meta?.training_record);

    return { approvedModels: approved, trainedModels: trained, otherModels: other };
  }, [models, trustedModels, showTestModels]);

  // Pre-select first approved model if none selected
  useEffect(() => {
    if (!selectedModelId) {
      if (approvedModels.length > 0) {
        setSelectedModelId(approvedModels[0].id);
      } else if (trainedModels.length > 0) {
        setSelectedModelId(trainedModels[0].id);
      } else if (otherModels.length > 0) {
        setSelectedModelId(otherModels[0].id);
      }
    }
  }, [approvedModels, trainedModels, otherModels, selectedModelId]);

  // Handle file select & preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFileError(null);
    setRunError(null);

    if (!f) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    if (f.size > MAX_FILE_SIZE) {
      setFileError("File exceeds 10 MB maximum allowed limit.");
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    setSelectedFile(f);
    const objectUrl = URL.createObjectURL(f);
    setPreviewUrl(objectUrl);
  };

  const handleRunInference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModelId || !selectedFile) return;

    try {
      setRunning(true);
      setRunError(null);
      setAttestationResult(null);

      const res = await runInference(selectedModelId, selectedFile);
      setLastProducedRecord(res);
      setSelectedRecordId(res.id);

      queryClient.invalidateQueries({ queryKey: ["inferenceRecords"] });
      // Re-verify chain automatically
      handleVerifyChain();
    } catch (err: any) {
      setRunError(err.message || "Failed to execute signed inference");
    } finally {
      setRunning(false);
    }
  };

  const handleVerifyChain = async () => {
    try {
      setVerifyingChain(true);
      const res = await verifyInferenceChain();
      setChainVerification(res);
    } catch (err) {
      console.error("Chain verification failed", err);
    } finally {
      setVerifyingChain(false);
    }
  };

  const handleAttest = async (record: InferenceRecord) => {
    try {
      setAttesting(true);
      const res = await attestInference(record);
      setAttestationResult(res);

      if (res.attestations !== undefined) {
        setLocalAttestationCounts((prev) => ({
          ...prev,
          [record.id]: res.attestations!,
        }));
      }

      queryClient.invalidateQueries({ queryKey: ["inferenceRecords"] });
    } catch (err: any) {
      setAttestationResult({
        valid: false,
        reason: err.message || "Attestation request failed",
        checks: {},
      });
    } finally {
      setAttesting(false);
    }
  };

  const handleRestoreRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setRestoringId(id);
      await restoreInferenceRecord(id);
      await handleVerifyChain();
      queryClient.invalidateQueries({ queryKey: ["inferenceRecords"] });
      queryClient.invalidateQueries({ queryKey: ["demoTampersInference"] });
      queryClient.invalidateQueries({ queryKey: ["systemStatus"] });
    } catch (err) {
      console.error("Restore failed", err);
    } finally {
      setRestoringId(null);
    }
  };

  const statusMap = useMemo(() => {
    const map = new Map<
      string,
      { status: "VALID" | "TAMPERED" | "UNTRUSTED_DOWNSTREAM"; issues: string[] }
    >();
    if (chainVerification?.records) {
      chainVerification.records.forEach((r) => {
        map.set(r.id, { status: r.status, issues: r.issues || [] });
      });
    }
    return map;
  }, [chainVerification]);

  // Current record to inspect in hero card
  const activeRecord = useMemo(() => {
    if (selectedRecordId && records) {
      const found = records.find((r) => r.id === selectedRecordId);
      if (found) return found;
    }
    return lastProducedRecord || (records && records.length > 0 ? records[0] : null);
  }, [selectedRecordId, lastProducedRecord, records]);

  // Pagination for history
  const totalRecords = records?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const paginatedRecords = useMemo(() => {
    if (!records) return [];
    const start = (page - 1) * PAGE_SIZE;
    return records.slice(start, start + PAGE_SIZE);
  }, [records, page]);

  const probChartData = activeRecord?.output?.probabilities
    ? Object.entries(activeRecord.output.probabilities).map(([cls, prob]) => ({
        class: cls,
        prob: Number(((prob as number) * 100).toFixed(1)),
      }))
    : [];

  const currentAttestationCount =
    (activeRecord && localAttestationCounts[activeRecord.id]) ?? activeRecord?.attestations ?? 0;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold">
              OPERATIONAL INFERENCE PROVENANCE
            </span>
            <span className="text-xs font-mono text-slate-500">ED25519 CHAINED NONCE</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight flex items-center gap-2.5">
            <Binary className="w-7 h-7 text-cyan-400" />
            <span>Cryptographic Inference Provenance</span>
          </h1>
        </div>

        <button
          onClick={handleVerifyChain}
          disabled={verifyingChain}
          className="px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-glass-edge hover:shadow-glow-cyan disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${verifyingChain ? "animate-spin" : ""}`} />
          <span>Verify Inference Hash Chain</span>
        </button>
      </div>

      {/* Top Section: Run Model & Inspect Hero Record */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Run Inference Form (5 cols) */}
        <div className="lg:col-span-5">
          <GlassPanel className="p-5 border-white/10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-400" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                  Execute Signed Inference
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModels(!showTestModels)}
                className="text-[10px] font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1"
                title="Toggle visibility of [bench] and [pack] synthetic models"
              >
                {showTestModels ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showTestModels ? "Hide test models" : "Show test models"}</span>
              </button>
            </div>

            <form onSubmit={handleRunInference} className="space-y-4 font-mono text-xs">
              {/* Grouped Model Dropdown */}
              <div>
                <label className="text-slate-400 block mb-1">Target Model:</label>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  required
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2.5 text-slate-200 focus:border-cyan-400 outline-none"
                >
                  <option value="">Select a Model...</option>

                  {approvedModels.length > 0 && (
                    <optgroup label="✓ Approved Models (Registry)">
                      {approvedModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.meta?.format || "ONNX"})
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {trainedModels.length > 0 && (
                    <optgroup label="⚡ Trained Here (Lab)">
                      {trainedModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.meta?.format || "ONNX"})
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {otherModels.length > 0 && (
                    <optgroup label="Other Models">
                      {otherModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.meta?.format || "ONNX"})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* File Input with preview */}
              <div>
                <label className="text-slate-400 block mb-1">
                  Input Image (PNG, JPG, BMP, WEBP ≤ 10 MB):
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/bmp,image/webp"
                  onChange={handleFileChange}
                  required
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-slate-300 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-mono file:bg-cyan-500/20 file:text-cyan-300 cursor-pointer"
                />

                {fileError && (
                  <p className="text-xs text-rose-400 font-mono mt-1">{fileError}</p>
                )}

                {/* Thumbnail Preview */}
                {selectedFile && previewUrl && (
                  <div className="mt-3 p-2 bg-black/40 rounded-xl border border-white/10 flex items-center gap-3">
                    <img
                      src={previewUrl}
                      alt="Thumbnail preview"
                      className="w-14 h-14 object-cover rounded-lg border border-white/10 shrink-0"
                    />
                    <div className="overflow-hidden min-w-0">
                      <span className="text-xs font-bold text-slate-200 block truncate">
                        {selectedFile.name}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || "image"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {runError && (
                <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{runError}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-black/30 border border-white/5 text-[11px] text-slate-400 leading-relaxed">
                Runs the model inside the air-gap sandbox, extracts SHA-256 digests of input and model, injects a single-use monotonic nonce, and signs the chained output record.
              </div>

              <button
                type="submit"
                disabled={running || !selectedModelId || !selectedFile}
                className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-glass-edge hover:shadow-glow-cyan"
              >
                {running ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Computing & Chaining Nonce...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Execute & Attest Record</span>
                  </>
                )}
              </button>
            </form>
          </GlassPanel>
        </div>

        {/* Hero Record Inspection (7 cols) */}
        <div className="lg:col-span-7">
          <GlassPanel className="p-5 border-white/10 space-y-4">
            {activeRecord ? (
              <div className="animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                      Signed Inference Record #{activeRecord.seq}
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                    ED25519 SEALED
                  </span>
                </div>

                {/* Classification Readout & Chart */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-center">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">
                      Top Classification
                    </span>
                    <span className="text-2xl font-mono font-black text-cyan-300 uppercase truncate">
                      {activeRecord.output?.top_class || "—"}
                    </span>
                    <span className="text-xs font-mono text-slate-400 mt-1">
                      Confidence:{" "}
                      <strong className="text-emerald-400">
                        {((activeRecord.output?.confidence || 0) * 100).toFixed(1)}%
                      </strong>
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={probChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                        <XAxis dataKey="class" stroke="#64748b" fontSize={9} />
                        <YAxis stroke="#64748b" fontSize={9} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f141b",
                            borderColor: "rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                            fontFamily: "JetBrains Mono",
                            fontSize: "10px",
                          }}
                        />
                        <Bar dataKey="prob" fill="#22d3ee" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Hashes & Metadata Wrapping Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono bg-black/30 p-3 rounded-xl border border-white/5 mb-4">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block mb-0.5">Input Hash</span>
                    <HashText hash={activeRecord.input_hash} className="text-cyan-300 text-xs" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block mb-0.5">Output Hash</span>
                    <HashText hash={activeRecord.output_hash} className="text-violet-300 text-xs" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block mb-0.5">Monotonic Nonce</span>
                    <HashText hash={activeRecord.nonce} className="text-slate-300 text-xs" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block mb-0.5">Previous Hash</span>
                    <HashText hash={activeRecord.previous_hash} className="text-slate-400 text-xs" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block mb-0.5">Record Hash</span>
                    <HashText hash={activeRecord.record_hash} className="text-emerald-300 text-xs" />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block mb-0.5">Operator Attribution</span>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 w-fit">
                      <User className="w-3 h-3 text-cyan-400" />
                      <span>{(activeRecord as any).created_by || "system"}</span>
                    </div>
                  </div>
                </div>

                {/* Downstream Attestation Action */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-mono text-slate-400">
                      Downstream Attestations:{" "}
                      <strong className="text-cyan-300 font-bold">{currentAttestationCount}</strong>
                    </span>

                    <button
                      onClick={() => handleAttest(activeRecord)}
                      disabled={attesting}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {attesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>Present to Downstream System</span>
                    </button>
                  </div>

                  {attestationResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs font-mono space-y-1.5 animate-in fade-in duration-150 ${
                        attestationResult.valid
                          ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                          : "bg-rose-950/30 border-rose-500/50 text-rose-300"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold flex-wrap gap-1">
                        <span>
                          {attestationResult.valid
                            ? "✓ ACCEPT (Attestation Verified)"
                            : `⚠ REJECT: ${attestationResult.reason}`}
                        </span>
                        {attestationResult.reason?.includes("REPLAY") && (
                          <span className="text-rose-400 font-black animate-pulse uppercase">
                            REPLAY ATTACK BLOCKED
                          </span>
                        )}
                      </div>

                      {attestationResult.checks && Object.keys(attestationResult.checks).length > 0 && (
                        <div className="grid grid-cols-2 gap-1 text-[10px] pt-1.5 border-t border-white/5">
                          {Object.entries(attestationResult.checks).map(([chk, val]) => (
                            <div key={chk} className="flex items-center gap-1">
                              <span>{val ? "✓" : "✕"}</span>
                              <span className="text-slate-300">{chk}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-xs font-mono text-slate-400">
                No inference record selected. Run a model above to produce a signed record.
              </div>
            )}
          </GlassPanel>
        </div>
      </div>

      {/* Inference Chain History */}
      <GlassPanel className="p-5 border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              Inference Hash Chain History ({totalRecords} Records)
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              Each record chains the output hash and monotonic nonce of the preceding execution
            </span>
          </div>

          {chainVerification && (
            <span
              className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
                chainVerification.valid
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
              }`}
            >
              {chainVerification.valid ? "CHAIN VALID ✓" : "CHAIN TAMPERED ⚠"}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {paginatedRecords.map((rec) => {
            const v = statusMap.get(rec.id);
            const status = v?.status || "VALID";
            const isTampered = status === "TAMPERED";
            const isUntrusted = status === "UNTRUSTED_DOWNSTREAM";
            const isSelected = activeRecord?.id === rec.id;
            const canRestore = isAdmin && demoTampers?.inference_records?.includes(rec.id);

            return (
              <div
                key={rec.id}
                onClick={() => {
                  setSelectedRecordId(rec.id);
                  setAttestationResult(null);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected ? "ring-1 ring-cyan-400" : ""
                } ${
                  isTampered
                    ? "bg-rose-950/20 border-rose-500/60 shadow-glow-quarantine"
                    : isUntrusted
                    ? "bg-amber-950/15 border-amber-500/40"
                    : "bg-black/30 hover:bg-black/50 border-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-xs text-white bg-white/5 px-2 py-0.5 rounded">
                      #{rec.seq}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-200 uppercase">
                          Class: {rec.output?.top_class}
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400">
                          {((rec.output?.confidence || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {formatDateTime(rec.timestamp)} • Nonce: {rec.nonce.slice(0, 8)}…
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <HashText hash={rec.record_hash} head={6} tail={4} className="text-cyan-300 text-xs" />

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold border ${
                        status === "VALID"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : status === "TAMPERED"
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                          : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      }`}
                    >
                      {status}
                    </span>

                    {canRestore && (
                      <button
                        onClick={(e) => handleRestoreRecord(rec.id, e)}
                        disabled={restoringId === rec.id}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition-colors flex items-center gap-1"
                      >
                        {restoringId === rec.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
                        )}
                        <span>Restore</span>
                      </button>
                    )}
                  </div>
                </div>

                {v?.issues && v.issues.length > 0 && (
                  <div className="mt-2 text-[10px] font-mono text-rose-300 bg-rose-500/10 p-1.5 rounded">
                    Issues: {v.issues.join(", ")}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs font-mono">
              <span className="text-slate-400">
                Page {page} of {totalPages} ({totalRecords} records)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
};
