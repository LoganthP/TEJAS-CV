import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  FileText,
  Key,
  Lock,
  Layers,
  Info,
  Clock,
  User as UserIcon,
  Tag,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { getSampleDetails, getSampleImageUrl } from "../../api/endpoints";
import { formatBytes, formatDateTime } from "../../lib/format";
import { DecisionBadge } from "../ui/DecisionBadge";

interface ImagePropertiesDialogProps {
  datasetId: string;
  sampleId: number;
  sampleList?: number[];
  onClose: () => void;
  onSelectSample?: (sampleId: number) => void;
}

export const ImagePropertiesDialog: React.FC<ImagePropertiesDialogProps> = ({
  datasetId,
  sampleId,
  sampleList = [],
  onClose,
  onSelectSample,
}) => {
  const [activeTab, setActiveTab] = useState<"general" | "signatures" | "security" | "details" | "versions">("general");
  const [zoomed, setZoomed] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Fetch full details
  const { data: details, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sampleDetails", datasetId, sampleId],
    queryFn: () => getSampleDetails(datasetId, sampleId),
    enabled: !!datasetId && !!sampleId,
  });

  // Current index in sampleList
  const currentIndex = sampleList.indexOf(sampleId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < sampleList.length - 1;

  const handlePrev = () => {
    if (hasPrev && onSelectSample) {
      onSelectSample(sampleList[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext && onSelectSample) {
      onSelectSample(sampleList[currentIndex + 1]);
    }
  };

  // Keyboard navigation: Left/Right to browse, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        handlePrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasPrev, hasNext, currentIndex, sampleList]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Format date and time separately
  const splitDateTime = (isoString?: string | null) => {
    if (!isoString) return { date: "Not recorded", time: "Not recorded", utc: "" };
    try {
      const d = new Date(isoString);
      return {
        date: d.toLocaleDateString(),
        time: d.toLocaleTimeString(),
        utc: d.toISOString(),
      };
    } catch {
      return { date: "Not recorded", time: "Not recorded", utc: "" };
    }
  };

  const imageUrl = getSampleImageUrl(datasetId, sampleId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-[fadeIn_0.15s_ease-out]">
      {/* Dialog Window styled like Windows File Properties */}
      <div className="bg-[#0f172a] border border-white/20 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        
        {/* Windows-style Header Title Bar */}
        <div className="px-4 py-3 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-5 h-5 rounded bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
              <FileText className="w-3 h-3" />
            </div>
            <span className="font-bold text-white truncate text-sm">
              {details?.general.filename || `Sample #${sampleId}`} Properties
            </span>
            {sampleList.length > 1 && (
              <span className="text-[10px] text-slate-500 shrink-0">
                ({currentIndex + 1} of {sampleList.length})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {sampleList.length > 1 && (
              <div className="flex items-center gap-1 mr-2 border-r border-white/10 pr-2">
                <button
                  onClick={handlePrev}
                  disabled={!hasPrev}
                  title="Previous image (←)"
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNext}
                  disabled={!hasNext}
                  title="Next image (→)"
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Windows-style Tabs Strip */}
        <div className="flex items-center px-4 bg-slate-900/50 border-b border-white/10 gap-1 overflow-x-auto shrink-0 select-none">
          {[
            { id: "general", label: "General" },
            { id: "signatures", label: "Digital Signatures" },
            { id: "security", label: "Security" },
            { id: "details", label: "Details" },
            { id: "versions", label: "Previous Versions" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 text-xs font-mono font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-cyan-400 text-cyan-300 bg-white/[0.04]"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dialog Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Left Panel: Large Zoomable Preview */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div
              onClick={() => setZoomed(!zoomed)}
              className="relative w-full aspect-square bg-black/60 rounded-xl border border-white/10 overflow-hidden cursor-zoom-in group flex items-center justify-center shadow-inner"
              title="Click to zoom preview"
            >
              <img
                src={imageUrl}
                alt={details?.general.filename || "Sample"}
                className={`max-w-full max-h-full object-contain transition-transform duration-200 ${
                  zoomed ? "scale-150 cursor-zoom-out" : "group-hover:scale-105"
                }`}
              />
              <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 border border-white/10 text-[10px] text-slate-300 flex items-center gap-1 pointer-events-none">
                {zoomed ? <ZoomOut className="w-3 h-3" /> : <ZoomIn className="w-3 h-3" />}
                <span>{zoomed ? "Zoomed" : "Click to zoom"}</span>
              </div>
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 border border-white/10 text-[10px] text-cyan-300 font-bold">
                {details?.general.label || "Sample"}
              </div>
            </div>

            {/* Quick stats under preview */}
            <div className="w-full mt-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-slate-400">
                <span>Dimensions:</span>
                <span className="text-white">
                  {isLoading ? "..." : details?.general.width ? `${details.general.width} × ${details.general.height}` : "Unknown"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>File Size:</span>
                <span className="text-white">
                  {isLoading ? "..." : details?.general.size_bytes != null ? formatBytes(details.general.size_bytes) : "Unknown"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Format:</span>
                <span className="text-white">
                  {isLoading ? "..." : details?.general.format || "Unknown"}
                </span>
              </div>
            </div>
          </div>

          {/* Right Panel: Tab Content */}
          <div className="md:col-span-7 flex flex-col justify-between">
            {isLoading ? (
              <div className="py-20 text-center text-slate-400 animate-pulse">
                Reading cryptographic metadata and signatures...
              </div>
            ) : isError || !details ? (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                <div className="text-rose-400">
                  {error instanceof Error ? error.message : "Failed to load sample details."}
                </div>
                <button
                  onClick={() => refetch()}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors text-white"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* 1. GENERAL TAB */}
                {activeTab === "general" && (
                  <div className="space-y-3.5">
                    <div className="pb-2 border-b border-white/10">
                      <h4 className="text-sm font-bold text-white mb-0.5">File Attributes</h4>
                      <p className="text-[11px] text-slate-400">General container and filesystem properties.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">File Name:</span>
                      <span className="col-span-2 text-white font-bold break-all">{details.general.filename}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">Type:</span>
                      <span className="col-span-2 text-slate-200">
                        {details.general.format ? `${details.general.format} image` : "Image file"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">Location:</span>
                      <span className="col-span-2 text-slate-300 break-all">
                        <span className="text-cyan-400">{details.general.dataset_name}</span> / {details.general.relpath}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">Size:</span>
                      <span className="col-span-2 text-slate-200">
                        {formatBytes(details.general.size_bytes)} ({details.general.size_bytes.toLocaleString()} bytes)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">Dimensions:</span>
                      <span className="col-span-2 text-slate-200">
                        {details.general.width} × {details.general.height} pixels
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">Class Label:</span>
                      <span className="col-span-2">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                          {details.general.label}
                        </span>
                      </span>
                    </div>

                    {/* Created (source) - separate date and time */}
                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">Created (Source):</span>
                      <div className="col-span-2 text-slate-200" title={`UTC: ${details.general.source_modified_at || "Not recorded"}`}>
                        {details.general.source_modified_at ? (
                          <div className="flex items-center gap-3">
                            <span>Date: <strong>{splitDateTime(details.general.source_modified_at).date}</strong></span>
                            <span>Time: <strong>{splitDateTime(details.general.source_modified_at).time}</strong></span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Not recorded (ingested before metadata capture)</span>
                        )}
                      </div>
                    </div>

                    {/* Ingested - separate date and time */}
                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">Ingested:</span>
                      <div className="col-span-2 text-slate-200" title={`UTC: ${details.general.ingested_at || "Not recorded"}`}>
                        {details.general.ingested_at ? (
                          <div className="flex items-center gap-3">
                            <span>Date: <strong>{splitDateTime(details.general.ingested_at).date}</strong></span>
                            <span>Time: <strong>{splitDateTime(details.general.ingested_at).time}</strong></span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Not recorded</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                      <span className="text-slate-400">Uploaded By:</span>
                      <span className="col-span-2 flex items-center gap-1.5 text-cyan-300">
                        <UserIcon className="w-3.5 h-3.5 text-cyan-400" />
                        <span>@{details.general.uploaded_by?.username || "system"}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-1">
                      <span className="text-slate-400">Contributor:</span>
                      <span className="col-span-2 text-slate-200">{details.general.contributor}</span>
                    </div>
                  </div>
                )}

                {/* 2. DIGITAL SIGNATURES TAB */}
                {activeTab === "signatures" && (
                  <div className="space-y-4">
                    <div className="pb-2 border-b border-white/10">
                      <h4 className="text-sm font-bold text-white mb-0.5">Digital Signatures & Manifest Verification</h4>
                      <p className="text-[11px] text-slate-400">Cryptographic authenticity and Merkle inclusion proof.</p>
                    </div>

                    {/* Alteration warning if file_unchanged is false */}
                    {!details.signatures.file_unchanged && (
                      <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-xs rounded-xl flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <div>
                          <strong>WARNING: File Changed at Rest!</strong>
                          <div className="text-[10px] text-rose-200 mt-0.5">
                            Recomputed hash does not match original SHA-256 recorded at ingestion.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Windows-style signature list table */}
                    <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-white/5 border-b border-white/10 text-slate-400">
                          <tr>
                            <th className="px-3 py-2 font-medium">Signer</th>
                            <th className="px-3 py-2 font-medium">Algorithm</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Manifest Match</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          <tr>
                            <td className="px-3 py-2 font-bold text-white">
                              {details.signatures.manifest_signer || "Unsigned"}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-400">Ed25519</td>
                            <td className="px-3 py-2">
                              {details.signatures.manifest_signature_valid ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                  <Check className="w-3 h-3" /> Valid
                                </span>
                              ) : details.signatures.manifest_present ? (
                                <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                                  <X className="w-3 h-3" /> Invalid
                                </span>
                              ) : (
                                <span className="text-slate-500">Not signed</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {details.signatures.listed_in_manifest ? (
                                details.signatures.manifest_hash_matches ? (
                                  <span className="text-emerald-400 font-bold">✓ Matches</span>
                                ) : (
                                  <span className="text-rose-400 font-bold">✕ Mismatch</span>
                                )
                              ) : (
                                <span className="text-slate-500">Not listed</span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Hashes section */}
                    <div className="space-y-2 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Sample SHA-256:</span>
                        <div className="flex items-center gap-1.5 font-mono text-cyan-300">
                          <span title={details.signatures.sha256}>
                            {details.signatures.sha256.slice(0, 10)}…{details.signatures.sha256.slice(-8)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(details.signatures.sha256, "sha256")}
                            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                            title="Copy full hash"
                          >
                            {copiedText === "sha256" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Merkle Root:</span>
                        <div className="flex items-center gap-1.5 font-mono text-cyan-300">
                          <span title={details.signatures.merkle_root}>
                            {details.signatures.merkle_root.slice(0, 10)}…{details.signatures.merkle_root.slice(-8)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(details.signatures.merkle_root, "merkle_root")}
                            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                            title="Copy Merkle root"
                          >
                            {copiedText === "merkle_root" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      {details.signatures.signer_key_fingerprint && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Signer Key Fingerprint:</span>
                          <span className="font-mono text-slate-300">
                            {details.signatures.signer_key_fingerprint}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Merkle Proof Path Diagram */}
                    <div className="p-3 bg-black/40 border border-white/5 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-[11px] flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-cyan-400" />
                          Merkle Inclusion Proof ({details.signatures.merkle_proof.length} siblings)
                        </span>
                        {details.signatures.merkle_verified ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                            <Check className="w-3 h-3" /> Verified ✓
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold text-[11px]">Unverified ✕</span>
                        )}
                      </div>

                      <div className="space-y-1 font-mono text-[10px] max-h-28 overflow-y-auto pr-1">
                        {details.signatures.merkle_proof.map((p, idx) => (
                          <div key={idx} className="flex items-center justify-between p-1 bg-white/[0.02] rounded border border-white/5">
                            <span className="text-slate-400">Level {idx} ({p.position}):</span>
                            <span className="text-slate-300" title={p.hash}>{p.hash.slice(0, 12)}…{p.hash.slice(-8)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SECURITY TAB */}
                {activeTab === "security" && (
                  <div className="space-y-4">
                    <div className="pb-2 border-b border-white/10">
                      <h4 className="text-sm font-bold text-white mb-0.5">Security & Engine Findings</h4>
                      <p className="text-[11px] text-slate-400">Provenance attribution, role permissions, and anomaly flags.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <span className="text-slate-400 block mb-1">Dataset Status:</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                          {details.security.dataset_status}
                        </span>
                      </div>
                      <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <span className="text-slate-400 block mb-1">Uploaded By:</span>
                        <span className="text-white font-bold">@{details.security.uploaded_by?.username || "system"}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-[11px]">
                      <span className="text-slate-400 block mb-1">Role Visibility:</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        {details.security.visible_to_roles.map((r) => (
                          <span key={r} className="px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 uppercase text-[10px]">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Engine Findings */}
                    <div className="space-y-2">
                      <h5 className="font-bold text-white text-[11px]">
                        Engine Findings for this Sample ({details.security.findings.length})
                      </h5>
                      {details.security.findings.length > 0 ? (
                        <div className="space-y-2">
                          {details.security.findings.map((f, idx) => (
                            <div key={idx} className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <DecisionBadge decision={f.decision as any} size="sm" />
                                  <span className="text-slate-300 font-bold">Job #{f.job_id.slice(0, 8)}</span>
                                </div>
                                <Link
                                  to="/evidence"
                                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px] underline"
                                >
                                  Evidence <ExternalLink className="w-3 h-3" />
                                </Link>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {f.reasons.map((r, ri) => (
                                  <span
                                    key={ri}
                                    className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold"
                                  >
                                    {r}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-emerald-400 text-center">
                          ✓ No engine findings or suspicious anomalies recorded for this image.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. DETAILS TAB */}
                {activeTab === "details" && (
                  <div className="space-y-4">
                    <div className="pb-2 border-b border-white/10">
                      <h4 className="text-sm font-bold text-white mb-0.5">Image & EXIF Metadata</h4>
                      <p className="text-[11px] text-slate-400">Dimensions, perceptual hash, image statistics and EXIF fields.</p>
                    </div>

                    {/* Properties grid */}
                    <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-black/30">
                      <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                        <span className="text-slate-400">Dimensions:</span>
                        <span className="col-span-2 text-white">{details.general.width} × {details.general.height}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                        <span className="text-slate-400">Format:</span>
                        <span className="col-span-2 text-white">{details.general.format || "Not recorded"}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                        <span className="text-slate-400">Color Mode:</span>
                        <span className="col-span-2 text-white">{details.general.mode || "Not recorded"}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1 border-b border-white/5">
                        <span className="text-slate-400">Bit Depth:</span>
                        <span className="col-span-2 text-white">
                          {details.general.mode === "RGB" ? "24-bit RGB" : details.general.mode === "RGBA" ? "32-bit RGBA" : "8-bit"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1">
                        <span className="text-slate-400">Perceptual Hash (pHash):</span>
                        <div className="col-span-2 flex items-center gap-1.5 font-mono text-cyan-300">
                          <span>{details.details.phash || "Not recorded"}</span>
                          {details.details.phash && (
                            <button
                              onClick={() => copyToClipboard(details.details.phash!, "phash")}
                              className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                              title="Copy pHash"
                            >
                              {copiedText === "phash" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Image Statistics Bars */}
                    {details.details.stats && Object.keys(details.details.stats).length > 0 && (
                      <div className="space-y-2 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                        <h5 className="font-bold text-white text-[11px] mb-2">Image Statistics</h5>
                        <div className="grid grid-cols-2 gap-3">
                          {Object.entries(details.details.stats).map(([key, val]) => {
                            const num = typeof val === "number" ? val : parseFloat(val);
                            const normalized = isNaN(num) ? 0 : Math.min(100, Math.max(0, num * 100));
                            return (
                              <div key={key} className="space-y-1">
                                <div className="flex justify-between text-[10px] text-slate-400 capitalize">
                                  <span>{key.replace("_", " ")}:</span>
                                  <span className="text-slate-200">{isNaN(num) ? String(val) : num.toFixed(2)}</span>
                                </div>
                                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-cyan-400 rounded-full"
                                    style={{ width: `${normalized}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* EXIF Fields */}
                    <div className="p-3 bg-black/40 border border-white/10 rounded-xl space-y-2">
                      <h5 className="font-bold text-white text-[11px]">EXIF Camera Metadata</h5>
                      {details.details.exif ? (
                        <div className="space-y-1.5 text-[11px]">
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-slate-400">Date Taken:</span>
                            <span className="col-span-2 text-white">{details.details.exif.DateTimeOriginal || "Not recorded"}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-slate-400">Camera Make:</span>
                            <span className="col-span-2 text-white">{details.details.exif.Make || "Not recorded"}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-slate-400">Camera Model:</span>
                            <span className="col-span-2 text-white">{details.details.exif.Model || "Not recorded"}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-slate-400">Software:</span>
                            <span className="col-span-2 text-white">{details.details.exif.Software || "Not recorded"}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <span className="text-slate-400">GPS Status:</span>
                            <span className="col-span-2 text-white">
                              {details.details.exif.gps_present ? "Present (Coordinates Redacted)" : "None"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-500 italic text-[11px]">
                          Not recorded (ingested before metadata capture or no EXIF header present)
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. PREVIOUS VERSIONS TAB */}
                {activeTab === "versions" && (
                  <div className="space-y-4">
                    <div className="pb-2 border-b border-white/10">
                      <h4 className="text-sm font-bold text-white mb-0.5">Cross-Dataset Lineage & Near Duplicates</h4>
                      <p className="text-[11px] text-slate-400">Cryptographic deduplication across ingested asset batches.</p>
                    </div>

                    {/* Tampered Note */}
                    {details.history.demo_tampered && (
                      <div className="p-3 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs rounded-xl flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>Adversary simulation tamper applied to this sample file.</span>
                      </div>
                    )}

                    {/* Exact matches elsewhere */}
                    <div className="space-y-2">
                      <h5 className="font-bold text-white text-[11px]">
                        Exact File in Other Datasets (Same SHA-256)
                      </h5>
                      {details.history.same_file_elsewhere.length > 0 ? (
                        <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-white/5 border-b border-white/10 text-slate-400">
                              <tr>
                                <th className="px-3 py-2">Dataset</th>
                                <th className="px-3 py-2">Path</th>
                                <th className="px-3 py-2">Label</th>
                                <th className="px-3 py-2">Ingested</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-200">
                              {details.history.same_file_elsewhere.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="px-3 py-2 text-cyan-400 font-medium">{item.dataset_name}</td>
                                  <td className="px-3 py-2 text-slate-400 truncate max-w-[150px]">{item.relpath}</td>
                                  <td className="px-3 py-2">{item.label}</td>
                                  <td className="px-3 py-2 text-slate-500">
                                    {item.ingested_at ? formatDateTime(item.ingested_at) : "Unknown"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-slate-500 text-[11px]">
                          No other datasets contain this exact file.
                        </div>
                      )}
                    </div>

                    {/* Near duplicates */}
                    <div className="space-y-2">
                      <h5 className="font-bold text-white text-[11px]">
                        Near-Duplicates (pHash Hamming Distance ≤ 6)
                      </h5>
                      {details.history.near_duplicates.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {details.history.near_duplicates.map((nd, idx) => (
                            <div key={idx} className="p-2.5 bg-black/40 border border-white/10 rounded-xl flex items-center justify-between text-[11px]">
                              <div className="truncate mr-2">
                                <span className="text-white block truncate">{nd.relpath}</span>
                                <span className="text-[10px] text-slate-500">Dataset: {nd.dataset_id.slice(0, 8)}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold shrink-0">
                                Dist: {nd.distance}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-slate-500 text-[11px]">
                          No near-duplicate samples found within threshold (pHash distance ≤ 6).
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Dialog Footer */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                Use <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-slate-300">←</kbd> <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-slate-300">→</kbd> to browse, <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-slate-300">Esc</kbd> to close
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
