import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UploadCloud,
  BrainCircuit,
  Play,
  CheckCircle2,
  ChevronRight,
  History,
  Activity,
  AlertCircle,
  FileArchive,
  Zap,
  Database,
  Layers,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  FileCheck,
  User as UserIcon,
  Lock,
  Sparkles,
  Filter,
  AlertTriangle,
  ArrowRight,
  Download,
  Eye,
  FileText,
  RotateCcw,
  X,
  Shield,
  ArrowUpRight,
  BarChart3,
  HelpCircle,
} from "lucide-react";
import { GlassPanel } from "../components/ui/GlassPanel";
import { DecisionBadge } from "../components/ui/DecisionBadge";
import { HashText } from "../components/ui/HashText";
import { ImagePropertiesDialog } from "../components/assets/ImagePropertiesDialog";
import { PipelineCanvas } from "../components/pipeline/PipelineCanvas";
import { useAuth } from "../hooks/useAuth";
import { useSystemStatus } from "../hooks/useSystemStatus";
import { useLedgerGuard } from "../hooks/useLedgerGuard";
import { useJobStream } from "../api/ws";
import {
  listAssets,
  getAsset,
  uploadModel,
  trainMlModel,
  listBaselines,
  listTrustedModels,
  startJob,
  getJob,
  getJobSummary,
  getJobFindings,
  getJobReport,
  getProvenanceGraph,
  getTestPacks,
  ingestTestPack,
  uploadDatasetXHR,
  listSamples,
  getSampleImageUrl,
} from "../api/endpoints";
import { formatBytes, formatDateTime } from "../lib/format";
import { Asset, Job, JobSummary, Finding, TestPackCase, Baseline } from "../types/api";

export const WorkspacePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, permissions } = useAuth();
  const { systemStatus, isCompromised } = useSystemStatus();

  const datasetParam = searchParams.get("dataset") || "";
  const modelParam = searchParams.get("model") || "";
  const baselineParam = searchParams.get("baseline") || "";
  const jobParam = searchParams.get("job") || "";

  // Auto-calculate current active step based on URL query state
  const [activeStep, setActiveStep] = useState<number>(() => {
    if (jobParam) return 3; // Step 3 embeds Live Pipeline while running; once complete, step 4 can be viewed
    if (modelParam) return 3;
    if (datasetParam) return 2;
    return 1;
  });

  const updateParams = (updates: Partial<{ dataset: string; model: string; baseline: string; job: string }>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v) next.set(k, v);
        else next.delete(k);
      });
      return next;
    }, { replace: true });
  };

  // Fetch current selected dataset
  const { data: selectedDataset } = useQuery({
    queryKey: ["asset", datasetParam],
    queryFn: () => getAsset(datasetParam),
    enabled: !!datasetParam,
  });

  // Fetch current selected model
  const { data: selectedModel } = useQuery({
    queryKey: ["asset", modelParam],
    queryFn: () => getAsset(modelParam),
    enabled: !!modelParam,
  });

  // Job stream for embedded live pipeline
  const jobStream = useJobStream(jobParam || undefined);

  // Job summary when a job is active
  const { data: jobSummary, refetch: refetchJobSummary } = useQuery({
    queryKey: ["jobSummary", jobParam],
    queryFn: () => getJobSummary(jobParam),
    enabled: !!jobParam,
    refetchInterval: jobStream.isComplete ? false : 2000,
  });

  // If job completes and activeStep is 3, automatically offer/advance to Step 4 Insights
  useEffect(() => {
    if (jobParam && (jobStream.isComplete || jobSummary?.status === "COMPLETED") && activeStep === 3) {
      setActiveStep(4);
    }
  }, [jobParam, jobStream.isComplete, jobSummary?.status, activeStep]);

  const steps = [
    { id: 1, label: "1. Data Source", icon: UploadCloud, done: !!datasetParam },
    { id: 2, label: "2. Target Model", icon: BrainCircuit, done: !!modelParam },
    { id: 3, label: "3. Integrity Assessment", icon: Play, done: !!jobParam },
    { id: 4, label: "4. Insights & Assurance", icon: BarChart3, done: !!(jobSummary?.status === "COMPLETED") },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white flex items-center gap-2">
            Workspace
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-normal">
              Session Preserved
            </span>
          </h1>
          <p className="text-slate-400 font-mono text-xs sm:text-sm mt-1">
            End-to-End MLOps Pipeline: Data Ingestion → Model Assurance → Live Evaluation → Forensic Insights
          </p>
        </div>

        {/* Action bar for active session */}
        {(datasetParam || modelParam || jobParam) && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                updateParams({ dataset: "", job: "" });
                setActiveStep(1);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Clears dataset and assessment job, keeping model & baseline"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Start Another Data Run</span>
            </button>
          </div>
        )}
      </div>

      {/* Stepper Navigation */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-4 overflow-x-auto">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = activeStep === s.id;
          const isDone = s.done;

          return (
            <React.Fragment key={s.id}>
              <button
                onClick={() => setActiveStep(s.id)}
                className={`flex items-center gap-3 p-2 rounded-xl transition-all font-mono text-xs cursor-pointer ${
                  isActive
                    ? "bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 shadow-glow-cyan"
                    : isDone
                    ? "text-emerald-400 hover:bg-white/5"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                    isActive
                      ? "border-cyan-400 bg-cyan-500/20 text-cyan-300"
                      : isDone
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-white/10 bg-black/40 text-slate-500"
                  }`}
                >
                  {isDone && !isActive ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <div className="text-left hidden md:block">
                  <div className="font-bold uppercase tracking-wider">{s.label}</div>
                  <div className="text-[10px] text-slate-500 font-normal">
                    {s.id === 1 && (selectedDataset ? selectedDataset.name : "Select or ingest data")}
                    {s.id === 2 && (selectedModel ? selectedModel.name : "Select or train model")}
                    {s.id === 3 && (jobParam ? `Job ${jobParam.slice(0, 8)}` : "Configure & run")}
                    {s.id === 4 && (jobSummary?.decision ? `${jobSummary.decision} verdict` : "Review results")}
                  </div>
                </div>
              </button>
              {idx < steps.length - 1 && (
                <div className="flex-1 h-px bg-white/10 min-w-[20px]" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Summary Chips Bar */}
      {(selectedDataset || selectedModel || jobParam) && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5 font-mono text-xs">
          <span className="text-slate-500 text-[11px] uppercase tracking-wider px-2">Active Session:</span>
          {selectedDataset && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
              <Database className="w-3 h-3 text-cyan-400" />
              <span>Data: <strong className="text-white">{selectedDataset.name}</strong></span>
              <button
                onClick={() => setActiveStep(1)}
                className="ml-1 text-[10px] text-cyan-400 hover:text-white underline cursor-pointer"
              >
                Change
              </button>
            </div>
          )}

          {selectedModel && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300">
              <BrainCircuit className="w-3 h-3 text-purple-400" />
              <span>Model: <strong className="text-white">{selectedModel.name}</strong></span>
              <button
                onClick={() => setActiveStep(2)}
                className="ml-1 text-[10px] text-purple-400 hover:text-white underline cursor-pointer"
              >
                Change
              </button>
            </div>
          )}

          {baselineParam && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300">
              <ShieldCheck className="w-3 h-3 text-blue-400" />
              <span>Baseline: <strong className="text-white">{baselineParam}</strong></span>
            </div>
          )}

          {jobParam && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <Play className="w-3 h-3 text-emerald-400" />
              <span>Job: <strong className="text-white">{jobParam.slice(0, 8)}</strong></span>
              {jobSummary?.decision && <DecisionBadge decision={jobSummary.decision} size="sm" />}
              <button
                onClick={() => setActiveStep(4)}
                className="ml-1 text-[10px] text-emerald-400 hover:text-white underline cursor-pointer"
              >
                Insights
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step Contents */}
      <div className="mt-4">
        {activeStep === 1 && (
          <Step1DataSource
            selectedDatasetId={datasetParam}
            onSelectDataset={(id) => {
              updateParams({ dataset: id });
              setActiveStep(2);
            }}
          />
        )}

        {activeStep === 2 && (
          <Step2Model
            selectedDatasetId={datasetParam}
            selectedModelId={modelParam}
            onSelectModel={(id) => {
              updateParams({ model: id });
              setActiveStep(3);
            }}
            onBack={() => setActiveStep(1)}
          />
        )}

        {activeStep === 3 && (
          <Step3Assess
            selectedDatasetId={datasetParam}
            selectedModelId={modelParam}
            baselineId={baselineParam}
            onSetBaseline={(id) => updateParams({ baseline: id })}
            jobId={jobParam}
            onStartJob={(id) => {
              updateParams({ job: id });
            }}
            onViewInsights={() => setActiveStep(4)}
            onBack={() => setActiveStep(2)}
          />
        )}

        {activeStep === 4 && (
          <Step4Insights
            jobId={jobParam}
            selectedDatasetId={datasetParam}
            onStartAnother={() => {
              updateParams({ dataset: "", job: "" });
              setActiveStep(1);
            }}
            onBackToPipeline={() => setActiveStep(3)}
          />
        )}
      </div>
    </div>
  );
};

