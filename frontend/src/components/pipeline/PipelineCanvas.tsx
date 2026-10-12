import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Database,
  BrainCircuit,
  GitBranch,
  Wind,
  ShieldCheck,
  ShieldAlert,
  Download,
  CheckCircle2,
  FileSearch,
  ExternalLink,
  HelpCircle,
  FileCode,
  FileText,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { JobStreamState } from "../../api/ws";
import { JobSummary } from "../../types/api";
import { StageNode } from "./StageNode";
import { EngineCard } from "./EngineCard";
import { FusionNode } from "./FusionNode";
import { DecisionHeroNode } from "./DecisionHeroNode";
import { AuditSealNode } from "./AuditSealNode";
import { FlowConnector } from "./FlowConnector";
import { GlassPanel } from "../ui/GlassPanel";
import { getJobReport } from "../../api/endpoints";

interface PipelineCanvasProps {
  jobId: string;
  stream: JobStreamState;
  summary: JobSummary | null;
  onRefresh?: () => void;
}

export const PipelineCanvas: React.FC<PipelineCanvasProps> = ({
  jobId,
  stream,
  summary,
  onRefresh,
}) => {
  const navigate = useNavigate();
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    tested: boolean;
    valid: boolean;
  } | null>(null);

  // Compute status for serial nodes based on current stream stage
  const stage = stream.stage;
  const isComplete = stream.isComplete || summary?.status === "COMPLETED";
  const isFailed = stream.isFailed || summary?.status === "FAILED";

  const getSerialStageStatus = (stageName: string) => {
    if (isFailed) return "failed";
    if (isComplete) return "completed";
    if (!stage) return "pending";

    const stagesOrder = [
      "QUEUED",
      "LOADING",
      "FINGERPRINTING",
      "FEATURE_EXTRACTION",
      "MODEL_LOADING",
      "PARALLEL_ANALYSIS",
      "FUSION",
      "DECISION",
      "AUDIT",
      "REPORT",
      "COMPLETED",
    ];

    const currentIdx = stagesOrder.indexOf(stage);
    const targetIdx = stagesOrder.indexOf(stageName);

    if (currentIdx === -1 || targetIdx === -1) return "pending";
    if (currentIdx > targetIdx) return "completed";
    if (currentIdx === targetIdx) return "running";
    return "pending";
  };

  const handleDownloadReport = async () => {
    try {
      setDownloadingReport(true);
      const res = await getJobReport(jobId);
      const blob = new Blob([JSON.stringify(res.report, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tejas-cv-report-${jobId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download report", e);
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleVerifySignature = async () => {
    try {
      const res = await getJobReport(jobId);
      setVerificationResult({ tested: true, valid: res.signature_valid });
    } catch {
      setVerificationResult({ tested: true, valid: false });
    }
  };

  const activeDecision = stream.decision || summary?.decision || null;
  const activeRisk = stream.riskScore !== null ? stream.riskScore : summary?.risk_score ?? null;
  const activeConfidence =
    stream.confidence !== null ? stream.confidence : summary?.confidence ?? null;

  return (
    <div className="relative min-h-screen pb-16">
      {/* Slow scanline sweep on the hero screen only */}
      <div className="scanline-sweep" />

      {/* Hero Header Strip */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold">
                JOB ID: {jobId}
              </span>
              {summary?.label && (
                <span className="text-xs font-mono text-slate-300 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                  {summary.label}
                </span>
              )}
              {stream.usingPolling && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  POLLING FALLBACK ACTIVE
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono flex items-center gap-2">
              Live Assurance Pipeline
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/jobs/${jobId}/evidence`}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <FileSearch className="w-3.5 h-3.5 text-cyan-400" />
              <span>Evidence Ledger</span>
            </Link>

            <Link
              to={`/jobs/${jobId}/provenance`}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5 text-violet-400" />
              <span>Provenance Graph</span>
            </Link>

            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-colors"
                title="Refresh Status"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-white/10">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">
              PIPELINE STAGE:{" "}
              <span className="text-cyan-300 font-bold uppercase">
                {stream.stage || summary?.stage || "INITIALIZING"}
              </span>
            </span>
            <span className="text-cyan-400 font-bold">
              {Math.round(stream.progress || summary?.progress || 0)}%
            </span>
          </div>

          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-violet-500 to-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${stream.progress || summary?.progress || 0}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
            <span className="truncate max-w-xl text-slate-300 font-mono">
              {stream.message || "Assurance pipeline active..."}
            </span>
            <span className="text-slate-500 text-[10px] shrink-0">
              {isComplete ? "VERIFICATION SEALED" : "AIR-GAPPED THREADS"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Pipeline Canvas (Left) + "WHY?" Inspector Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: The Visual Pipeline (8 or 12 cols) */}
        <div className={`${isComplete ? "lg:col-span-8" : "lg:col-span-12"} space-y-4`}>
          {/* 1. Top Serial Stage Nodes */}
          <div className="p-4 rounded-2xl bg-black/30 border border-white/5">
            <div className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Serial Ingestion & Extraction Stages
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StageNode
                label="Fingerprint"
                sublabel="Merkle Tree Leaves"
                status={getSerialStageStatus("FINGERPRINTING")}
              />
              <StageNode
                label="Features"
                sublabel="Visual Embedder"
                status={getSerialStageStatus("FEATURE_EXTRACTION")}
              />
              <StageNode
                label="Model Load"
                sublabel="Architecture Verify"
                status={getSerialStageStatus("MODEL_LOADING")}
              />
            </div>
          </div>

          <FlowConnector active={!isComplete && !isFailed} height={28} />

          {/* 2. Four Parallel Engine Cards */}
          <div>
            <div className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest mb-2 px-1">
              Parallel Assurance Engines (Simultaneous Execution)
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <EngineCard
                engine="data"
                name="Data Integrity"
                icon={Database}
                progress={stream.engineStates.data.progress}
                message={stream.engineStates.data.message}
                completed={stream.engineStates.data.completed}
                score={stream.engineScores?.data ?? summary?.engine_scores?.data}
                duration_s={stream.engineStates.data.duration_s}
                error={stream.engineStates.data.error}
                findings={stream.engineStates.data.findings}
                checks={stream.engineStates.data.checks}
                onViewEvidence={() => navigate(`/jobs/${jobId}/evidence?engine=data`)}
              />

              <EngineCard
                engine="model"
                name="Model Integrity"
                icon={BrainCircuit}
                progress={stream.engineStates.model.progress}
                message={stream.engineStates.model.message}
                completed={stream.engineStates.model.completed}
                score={stream.engineScores?.model ?? summary?.engine_scores?.model}
                duration_s={stream.engineStates.model.duration_s}
                error={stream.engineStates.model.error}
                findings={stream.engineStates.model.findings}
                checks={stream.engineStates.model.checks}
                onViewEvidence={() => navigate(`/jobs/${jobId}/evidence?engine=model`)}
              />

              <EngineCard
                engine="provenance"
                name="Provenance Chain"
                icon={GitBranch}
                progress={stream.engineStates.provenance.progress}
                message={stream.engineStates.provenance.message}
                completed={stream.engineStates.provenance.completed}
                score={stream.engineScores?.provenance ?? summary?.engine_scores?.provenance}
                duration_s={stream.engineStates.provenance.duration_s}
                error={stream.engineStates.provenance.error}
                findings={stream.engineStates.provenance.findings}
                checks={stream.engineStates.provenance.checks}
                onViewEvidence={() => navigate(`/jobs/${jobId}/evidence?engine=provenance`)}
              />

              <EngineCard
                engine="drift"
                name="Shift & Drift"
                icon={Wind}
                progress={stream.engineStates.drift.progress}
                message={stream.engineStates.drift.message}
                completed={stream.engineStates.drift.completed}
                score={stream.engineScores?.drift ?? summary?.engine_scores?.drift}
                duration_s={stream.engineStates.drift.duration_s}
                error={stream.engineStates.drift.error}
                findings={stream.engineStates.drift.findings}
                checks={stream.engineStates.drift.checks}
                onViewEvidence={() => navigate(`/jobs/${jobId}/evidence?engine=drift`)}
              />
            </div>
          </div>

          <FlowConnector active={!isComplete && !isFailed} height={28} />

          {/* 3. Evidence Fusion Node */}
          <FusionNode
            active={stage === "FUSION" || isComplete}
            riskScore={activeRisk}
            confidence={activeConfidence}
          />

          <FlowConnector active={!isComplete && !isFailed} height={28} />

          {/* 4. Decision Node — THE HERO READOUT (≥48px font size) */}
          <DecisionHeroNode
            decision={activeDecision}
            isComplete={isComplete}
            isFailed={isFailed}
          />

          <FlowConnector active={false} height={28} />

          {/* 5. Sealed Audit Block Node */}
          <AuditSealNode
            auditBlock={stream.auditBlock ?? (summary as any)?.audit_block ?? null}
            jobId={jobId}
            onDownloadReport={handleDownloadReport}
          />
        </div>

        {/* Right: "WHY?" Forensic Explanation & Action Panel (Visible after or during completion) */}
        {isComplete && summary && (
          <div className="lg:col-span-4 space-y-4">
            <GlassPanel className="p-5 border-white/10 sticky top-20">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                    Assurance Rationale ("WHY?")
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                  DECISION EXPLAINED
                </span>
              </div>

              {/* Primary reasons */}
              <div className="space-y-2 mb-4">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Primary Reasons
                </div>
                {summary.primary_reasons && summary.primary_reasons.length > 0 ? (
                  <div className="space-y-1.5">
                    {summary.primary_reasons.map((reason: any, idx) => {
                      const isObj = typeof reason === "object" && reason !== null;
                      const title = isObj ? reason.title || reason.reason || JSON.stringify(reason) : String(reason);
                      const severity = isObj ? reason.severity : null;
                      const engine = isObj ? reason.engine : null;
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-black/40 border border-white/5 text-xs font-sans text-slate-200 leading-relaxed flex items-start gap-2"
                        >
                          <span className="text-cyan-400 font-mono font-bold mt-0.5">•</span>
                          <div className="flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {severity && (
                                <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                  severity === "CRITICAL" || severity === "HIGH" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"
                                }`}>
                                  {severity}
                                </span>
                              )}
                              {engine && (
                                <span className="text-[9px] font-mono text-slate-400 uppercase">
                                  [{engine}]
                                </span>
                              )}
                            </div>
                            <span className="block text-slate-200">{title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic p-2 rounded bg-black/20">
                    No integrity anomalies detected. Baseline and cryptographic checks passed.
                  </div>
                )}
              </div>

              {/* Rules Fired */}
              {summary.rules_fired && summary.rules_fired.length > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                    Rules Fired ({summary.rules_fired.length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {summary.rules_fired.map((rf, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-mono"
                      >
                        <div className="flex items-center justify-between text-amber-300 font-bold mb-0.5">
                          <span>{rf.rule}</span>
                          <span className="text-[10px] uppercase text-rose-400">
                            → {rf.effect}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-sans">{rf.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Action */}
              {summary.recommended_action && (
                <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-500/30 mb-4">
                  <span className="text-[10px] font-mono font-bold text-violet-300 uppercase tracking-wider block mb-1">
                    Recommended Action
                  </span>
                  <p className="text-xs font-sans text-slate-200 leading-relaxed">
                    {summary.recommended_action}
                  </p>
                </div>
              )}

              {/* Coverage stats */}
              {summary.coverage && (
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 mb-4 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Coverage Ratio:</span>
                    <span className="text-cyan-300 font-bold">
                      {summary.coverage.ratio !== undefined
                        ? `${(summary.coverage.ratio * 100).toFixed(0)}%`
                        : "100%"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Checks Executed:</span>
                    <span className="text-slate-200">{summary.coverage.executed ?? "—"}</span>
                  </div>
                  {summary.coverage.unavailable ? (
                    <div className="flex items-center justify-between text-amber-400 text-[11px]">
                      <span>Checks Unavailable:</span>
                      <span>{summary.coverage.unavailable}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <Link
                  to={`/jobs/${jobId}/evidence`}
                  className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <FileSearch className="w-4 h-4" />
                  <span>Inspect Forensic Evidence</span>
                </Link>

                <Link
                  to={`/jobs/${jobId}/provenance`}
                  className="w-full py-2.5 px-3 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <GitBranch className="w-4 h-4" />
                  <span>View Provenance Graph</span>
                </Link>

                <button
                  onClick={handleDownloadReport}
                  disabled={downloadingReport}
                  className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-mono flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>{downloadingReport ? "Exporting..." : "Download Signed Report (JSON)"}</span>
                </button>

                <button
                  onClick={handleVerifySignature}
                  className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-mono flex items-center justify-center gap-2 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Verify Ed25519 Signature</span>
                </button>

                {verificationResult && (
                  <div
                    className={`p-2 rounded-lg text-xs font-mono text-center border ${
                      verificationResult.valid
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                    }`}
                  >
                    {verificationResult.valid
                      ? "✓ Signature Valid — Digitally Signed by TEJAS-CV Core"
                      : "✕ Signature Invalid or Corrupted"}
                  </div>
                )}
              </div>
            </GlassPanel>
          </div>
        )}
      </div>
    </div>
  );
};