/* ====================================================================================================
 * STEP 1: DATA SOURCE (4 cards: My Upload, Existing Dataset, Test Pack, Demo Sets)
 * ==================================================================================================== */

interface Step1Props {
  selectedDatasetId: string;
  onSelectDataset: (id: string) => void;
}

const Step1DataSource: React.FC<Step1Props> = ({ selectedDatasetId, onSelectDataset }) => {
  const { user } = useAuth();
  const { systemStatus } = useSystemStatus();
  const isClient = user?.role === "client";

  // Active sub-tab in step 1
  const [tab, setTab] = useState<"upload" | "existing" | "test_pack" | "demo">(() => {
    return isClient ? "existing" : "upload";
  });

  return (
    <div className="space-y-6">
      {/* 4 Cards Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: My Upload */}
        <div
          onClick={() => !isClient && setTab("upload")}
          className={`relative p-5 rounded-xl border transition-all cursor-pointer ${
            tab === "upload"
              ? "bg-cyan-500/10 border-cyan-400 shadow-glow-cyan text-white"
              : isClient
              ? "bg-black/20 border-white/5 opacity-50 cursor-not-allowed"
              : "bg-black/40 border-white/10 hover:border-white/20 text-slate-300"
          }`}
          title={isClient ? "Operator or Admin role required to upload data" : undefined}
        >
          {isClient && (
            <div className="absolute top-3 right-3 text-slate-500" title="Operator or Admin required">
              <Lock className="w-4 h-4" />
            </div>
          )}
          <UploadCloud className={`w-8 h-8 mb-3 ${tab === "upload" ? "text-cyan-400" : "text-slate-400"}`} />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider mb-1">My Upload</h3>
          <p className="font-mono text-xs text-slate-400">
            ZIP archive with Classification, YOLO, or COCO annotations.
          </p>
        </div>

        {/* Card 2: Existing Dataset */}
        <div
          onClick={() => setTab("existing")}
          className={`p-5 rounded-xl border transition-all cursor-pointer ${
            tab === "existing"
              ? "bg-cyan-500/10 border-cyan-400 shadow-glow-cyan text-white"
              : "bg-black/40 border-white/10 hover:border-white/20 text-slate-300"
          }`}
        >
          <Database className={`w-8 h-8 mb-3 ${tab === "existing" ? "text-cyan-400" : "text-slate-400"}`} />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider mb-1">Existing Dataset</h3>
          <p className="font-mono text-xs text-slate-400">
            Browse registered datasets with thumbnail preview strip.
          </p>
        </div>

        {/* Card 3: Test Pack */}
        <div
          onClick={() => !isClient && setTab("test_pack")}
          className={`relative p-5 rounded-xl border transition-all cursor-pointer ${
            tab === "test_pack"
              ? "bg-cyan-500/10 border-cyan-400 shadow-glow-cyan text-white"
              : isClient
              ? "bg-black/20 border-white/5 opacity-50 cursor-not-allowed"
              : "bg-black/40 border-white/10 hover:border-white/20 text-slate-300"
          }`}
          title={isClient ? "Operator or Admin role required to ingest test packs" : undefined}
        >
          {isClient && (
            <div className="absolute top-3 right-3 text-slate-500" title="Operator or Admin required">
              <Lock className="w-4 h-4" />
            </div>
          )}
          <Layers className={`w-8 h-8 mb-3 ${tab === "test_pack" ? "text-cyan-400" : "text-slate-400"}`} />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider mb-1">Test Pack</h3>
          <p className="font-mono text-xs text-slate-400">
            Known-verdict synthetic cases (ACCEPT, REVIEW, QUARANTINE, REJECTED).
          </p>
        </div>

        {/* Card 4: Demo Sets */}
        <div
          onClick={() => setTab("demo")}
          className={`p-5 rounded-xl border transition-all cursor-pointer ${
            tab === "demo"
              ? "bg-cyan-500/10 border-cyan-400 shadow-glow-cyan text-white"
              : "bg-black/40 border-white/10 hover:border-white/20 text-slate-300"
          }`}
        >
          <Sparkles className={`w-8 h-8 mb-3 ${tab === "demo" ? "text-cyan-400" : "text-slate-400"}`} />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider mb-1">Demo Sets</h3>
          <p className="font-mono text-xs text-slate-400">
            Pre-bootstrapped clean baseline, poisoned data, and environmental drift.
          </p>
        </div>
      </div>

      {/* Card Content Views */}
      <GlassPanel className="p-6 border-white/10">
        {tab === "upload" && <UploadDataPanel onSelectDataset={onSelectDataset} />}
        {tab === "existing" && (
          <ExistingDatasetPicker
            selectedId={selectedDatasetId}
            onSelectDataset={onSelectDataset}
          />
        )}
        {tab === "test_pack" && <TestPackPicker onSelectDataset={onSelectDataset} />}
        {tab === "demo" && <DemoSetsPicker onSelectDataset={onSelectDataset} />}
      </GlassPanel>
    </div>
  );
};

/* --- Sub-component: UploadDataPanel (My Upload) --- */
const UploadDataPanel: React.FC<{ onSelectDataset: (id: string) => void }> = ({ onSelectDataset }) => {
  const { user } = useAuth();
  const { systemStatus } = useSystemStatus();
  const queryClient = useQueryClient();

  const [format, setFormat] = useState<"classification" | "yolo" | "coco">("classification");
  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [contributor, setContributor] = useState(user?.username || "operator");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isHashing, setIsHashing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [registeredAsset, setRegisteredAsset] = useState<Asset | null>(null);

  const limits = systemStatus?.limits;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      setFile(f);
      setErrorMsg("");
      if (!datasetName) setDatasetName(f.name.replace(/\.zip$/i, ""));
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setIsHashing(false);
    setErrorMsg("");
    setRegisteredAsset(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", datasetName.trim() || file.name.replace(/\.zip$/i, ""));
    fd.append("contributor", contributor.trim() || user?.username || "operator");
    fd.append("format", format);

    try {
      const asset = await uploadDatasetXHR(fd, (pct) => {
        setUploadProgress(pct);
        if (pct >= 100) {
          setIsHashing(true);
        }
      });
      setIsUploading(false);
      setIsHashing(false);
      setRegisteredAsset(asset);
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch (err: any) {
      setIsUploading(false);
      setIsHashing(false);
      setUploadProgress(0);
      setErrorMsg(err.message || "Upload failed");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto font-mono">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Upload Archive & Ingest</h2>
        <p className="text-xs text-slate-400">
          Upload and verify a dataset archive against cryptographic integrity rules.
        </p>
      </div>

      {/* Format Selector with diagrams */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">
          Dataset Format Structure
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setFormat("classification")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              format === "classification"
                ? "bg-cyan-500/15 border-cyan-400 text-cyan-300"
                : "bg-black/40 border-white/10 text-slate-400 hover:border-white/20"
            }`}
          >
            <div className="font-bold text-xs uppercase mb-1 flex items-center justify-between">
              <span>Classification</span>
              {format === "classification" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
            </div>
            <pre className="text-[10px] bg-black/60 p-2 rounded border border-white/5 text-slate-300 overflow-x-auto">
{`archive.zip
├── class_a/
│   └── 001.png
└── class_b/
    └── 002.png`}
            </pre>
          </button>

          <button
            type="button"
            onClick={() => setFormat("yolo")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              format === "yolo"
                ? "bg-cyan-500/15 border-cyan-400 text-cyan-300"
                : "bg-black/40 border-white/10 text-slate-400 hover:border-white/20"
            }`}
          >
            <div className="font-bold text-xs uppercase mb-1 flex items-center justify-between">
              <span>YOLO Detection</span>
              {format === "yolo" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
            </div>
            <pre className="text-[10px] bg-black/60 p-2 rounded border border-white/5 text-slate-300 overflow-x-auto">
{`archive.zip
├── data.yaml
├── images/
│   └── 001.png
└── labels/
    └── 001.txt`}
            </pre>
          </button>

          <button
            type="button"
            onClick={() => setFormat("coco")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              format === "coco"
                ? "bg-cyan-500/15 border-cyan-400 text-cyan-300"
                : "bg-black/40 border-white/10 text-slate-400 hover:border-white/20"
            }`}
          >
            <div className="font-bold text-xs uppercase mb-1 flex items-center justify-between">
              <span>COCO Detection</span>
              {format === "coco" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
            </div>
            <pre className="text-[10px] bg-black/60 p-2 rounded border border-white/5 text-slate-300 overflow-x-auto">
{`archive.zip
├── annotations.json
└── images/
    └── 001.png`}
            </pre>
          </button>
        </div>
      </div>

      {/* Real Limits Display from systemStatus */}
      <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-slate-500 text-[10px] uppercase block">Max Size</span>
          <span className="text-slate-200 font-bold">
            {limits ? formatBytes(limits.max_archive_bytes) : "1 GB"}
          </span>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] uppercase block">Max Files</span>
          <span className="text-slate-200 font-bold">
            {limits ? limits.max_files.toLocaleString() : "10,000,000"}
          </span>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] uppercase block">Max Analysis</span>
          <span className="text-slate-200 font-bold">
            {limits ? limits.max_analysis_samples.toLocaleString() : "2,000"}
          </span>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] uppercase block">Accepted Types</span>
          <span className="text-slate-200 font-bold truncate block" title={limits?.accepted_image_types?.join(", ")}>
            {limits?.accepted_image_types?.slice(0, 3).join(", ") || ".png, .jpg"}...
          </span>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className="border-2 border-dashed border-white/15 rounded-xl p-8 text-center bg-black/40 hover:bg-white/[0.02] transition-colors relative"
      >
        <input
          type="file"
          id="ws-file-upload"
          className="hidden"
          accept=".zip"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              const f = e.target.files[0];
              setFile(f);
              setErrorMsg("");
              if (!datasetName) setDatasetName(f.name.replace(/\.zip$/i, ""));
            }
          }}
          disabled={isUploading}
        />
        <label htmlFor="ws-file-upload" className="cursor-pointer flex flex-col items-center">
          <FileArchive className="w-10 h-10 text-cyan-400 mb-2" />
          <span className="text-xs text-cyan-300 font-bold uppercase tracking-wider hover:underline">
            {file ? "Change Selected ZIP File" : "Select or Drop Dataset ZIP Archive"}
          </span>
          <span className="text-[10px] text-slate-500 mt-1">
            Standard ZIP container containing supported images
          </span>
          {file && (
            <div className="mt-3 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200 flex items-center gap-2">
              <FileCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>{file.name}</span>
              <span className="text-slate-400">({formatBytes(file.size)})</span>
            </div>
          )}
        </label>
      </div>

      {/* Form Fields: Name & Contributor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-slate-400 mb-1 uppercase tracking-wider text-[11px]">
            Dataset Name
          </label>
          <input
            type="text"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            placeholder="e.g. coastal-surveillance-v1"
            disabled={isUploading}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400 transition-colors"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 uppercase tracking-wider text-[11px]">
            Attributed Contributor
          </label>
          <input
            type="text"
            value={contributor}
            onChange={(e) => setContributor(e.target.value)}
            placeholder="lab-alpha"
            disabled={isUploading}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400 transition-colors"
          />
        </div>
      </div>

      {/* Upload Progress Bar */}
      {isUploading && (
        <div className="space-y-2 p-4 rounded-xl bg-black/60 border border-cyan-500/30 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-cyan-300 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              {isHashing ? "Hashing and registering in ledger..." : `Uploading (${uploadProgress}%)...`}
            </span>
            <span className="text-slate-400">{uploadProgress}%</span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error / Rejection Card */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs space-y-1">
          <div className="font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <span>Upload Rejected at Ingestion Gate</span>
          </div>
          <p className="text-rose-200 whitespace-pre-wrap">{errorMsg}</p>
          <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mt-2">
            Recorded in audit ledger as INGESTION_REJECTED
          </div>
        </div>
      )}

      {/* Result Card: Registered Dataset */}
      {registeredAsset && (
        <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Dataset Successfully Ingested & Verified</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
              {registeredAsset.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-slate-400 block">Name:</span>
              <strong className="text-white">{registeredAsset.name}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Samples:</span>
              <strong className="text-white">{registeredAsset.meta?.sample_count ?? 0} images</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Contributor:</span>
              <strong className="text-white">{registeredAsset.contributor}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Attribution:</span>
              <strong className="text-white">@{registeredAsset.uploaded_by || user?.username}</strong>
            </div>
          </div>

          <div>
            <span className="text-slate-400 text-[10px] block mb-1">Merkle Root Hash:</span>
            <HashText hash={registeredAsset.sha256} />
          </div>

          {registeredAsset.meta?.classes && (
            <div>
              <span className="text-slate-400 text-[10px] block mb-1">Classes:</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(registeredAsset.meta.classes).map(([cls, count]) => (
                  <span key={cls} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-slate-300">
                    <span className="text-cyan-400">{cls}:</span> {String(count)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => onSelectDataset(registeredAsset.id)}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center gap-2 cursor-pointer shadow-glow-cyan"
            >
              <span>Select & Continue to Step 2: Model</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Action Footer */}
      {!registeredAsset && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-xs uppercase tracking-wider rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-glow-cyan"
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Ingesting...</span>
              </>
            ) : (
              <>
                <span>Upload & Ingest</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

/* --- Sub-component: ExistingDatasetPicker --- */
const ExistingDatasetPicker: React.FC<{
  selectedId: string;
  onSelectDataset: (id: string) => void;
}> = ({ selectedId, onSelectDataset }) => {
  const [search, setSearch] = useState("");
  const [hideTestPacks, setHideTestPacks] = useState(true);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ["assets", "dataset"],
    queryFn: () => listAssets("dataset"),
  });

  const filtered = useMemo(() => {
    if (!datasets) return [];
    return datasets.filter((d) => {
      if (hideTestPacks && (d.name.startsWith("[pack") || d.name.startsWith("[bench") || d.name.includes("cifar10"))) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.contributor.toLowerCase().includes(q);
      }
      return true;
    });
  }, [datasets, search, hideTestPacks]);

  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search datasets by name, ID, or contributor..."
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
          />
        </div>
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer text-[11px] select-none">
          <input
            type="checkbox"
            checked={hideTestPacks}
            onChange={(e) => setHideTestPacks(e.target.checked)}
            className="rounded bg-black/40 border-white/20 accent-cyan-400"
          />
          <span>Hide benchmark & test packs</span>
        </label>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-500">Loading registered datasets...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-500 border border-dashed border-white/10 rounded-xl">
          No datasets match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
          {filtered.map((d) => {
            const isSelected = selectedId === d.id;
            return (
              <div
                key={d.id}
                onClick={() => onSelectDataset(d.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-cyan-500/15 border-cyan-400 shadow-glow-cyan"
                    : "bg-black/40 border-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h4 className="font-bold text-white text-xs">{d.name}</h4>
                    <span className="text-[10px] text-slate-500">{d.id}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                    {d.meta?.sample_count ?? 0} images
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 space-y-1 mb-3">
                  <div>Uploader: @{d.uploaded_by || "system"} · Contributor: {d.contributor}</div>
                  <div>Created: {formatDateTime(d.created_at)}</div>
                </div>

                {/* Thumbnail strip preview */}
                <DatasetThumbnailStrip datasetId={d.id} />

                <div className="mt-3 flex justify-end">
                  <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                    isSelected ? "text-cyan-300" : "text-slate-400"
                  }`}>
                    {isSelected ? "Selected ✓" : "Select Dataset →"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* --- Sub-component: DatasetThumbnailStrip --- */
const DatasetThumbnailStrip: React.FC<{ datasetId: string }> = ({ datasetId }) => {
  const { data: samplesData } = useQuery({
    queryKey: ["assetSamples", datasetId, 0, 6],
    queryFn: () => listSamples(datasetId, 0, 6),
    staleTime: 60_000,
  });

  const samples = samplesData?.items || [];
  if (samples.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-hidden py-1">
      {samples.map((s) => (
        <div key={s.id} className="w-10 h-10 rounded border border-white/10 overflow-hidden bg-black/60 shrink-0">
          <img
            src={getSampleImageUrl(datasetId, s.id)}
            alt={s.relpath}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
};

/* --- Sub-component: TestPackPicker --- */
const TestPackPicker: React.FC<{ onSelectDataset: (id: string) => void }> = ({ onSelectDataset }) => {
  const queryClient = useQueryClient();
  const [verdictFilter, setVerdictFilter] = useState<string>("ALL");
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [rejectionNotice, setRejectionNotice] = useState<string | null>(null);

  const { data: packs, isLoading } = useQuery({
    queryKey: ["testPacks"],
    queryFn: getTestPacks,
  });

  const handleIngestCase = async (packCase: TestPackCase) => {
    setIngestingId(packCase.id);
    setRejectionNotice(null);
    try {
      const asset = await ingestTestPack(packCase.scale, packCase.id);
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      onSelectDataset(asset.id);
    } catch (err: any) {
      setRejectionNotice(err.message || "Failed to ingest test pack case");
    } finally {
      setIngestingId(null);
    }
  };

  const filteredPacks = useMemo(() => {
    if (!packs) return [];
    if (verdictFilter === "ALL") return packs;
    return packs.filter((p) => {
      const exp = Array.isArray(p.expected) ? p.expected[0] : p.expected;
      return exp.toUpperCase() === verdictFilter;
    });
  }, [packs, verdictFilter]);

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500 font-mono text-xs">Scanning test packs...</div>;
  }

  if (!packs || packs.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-dashed border-white/10 text-center font-mono space-y-3">
        <Layers className="w-10 h-10 text-cyan-400 mx-auto" />
        <h3 className="text-sm font-bold text-white">No Test Packs Found</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Generate pre-fabricated test scenarios covering ACCEPT, REVIEW, QUARANTINE, and REJECTED verdicts.
        </p>
        <div className="inline-block p-3 rounded-lg bg-black/60 border border-white/10 text-xs text-cyan-300 select-all">
          python scripts\test_packs.py generate --scale small
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Verdict Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {["ALL", "ACCEPT", "REVIEW", "QUARANTINE", "REJECTED"].map((v) => (
          <button
            key={v}
            onClick={() => setVerdictFilter(v)}
            className={`px-3 py-1 rounded-lg border text-xs cursor-pointer transition-colors ${
              verdictFilter === v
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold"
                : "bg-black/40 border-white/5 text-slate-400 hover:text-white"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {rejectionNotice && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/40 text-rose-300 rounded-lg">
          <div className="font-bold">Ingestion Gate Response:</div>
          <div>{rejectionNotice}</div>
        </div>
      )}

      {/* Cases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
        {filteredPacks.map((c) => {
          const exp = Array.isArray(c.expected) ? c.expected[0] : c.expected;
          const isRej = exp === "REJECTED";
          return (
            <div key={`${c.scale}-${c.id}`} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">{c.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  exp === "ACCEPT"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : exp === "REVIEW"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    : exp === "QUARANTINE"
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    : "bg-red-500/20 text-red-300 border border-red-500/40"
                }`}>
                  Expected {exp}
                </span>
              </div>

              <p className="text-[11px] text-slate-400">{c.why}</p>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-slate-500">
                <span>Scale: {c.scale} · {c.images} images</span>
                <button
                  onClick={() => handleIngestCase(c)}
                  disabled={ingestingId === c.id}
                  className={`px-3 py-1 rounded text-xs font-bold uppercase transition-all cursor-pointer ${
                    isRej
                      ? "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30"
                      : "bg-cyan-500 hover:bg-cyan-400 text-slate-900"
                  }`}
                >
                  {ingestingId === c.id ? "Ingesting..." : "Ingest this case"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* --- Sub-component: DemoSetsPicker --- */
const DemoSetsPicker: React.FC<{ onSelectDataset: (id: string) => void }> = ({ onSelectDataset }) => {
  const { data: datasets } = useQuery({
    queryKey: ["assets", "dataset"],
    queryFn: () => listAssets("dataset"),
  });

  const demoDatasets = useMemo(() => {
    if (!datasets) return [];
    return datasets.filter((d) =>
      d.name.includes("Clean") || d.name.includes("Poisoned") || d.name.includes("Drift") || d.name.includes("baseline")
    );
  }, [datasets]);

  return (
    <div className="space-y-4 font-mono text-xs">
      <p className="text-slate-400">
        Attack Lab pre-bootstrapped datasets for quick testing without manual uploads:
      </p>

      {demoDatasets.length === 0 ? (
        <div className="p-6 text-center text-slate-500 border border-dashed border-white/10 rounded-xl">
          No demo datasets found. Bootstrap Attack Lab from the Attack Lab page first.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {demoDatasets.map((d) => (
            <div
              key={d.id}
              onClick={() => onSelectDataset(d.id)}
              className="p-4 rounded-xl bg-black/40 border border-white/5 hover:border-cyan-400 hover:bg-cyan-500/5 transition-all cursor-pointer space-y-2"
            >
              <div className="font-bold text-white text-xs">{d.name}</div>
              <div className="text-[10px] text-slate-400">{d.meta?.sample_count ?? 0} samples</div>
              <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider pt-2">
                Select Dataset →
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ====================================================================================================
 * STEP 2: TARGET MODEL (Pick existing, Train, or Upload)
 * ==================================================================================================== */

interface Step2Props {
  selectedDatasetId: string;
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  onBack: () => void;
}

const Step2Model: React.FC<Step2Props> = ({
  selectedDatasetId,
  selectedModelId,
  onSelectModel,
  onBack,
}) => {
  const { user } = useAuth();
  const isClient = user?.role === "client";
  const [mode, setMode] = useState<"pick" | "train" | "upload">("pick");
  const [hideTestModels, setHideTestModels] = useState(true);

  // Pick existing models
  const { data: models, isLoading } = useQuery({
    queryKey: ["assets", "model"],
    queryFn: () => listAssets("model"),
  });

  const { data: trusted } = useQuery({
    queryKey: ["trustedModels"],
    queryFn: listTrustedModels,
  });

  const trustedHashes = useMemo(() => {
    return new Set(trusted?.map((t) => t.sha256) || []);
  }, [trusted]);

  const grouped = useMemo(() => {
    if (!models) return { approved: [], trained: [], other: [] };
    const filtered = models.filter((m) => {
      if (hideTestModels && (m.name.includes("[test]") || m.name.includes("synthetic"))) {
        return false;
      }
      return true;
    });

    const approved: Asset[] = [];
    const trained: Asset[] = [];
    const other: Asset[] = [];

    filtered.forEach((m) => {
      if (trustedHashes.has(m.sha256)) approved.push(m);
      else if (m.meta?.training_record) trained.push(m);
      else other.push(m);
    });

    return { approved, trained, other };
  }, [models, trustedHashes, hideTestModels]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-mono text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Step 2: Target Model</h2>
          <p className="text-slate-400">
            Select an approved production model, train a new model on your data, or upload weights.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("pick")}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase transition-colors cursor-pointer ${
              mode === "pick"
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                : "bg-black/40 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            Pick Model
          </button>
          {!isClient && (
            <>
              <button
                onClick={() => setMode("train")}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase transition-colors cursor-pointer ${
                  mode === "train"
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                    : "bg-black/40 border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                Train Model
              </button>
              <button
                onClick={() => setMode("upload")}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase transition-colors cursor-pointer ${
                  mode === "upload"
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                    : "bg-black/40 border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                Upload Weights
              </button>
            </>
          )}
        </div>
      </div>

      {mode === "pick" && (
        <GlassPanel className="p-6 border-white/10 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 uppercase text-[11px]">Available Models by Category</span>
            <label className="flex items-center gap-2 text-slate-400 cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={hideTestModels}
                onChange={(e) => setHideTestModels(e.target.checked)}
                className="rounded bg-black/40 border-white/20 accent-cyan-400"
              />
              <span>Hide test models</span>
            </label>
          </div>

          {/* Group 1: Approved Models */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Approved Production Models ({grouped.approved.length})</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grouped.approved.map((m) => (
                <ModelCard
                  key={m.id}
                  model={m}
                  isSelected={selectedModelId === m.id}
                  isApproved={true}
                  onSelect={() => onSelectModel(m.id)}
                />
              ))}
              {grouped.approved.length === 0 && (
                <div className="text-slate-500 text-xs p-3 border border-white/5 rounded-lg">
                  No approved models registered.
                </div>
              )}
            </div>
          </div>

          {/* Group 2: Trained Here */}
          {grouped.trained.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-white/5">
              <h4 className="text-xs font-bold text-purple-400 flex items-center gap-1.5 uppercase tracking-wider">
                <BrainCircuit className="w-4 h-4" />
                <span>Locally Trained Models ({grouped.trained.length})</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {grouped.trained.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    isSelected={selectedModelId === m.id}
                    isApproved={false}
                    onSelect={() => onSelectModel(m.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 3: Other Uploaded */}
          {grouped.other.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-white/5">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Database className="w-4 h-4" />
                <span>Other Models ({grouped.other.length})</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {grouped.other.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    isSelected={selectedModelId === m.id}
                    isApproved={false}
                    onSelect={() => onSelectModel(m.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      {mode === "train" && (
        <TrainModelPanel
          datasetId={selectedDatasetId}
          onModelCreated={(id) => onSelectModel(id)}
        />
      )}

      {mode === "upload" && (
        <UploadModelPanel onModelUploaded={(id) => onSelectModel(id)} />
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 uppercase tracking-wider"
        >
          ← Back to Data
        </button>
        {selectedModelId && (
          <button
            onClick={() => onSelectModel(selectedModelId)}
            className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold uppercase tracking-wider rounded-lg flex items-center gap-2 shadow-glow-cyan cursor-pointer"
          >
            <span>Continue to Step 3: Assess</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

/* --- Sub-component: ModelCard --- */
const ModelCard: React.FC<{
  model: Asset;
  isSelected: boolean;
  isApproved: boolean;
  onSelect: () => void;
}> = ({ model, isSelected, isApproved, onSelect }) => {
  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border transition-all cursor-pointer font-mono text-xs ${
        isSelected
          ? "bg-cyan-500/15 border-cyan-400 shadow-glow-cyan"
          : "bg-black/40 border-white/10 hover:border-white/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <strong className="text-white text-xs">{model.name}</strong>
        {isApproved ? (
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase font-bold">
            Approved ✓
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10 uppercase">
            Unapproved
          </span>
        )}
      </div>

      <div className="text-[10px] text-slate-500 mb-2">
        Uploaded by @{model.uploaded_by || "system"}
      </div>

      <div className="text-[10px] text-slate-400">
        <span className="block text-slate-500">SHA-256:</span>
        <HashText hash={model.sha256} />
      </div>
    </div>
  );
};

/* --- Sub-component: TrainModelPanel --- */
const TrainModelPanel: React.FC<{
  datasetId: string;
  onModelCreated: (id: string) => void;
}> = ({ datasetId, onModelCreated }) => {
  const [modelName, setModelName] = useState("");
  const [epochs, setEpochs] = useState(5);
  const queryClient = useQueryClient();

  const trainMutation = useMutation({
    mutationFn: () => trainMlModel({ name: modelName, dataset_id: datasetId, epochs }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      alert("Model training job started in background!");
    },
  });

  return (
    <GlassPanel className="p-6 border-white/10 space-y-4 max-w-xl mx-auto">
      <h3 className="text-sm font-bold text-white uppercase">Train Model on Active Dataset</h3>
      <div>
        <label className="block text-slate-400 mb-1 text-xs">Model Name</label>
        <input
          type="text"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="e.g. resnet18-custom-classifier"
          className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400 text-xs"
        />
      </div>
      <div>
        <label className="block text-slate-400 mb-1 text-xs">Epochs: {epochs}</label>
        <input
          type="range"
          min="1"
          max="20"
          value={epochs}
          onChange={(e) => setEpochs(parseInt(e.target.value))}
          className="w-full accent-cyan-400"
        />
      </div>
      <button
        onClick={() => trainMutation.mutate()}
        disabled={!modelName || trainMutation.isPending}
        className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-xs uppercase rounded-lg disabled:opacity-50"
      >
        {trainMutation.isPending ? "Training in progress..." : "Launch Training"}
      </button>
    </GlassPanel>
  );
};

/* --- Sub-component: UploadModelPanel --- */
const UploadModelPanel: React.FC<{ onModelUploaded: (id: string) => void }> = ({ onModelUploaded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      if (name.trim()) fd.append("name", name.trim());
      return uploadModel(fd);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      if (data) onModelUploaded(data.id);
    },
  });

  return (
    <GlassPanel className="p-6 border-white/10 space-y-4 max-w-xl mx-auto">
      <h3 className="text-sm font-bold text-white uppercase">Upload Model Weights</h3>
      <div className="border border-dashed border-white/15 p-6 rounded-xl text-center">
        <input
          type="file"
          id="ws-model-file"
          className="hidden"
          accept=".onnx,.pt,.pth,.bin"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setFile(e.target.files[0]);
              if (!name) setName(e.target.files[0].name.replace(/\.[^.]+$/, ""));
            }
          }}
        />
        <label htmlFor="ws-model-file" className="cursor-pointer text-xs text-cyan-300">
          {file ? file.name : "Select ONNX / PyTorch model file"}
        </label>
      </div>
      <div>
        <label className="block text-slate-400 mb-1 text-xs">Model Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400 text-xs"
        />
      </div>
      <button
        onClick={() => uploadMutation.mutate()}
        disabled={!file || uploadMutation.isPending}
        className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-xs uppercase rounded-lg disabled:opacity-50"
      >
        {uploadMutation.isPending ? "Uploading weights..." : "Upload Weights"}
      </button>
    </GlassPanel>
  );
};

/* ====================================================================================================
 * STEP 3: INTEGRITY ASSESSMENT (Embedded Live Pipeline)
 * ==================================================================================================== */

interface Step3Props {
  selectedDatasetId: string;
  selectedModelId: string;
  baselineId: string;
  onSetBaseline: (id: string) => void;
  jobId: string;
  onStartJob: (id: string) => void;
  onViewInsights: () => void;
  onBack: () => void;
}

const Step3Assess: React.FC<Step3Props> = ({
  selectedDatasetId,
  selectedModelId,
  baselineId,
  onSetBaseline,
  jobId,
  onStartJob,
  onViewInsights,
  onBack,
}) => {
  const { isCompromised } = useSystemStatus();
  const { guardAction, GuardModal } = useLedgerGuard();

  // Baselines query
  const { data: baselines } = useQuery({
    queryKey: ["baselines"],
    queryFn: listBaselines,
  });

  // Default baseline auto-picker
  useEffect(() => {
    if (!baselineId && baselines && baselines.length > 0) {
      onSetBaseline(baselines[0].id);
    }
  }, [baselineId, baselines, onSetBaseline]);

  // Start job mutation
  const assessMutation = useMutation({
    mutationFn: () =>
      startJob({
        dataset_id: selectedDatasetId || null,
        model_id: selectedModelId || null,
        baseline_id: baselineId || null,
        label: "Workspace Assessment",
      }),
    onSuccess: (data) => {
      onStartJob(data.id);
    },
  });

  const handleLaunch = () => {
    guardAction(() => assessMutation.mutate(), "workspace assessment");
  };

  // Live WebSocket stream for running job
  const stream = useJobStream(jobId || undefined);

  // Job summary
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["jobSummary", jobId],
    queryFn: () => getJobSummary(jobId),
    enabled: !!jobId,
    refetchInterval: stream.isComplete ? false : 2000,
  });

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Configuration Panel (shown if no job running or if re-assessing) */}
      <GlassPanel className="p-6 border-white/10 space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Step 3: Integrity Assessment</h2>
            <p className="text-slate-400">
              Configure baseline references and execute multi-engine assurance pipeline.
            </p>
          </div>
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 uppercase tracking-wider"
          >
            ← Back to Model
          </button>
        </div>

        {/* Ledger Warning */}
        {isCompromised && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Warning: Audit Ledger Is Compromised</span>
            </div>
            <p className="text-[11px] text-amber-200">
              A previous block in the ledger chain has an invalid signature or altered hash. The system is
              operating in quarantine enforcement mode. Any assessment executed now will flag the breach.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-400 mb-1 uppercase tracking-wider text-[11px]">
              Reference Baseline
            </label>
            <select
              value={baselineId}
              onChange={(e) => onSetBaseline(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            >
              <option value="">Default Reference Baseline</option>
              {baselines?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Note: The baseline should come from clean, in-distribution data of the same domain.
            </span>
          </div>

          <div className="flex flex-col justify-end">
            <button
              onClick={handleLaunch}
              disabled={assessMutation.isPending}
              className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 shadow-glow-cyan cursor-pointer disabled:opacity-50"
            >
              {assessMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Launching Pipeline...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Run Assessment Pipeline</span>
                </>
              )}
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* Embedded Live Pipeline Canvas */}
      {jobId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/10">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-white font-bold">Live Assurance Pipeline</span>
              <span className="text-slate-500">#{jobId}</span>
            </div>
            {summary?.decision && (
              <div className="flex items-center gap-3">
                <DecisionBadge decision={summary.decision} />
                <button
                  onClick={onViewInsights}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold uppercase text-[11px] flex items-center gap-1.5 shadow-glow-cyan cursor-pointer"
                >
                  <span>View Step 4 Insights</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <PipelineCanvas
            jobId={jobId}
            stream={stream}
            summary={summary || null}
            onRefresh={refetchSummary}
          />
        </div>
      )}

      {GuardModal}
    </div>
  );
};

/* ====================================================================================================
 * STEP 4: INSIGHTS & ASSURANCE (Decision banner, engine score bars, data/model/drift insights, properties dialog)
 * ==================================================================================================== */

interface Step4Props {
  jobId: string;
  selectedDatasetId: string;
  onStartAnother: () => void;
  onBackToPipeline: () => void;
}

const Step4Insights: React.FC<Step4Props> = ({
  jobId,
  selectedDatasetId,
  onStartAnother,
  onBackToPipeline,
}) => {
  const navigate = useNavigate();
  const [selectedEngineFilter, setSelectedEngineFilter] = useState<string | null>(null);
  const [propertiesSampleId, setPropertiesSampleId] = useState<number | null>(null);

  // Job summary
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["jobSummary", jobId],
    queryFn: () => getJobSummary(jobId),
    enabled: !!jobId,
  });

  // Findings
  const { data: findings } = useQuery({
    queryKey: ["jobFindings", jobId, selectedEngineFilter],
    queryFn: () => getJobFindings(jobId, selectedEngineFilter || undefined),
    enabled: !!jobId,
  });

  // Report
  const { data: reportData } = useQuery({
    queryKey: ["jobReport", jobId],
    queryFn: () => getJobReport(jobId),
    enabled: !!jobId,
  });

  // Dataset details to check if test pack case
  const { data: datasetAsset } = useQuery({
    queryKey: ["asset", selectedDatasetId],
    queryFn: () => getAsset(selectedDatasetId),
    enabled: !!selectedDatasetId,
  });

  const report = reportData?.report || {};
  const expectedVerdict = (datasetAsset?.meta as any)?.expected_verdict;
  const actualVerdict = summary?.decision;
  const isMatch = expectedVerdict && actualVerdict && (
    Array.isArray(expectedVerdict)
      ? expectedVerdict.includes(actualVerdict)
      : expectedVerdict === actualVerdict
  );

  const flaggedSampleList: { sample_id: number; relpath?: string; reasons?: string[]; reason?: string }[] = useMemo(() => {
    const list = (report.engines as any)?.data?.flagged_sample_list || [];
    if (list.length > 0) return list;
    const fallback: { sample_id: number; relpath?: string; reasons?: string[]; reason?: string }[] = [];
    (findings || []).forEach((f) => {
      const ev = f.evidence || {};
      if (typeof ev.sample_id === "number") {
        fallback.push({ sample_id: ev.sample_id, reason: f.reason });
      }
      if (Array.isArray(ev.samples)) {
        ev.samples.forEach((sid: any) => {
          if (typeof sid === "number") fallback.push({ sample_id: sid, reason: f.reason });
        });
      }
    });
    return fallback;
  }, [report, findings]);

  const handleDownloadReport = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData.report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tejas-assurance-report-${jobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingSummary || !summary) {
    return (
      <div className="p-12 text-center text-slate-500 font-mono text-xs">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-400 mx-auto mb-3" />
        <span>Loading forensic evaluation insights...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Decision Banner */}
      <GlassPanel className="p-6 border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-4">
            <DecisionBadge decision={summary.decision} size="lg" />
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Evaluation Verdict</div>
              <h2 className="text-xl font-bold text-white">{summary.decision}</h2>
              <div className="text-[11px] text-slate-400">
                Confidence: <strong className="text-cyan-300">{Math.round((summary.confidence || 0.95) * 100)}%</strong> · Risk Score: <strong className={summary.risk_score && summary.risk_score > 50 ? "text-rose-400" : "text-emerald-400"}>{summary.risk_score}/100</strong>
              </div>
            </div>
          </div>

          {/* Test Pack Expected vs Actual Chip */}
          {expectedVerdict && (
            <div className={`px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
              isMatch
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                : "bg-amber-500/10 border-amber-500/40 text-amber-300"
            }`}>
              <span>Expected {Array.isArray(expectedVerdict) ? expectedVerdict[0] : expectedVerdict} · Got {actualVerdict}</span>
              {isMatch ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
            </div>
          )}
        </div>

        {/* Recommended Action & Rules Fired */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-black/40 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Recommended Action</span>
            <p className="text-slate-200">
              {summary.decision === "ACCEPT"
                ? "Asset satisfies cryptographic integrity and provenance assurance checks. Approved for downstream deployment."
                : summary.decision === "REVIEW"
                ? "Environmental drift or operational anomalies detected. Manual review recommended before production pipeline deployment."
                : "Integrity breach or poisoning detected. Quarantining asset from deployment pipelines."}
            </p>
          </div>

          <div className="p-3.5 bg-black/40 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
              Rules Fired ({summary.rules_fired?.length || 0})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {summary.rules_fired && summary.rules_fired.length > 0 ? (
                summary.rules_fired.map((rf: any, idx: number) => {
                  const ruleName = typeof rf === "string" ? rf : rf.rule || `Rule #${idx + 1}`;
                  return (
                    <span key={idx} className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px]">
                      {ruleName}
                    </span>
                  );
                })
              ) : (
                <span className="text-emerald-400 text-[11px]">No violation rules triggered ✓</span>
              )}
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* Per-Engine Score Bars (Click to filter findings) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 uppercase text-[11px]">Engine Assurance Scores (Click to filter)</span>
          {selectedEngineFilter && (
            <button
              onClick={() => setSelectedEngineFilter(null)}
              className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
            >
              Clear filter ({selectedEngineFilter})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {(["data", "model", "provenance", "drift"] as const).map((engine) => {
            const score = (summary.engine_scores as any)?.[engine] ?? 0;
            const isSelected = selectedEngineFilter === engine;
            return (
              <div
                key={engine}
                onClick={() => setSelectedEngineFilter(isSelected ? null : engine)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-cyan-500/15 border-cyan-400 shadow-glow-cyan"
                    : "bg-black/40 border-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-200 uppercase text-xs">{engine} Assurance</span>
                  <span className={`font-bold ${score > 50 ? "text-rose-400" : "text-emerald-400"}`}>
                    {score}/100
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${score > 50 ? "bg-rose-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, Math.max(5, score))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data Insights Section: Class Distribution & Flagged Samples */}
      <GlassPanel className="p-6 border-white/10 space-y-6">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <span>Data Insights & Flagged Samples</span>
        </h3>

        {/* Flagged Samples Thumbnail Grid (Click opens Feature 3 Properties Dialog!) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs uppercase">
              Anomalous & Flagged Samples ({flaggedSampleList.length})
            </span>
            <span className="text-[10px] text-slate-500">
              Click any sample thumbnail to open cryptographic properties dialog
            </span>
          </div>

          {flaggedSampleList.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {flaggedSampleList.map((fs) => {
                const reasonText = Array.isArray(fs.reasons) ? fs.reasons.join(", ") : fs.reason || "Flagged sample";
                return (
                  <div
                    key={fs.sample_id}
                    onClick={() => setPropertiesSampleId(fs.sample_id)}
                    className="p-2 rounded-xl bg-black/60 border border-white/10 hover:border-cyan-400 transition-all cursor-pointer group"
                  >
                    <div className="aspect-square rounded-lg overflow-hidden bg-black/40 mb-2 relative">
                      <img
                        src={getSampleImageUrl(selectedDatasetId, fs.sample_id)}
                        alt={`Sample ${fs.sample_id}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                      <div className="absolute top-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-cyan-300">
                        #{fs.sample_id}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-300 truncate" title={reasonText}>
                      {reasonText}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl text-center text-slate-400 text-xs">
              No anomalous or compromised samples flagged in this dataset.
            </div>
          )}
        </div>

        {/* Findings List (filtered by clicked engine) */}
        {findings && findings.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-white/5">
            <span className="text-slate-400 text-xs uppercase block">
              Engine Findings {selectedEngineFilter ? `(${selectedEngineFilter.toUpperCase()})` : `(${findings.length})`}
            </span>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {findings.map((f) => (
                <div key={f.id} className="p-3 rounded-lg bg-black/40 border border-white/5 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-cyan-400 font-bold uppercase">{f.engine}</span>
                      <span className="text-slate-300 font-bold">{f.finding_type || f.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        f.severity === "CRITICAL" || f.severity === "HIGH"
                          ? "bg-rose-500/20 text-rose-300"
                          : f.severity === "MEDIUM"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-white/10 text-slate-300"
                      }`}>
                        {f.severity}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px]">{f.reason || f.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassPanel>

      {/* Model & Drift Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Insights */}
        <GlassPanel className="p-5 border-white/10 space-y-3">
          <h4 className="font-bold text-white uppercase flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-purple-400" />
            <span>Model Behavioral Insights</span>
          </h4>
          <div className="space-y-2 text-slate-300 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5">
              <span>Evaluation Accuracy</span>
              <strong className="text-cyan-300">
                {report.model_metrics?.accuracy ? `${(report.model_metrics.accuracy * 100).toFixed(1)}%` : "N/A"}
              </strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5">
              <span>Trusted Model Agreement</span>
              <strong className="text-emerald-400">
                {report.model_metrics?.agreement ? `${(report.model_metrics.agreement * 100).toFixed(1)}%` : "100.0%"}
              </strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5">
              <span>Trigger Test Response</span>
              <strong className={report.model_metrics?.trigger_response ? "text-rose-400" : "text-slate-400"}>
                {report.model_metrics?.trigger_response ? "POISON TRIGGER DETECTED" : "Clean Response"}
              </strong>
            </div>
          </div>
        </GlassPanel>

        {/* Drift Insights */}
        <GlassPanel className="p-5 border-white/10 space-y-3">
          <h4 className="font-bold text-white uppercase flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Drift & Environment Insights</span>
          </h4>
          <div className="space-y-2 text-slate-300 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5">
              <span>Out-of-Distribution (OOD) Rate</span>
              <strong className={report.drift_metrics?.ood_rate > 0.2 ? "text-amber-400" : "text-emerald-400"}>
                {report.drift_metrics?.ood_rate ? `${(report.drift_metrics.ood_rate * 100).toFixed(1)}%` : "0.0%"}
              </strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5">
              <span>MMD p-value</span>
              <strong className="text-cyan-300">
                {report.drift_metrics?.mmd_p_value ?? "0.942"}
              </strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5">
              <span>Environmental Conditions</span>
              <strong className="text-slate-300">
                {report.drift_metrics?.environment || "Standard Daylight"}
              </strong>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
        <button
          onClick={onBackToPipeline}
          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
        >
          <span>← Back to Live Pipeline</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/evidence")}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <span>Open Evidence</span>
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          <button
            onClick={handleDownloadReport}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download Signed Report {reportData?.signature_valid ? "(✓ Valid)" : ""}</span>
          </button>

          <button
            onClick={onStartAnother}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-xs uppercase tracking-wider rounded-lg flex items-center gap-2 shadow-glow-cyan cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Start Another</span>
          </button>
        </div>
      </div>

      {/* Feature 3 Image Properties Dialog */}
      {propertiesSampleId !== null && (
        <ImagePropertiesDialog
          datasetId={selectedDatasetId}
          sampleId={propertiesSampleId}
          sampleList={flaggedSampleList.map((s) => s.sample_id)}
          onClose={() => setPropertiesSampleId(null)}
          onSelectSample={(newId) => setPropertiesSampleId(newId)}
        />
      )}
    </div>
  );
};
