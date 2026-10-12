import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Flame,
  Play,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  FileKey,
  Database,
  Binary,
  Layers,
  ArrowRight,
  Info,
  CheckCircle2,
  Lock,
  ChevronDown,
} from "lucide-react";
import {
  getScenarios,
  bootstrapLab,
  runScenario,
  resetLab,
  tamperInference,
  tamperAuditBlock,
  tamperModelFile,
  listAssets,
  listInference,
  getAuditBlocks,
  listJobs,
  getJob,
  verifyAuditChain,
  getDemoTampers,
  restoreAuditBlock,
  restoreInferenceRecord,
  trainMlModel,
  PoisonSpec
} from "../api/endpoints";
import { getWsUrl } from "../api/ws";
import { GlassPanel } from "../components/ui/GlassPanel";
import { DecisionBadge } from "../components/ui/DecisionBadge";
import { useLedgerGuard } from "../hooks/useLedgerGuard";
import { useAuth } from "../hooks/useAuth";
import { useAttackLabStore } from "../store/attackLabStore";

export const AttackLab: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { guardAction, GuardModal } = useLedgerGuard();
  const { permissions } = useAuth();
  const canWrite = !!permissions?.attack_lab;

  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapSuccess, setBootstrapSuccess] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  
  const { isRunnerActive, runnerMode, setRunnerActive } = useAttackLabStore();
  const [menuOpen, setMenuOpen] = useState(false);

  // Tamper tools states
  const [selectedInferenceId, setSelectedInferenceId] = useState<string>("");
  const [selectedAuditIndex, setSelectedAuditIndex] = useState<number>(1);
  const [selectedModelAssetId, setSelectedModelAssetId] = useState<string>("");
  const [tamperFeedback, setTamperFeedback] = useState<string | null>(null);

  // Trojan Design states
  const [trojanTarget, setTrojanTarget] = useState("speed-limit-30");
  const [trojanRate, setTrojanRate] = useState(0.15);
  const [trojanPattern, setTrojanPattern] = useState("yellow-square");
  const [trojanPosition, setTrojanPosition] = useState("bottom-right");
  const [trainingStatus, setTrainingStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [trainingMetrics, setTrainingMetrics] = useState<any[]>([]);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [trainingModelId, setTrainingModelId] = useState<string | null>(null);

  // Step Progress State Machine
  const { data: bootstrapData } = useQuery({
    queryKey: ["demoBootstrap"],
    queryFn: () => bootstrapLab(false),
    staleTime: 60000,
  });

  const baselineKey = bootstrapData?.baseline || "default";
  const storageProgressKey = `tejas_attack_lab_progress_${baselineKey}`;
  const storageTargetKey = `tejas_attack_lab_target_${baselineKey}`;

  const [stepProgress, setStepProgress] = useState<Record<number, {
    status: "pending" | "next" | "running" | "done-pass" | "done-mismatch";
    job_id?: string;
    decision?: string;
    risk_score?: number;
    resultChip?: string;
    mismatchInfo?: string;
  }>>(() => {
    try {
      const raw = sessionStorage.getItem(`tejas_attack_lab_progress_${bootstrapData?.baseline || "default"}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      1: { status: "next" },
      2: { status: "pending" },
      3: { status: "pending" },
      4: { status: "pending" },
      5: { status: "pending" },
      6: { status: "pending" },
    };
  });

  const [targetStep, setTargetStep] = useState<number>(() => {
    try {
      const raw = sessionStorage.getItem(`tejas_attack_lab_target_${bootstrapData?.baseline || "default"}`);
      if (raw) {
        const val = Number(raw);
        if (val >= 1 && val <= 6) return val;
      }
    } catch {}
    return 1;
  });

  const [restoringLedger, setRestoringLedger] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  // Sync state whenever bootstrapData changes (if baseline becomes available)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageProgressKey);
      if (raw) {
        setStepProgress(JSON.parse(raw));
      }
      const rawTarget = sessionStorage.getItem(storageTargetKey);
      if (rawTarget) {
        setTargetStep(Number(rawTarget));
      }
    } catch {}
  }, [storageProgressKey, storageTargetKey]);

  // Recover mid-step state from GET /api/jobs/{id} if backend was restarted or page reloaded mid-step
  useEffect(() => {
    let active = true;
    const checkRunning = async () => {
      let updated = false;
      const copy = { ...stepProgress };
      const STEP_EXPECTS: Record<number, string> = {
        1: "ACCEPT",
        2: "QUARANTINE",
        3: "QUARANTINE",
        4: "QUARANTINE",
        5: "REVIEW",
        6: "VALID_FALSE",
      };

      for (let i = 1; i <= 6; i++) {
        const rec = copy[i];
        if (rec?.status === "running" && rec.job_id) {
          try {
            const j = await getJob(rec.job_id);
            const expected = STEP_EXPECTS[i];
            if (j.status === "COMPLETED") {
              const pass = j.decision === expected;
              copy[i] = {
                status: pass ? "done-pass" : "done-mismatch",
                job_id: j.id,
                decision: j.decision || undefined,
                risk_score: j.risk_score ?? undefined,
                resultChip: `${j.decision} · risk ${j.risk_score ?? 0}`,
                mismatchInfo: pass ? undefined : `expected ${expected}, got ${j.decision}`,
              };
              updated = true;
            } else if (j.status === "FAILED") {
              copy[i] = {
                status: "done-mismatch",
                job_id: j.id,
                mismatchInfo: `Job failed: ${j.error || "unknown"}`,
              };
              updated = true;
            }
          } catch {}
        }
      }
      if (updated && active) {
        setStepProgress(copy);
        try {
          sessionStorage.setItem(storageProgressKey, JSON.stringify(copy));
        } catch {}
      }
    };
    checkRunning();
    return () => {
      active = false;
    };
  }, [storageProgressKey]);

  // 1. Fetch Scenarios
  const { data: scenarios, isLoading: loadingScenarios } = useQuery({
    queryKey: ["scenarios"],
    queryFn: getScenarios,
  });

  // 2. Fetch Assets (for model tampering)
  const { data: modelAssets } = useQuery({
    queryKey: ["modelAssets"],
    queryFn: () => listAssets("model"),
  });

  // 3. Fetch Inference records (for inference tampering)
  const { data: inferenceRecords } = useQuery({
    queryKey: ["inferenceRecordsList"],
    queryFn: () => listInference(undefined, 20),
  });

  // 4. Fetch Audit blocks (for audit tampering)
  const { data: auditData } = useQuery({
    queryKey: ["auditBlocksList"],
    queryFn: () => getAuditBlocks(0, 50),
  });

  // 5. Fetch Recent Jobs to display actual vs expected decision
  const { data: recentJobs } = useQuery({
    queryKey: ["recentJobsForLab"],
    queryFn: () => listJobs(30),
    refetchInterval: 3000,
  });

  // Helper to find the latest job for a given scenario
  const getJobForScenario = (scName: string) => {
    if (!recentJobs) return null;
    return (
      recentJobs.find(
        (j) =>
          j.label?.toLowerCase().includes(scName.toLowerCase()) ||
          (j as any).scenario === scName
      ) || null
    );
  };

  const handleBootstrap = async (force = false) => {
    try {
      setBootstrapping(true);
      setBootstrapSuccess(null);
      await bootstrapLab(force);
      setBootstrapSuccess("Attack lab initialized: datasets, baseline features, and synthetic models generated!");
      // Clear step progress on new initialization
      try {
        sessionStorage.removeItem(storageProgressKey);
        sessionStorage.removeItem(storageTargetKey);
      } catch {}
      setStepProgress({
        1: { status: "next" },
        2: { status: "pending" },
        3: { status: "pending" },
        4: { status: "pending" },
        5: { status: "pending" },
        6: { status: "pending" },
      });
      setTargetStep(1);
      setRestoreStatus(null);
      setRunnerActive(false, null);
      queryClient.invalidateQueries();
    } catch (e: any) {
      console.error("Bootstrap error", e);
      setBootstrapSuccess(`Bootstrap error: ${e.message}`);
    } finally {
      setBootstrapping(false);
    }
  };

  const executeRunScenario = async (name: string, nextStepTarget?: number) => {
    try {
      setRunningScenario(name);
      const res = await runScenario(name);
      if (nextStepTarget) setTargetStep(nextStepTarget);
      navigate(`/jobs/${res.job.id}`);
    } catch (e) {
      console.error("Failed to run scenario", e);
    } finally {
      setRunningScenario(null);
    }
  };

  const handleRunScenario = (name: string, nextStepTarget?: number) => {
    guardAction(() => executeRunScenario(name, nextStepTarget), `scenario "${name}"`);
  };

  const handleTamperInference = async () => {
    if (!selectedInferenceId) return;
    try {
      const res = await tamperInference(selectedInferenceId);
      setTamperFeedback(
        `Tampered inference record ${res.record_id}: forged class "${res.forged_class}" (was "${res.original_class}")`
      );
      queryClient.invalidateQueries();
    } catch (e: any) {
      setTamperFeedback(`Tamper error: ${e.message}`);
    }
  };

  const handleTamperAudit = async () => {
    try {
      const res = await tamperAuditBlock(selectedAuditIndex);
      setTamperFeedback(
        `Tampered audit block #${res.index}: payload modified, hash changed to ${res.new_hash.slice(0, 10)}…`
      );
      queryClient.invalidateQueries();
    } catch (e: any) {
      setTamperFeedback(`Tamper error: ${e.message}`);
    }
  };

  const handleTamperModel = async () => {
    if (!selectedModelAssetId) return;
    try {
      const res = await tamperModelFile(selectedModelAssetId);
      setTamperFeedback(
        `Tampered model asset: flipped ${res.bytes_flipped} bytes in stored file.`
      );
      queryClient.invalidateQueries();
    } catch (e: any) {
      setTamperFeedback(`Tamper error: ${e.message}`);
    }
  };

  const handleReset = async () => {
    try {
      await resetLab();
      setConfirmReset(false);
      setTamperFeedback("Lab wiped cleanly and genesis audit block restored.");
      // Clear progress on reset
      try {
        sessionStorage.removeItem(storageProgressKey);
        sessionStorage.removeItem(storageTargetKey);
      } catch {}
      setStepProgress({
        1: { status: "next" },
        2: { status: "pending" },
        3: { status: "pending" },
        4: { status: "pending" },
        5: { status: "pending" },
        6: { status: "pending" },
      });
      setTargetStep(1);
      setRestoreStatus(null);
      setRunnerActive(false, null);
      queryClient.invalidateQueries();
    } catch (e: any) {
      setTamperFeedback(`Reset error: ${e.message}`);
    }
  };

  const handleTrainTrojan = async () => {
    try {
      setTrainingStatus("running");
      setTrainingError(null);
      setTrainingMetrics([]);
      setTrainingModelId(null);
      
      const res = await trainMlModel({
        name: `Trojan-${trojanTarget.slice(0,5)}-${Date.now()}`,
        demo_data: true,
        epochs: 3,
        trust_as: "adversary-trojan",
        poison: {
          target_class: trojanTarget,
          rate: trojanRate,
          pattern: trojanPattern,
          position: trojanPosition,
        }
      });
      
      const wsUrl = getWsUrl(res.websocket);
      const ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "train_epoch") {
          setTrainingMetrics(m => [...m, data]);
        } else if (data.type === "complete") {
          setTrainingStatus("completed");
          setTrainingModelId(data.model_asset_id);
          queryClient.invalidateQueries({ queryKey: ["modelAssets"] });
          ws.close();
        } else if (data.type === "failed") {
          setTrainingStatus("failed");
          setTrainingError(data.error);
          ws.close();
        }
      };
      
      ws.onerror = (e) => {
        console.error("WS error", e);
        setTrainingStatus("failed");
        setTrainingError("WebSocket error");
      };
    } catch (e: any) {
      setTrainingStatus("failed");
      setTrainingError(e.message);
    }
  };

  // Step Definitions for the 6-step evaluation state machine
  const STEP_DEFINITIONS = [
    {
      num: 1,
      title: "Clean Baseline",
      scenario: "clean",
      expect: "ACCEPT",
      desc: "Run clean pipeline → all engines pass → ACCEPT.",
    },
    {
      num: 2,
      title: "Model Trojan / Substitution",
      scenario: "model-substitution",
      expect: "QUARANTINE",
      desc: "Model engine detects Trojan trigger backdoor → QUARANTINE.",
    },
    {
      num: 3,
      title: "Poisoned Dataset",
      scenario: "poisoned",
      expect: "QUARANTINE",
      desc: "Data engine flags poisoned samples + Merkle proof mismatch.",
    },
    {
      num: 4,
      title: "Inference Tampering",
      scenario: "inference-tamper",
      expect: "QUARANTINE",
      desc: "Inference page detects forged record hash + replay defense.",
    },
    {
      num: 5,
      title: "Environmental Drift",
      scenario: "drift",
      expect: "REVIEW",
      desc: "Shift detection: MMD p-value < 0.01 → REVIEW (Drift ≠ attack).",
    },
    {
      num: 6,
      title: "Audit Chain Breach",
      scenario: null,
      expect: "VALID_FALSE",
      desc: "Tamper newest ASSURANCE_DECISION block → verify chain in Audit Ledger → Compromised.",
    },
  ];

  const executeStep = async (stepNum: number) => {
    if (!canWrite) return;
    const stepDef = STEP_DEFINITIONS[stepNum - 1];

    // Mark step as running
    setStepProgress((prev) => {
      const updated = {
        ...prev,
        [stepNum]: { ...prev[stepNum], status: "running" as const },
      };
      try {
        sessionStorage.setItem(storageProgressKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    try {
      if (stepDef.scenario) {
        // Steps 1 to 5
        const res = await runScenario(stepDef.scenario);
        const jobId = res.job.id;

        setStepProgress((prev) => {
          const updated = {
            ...prev,
            [stepNum]: { status: "running" as const, job_id: jobId },
          };
          try {
            sessionStorage.setItem(storageProgressKey, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        // Poll getJob until complete
        let finishedJob: any = null;
        for (let attempt = 0; attempt < 60; attempt++) {
          await new Promise((r) => setTimeout(r, 600));
          const j = await getJob(jobId);
          if (j.status === "COMPLETED" || j.status === "FAILED") {
            finishedJob = j;
            break;
          }
        }

        const isPass = finishedJob?.status === "COMPLETED" && finishedJob.decision === stepDef.expect;
        const resultChip = finishedJob?.decision
          ? `${finishedJob.decision} · risk ${finishedJob.risk_score ?? 0}`
          : "FAILED";

        setStepProgress((prev) => {
          const updated = {
            ...prev,
            [stepNum]: {
              status: (isPass ? "done-pass" : "done-mismatch") as any,
              job_id: jobId,
              decision: finishedJob?.decision || undefined,
              risk_score: finishedJob?.risk_score ?? undefined,
              resultChip,
              mismatchInfo: isPass
                ? undefined
                : `expected ${stepDef.expect}, got ${finishedJob?.decision || "FAILED"}`,
            },
          };
          try {
            sessionStorage.setItem(storageProgressKey, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } else {
        // Step 6: Audit Chain Breach
        const blocksRes = await getAuditBlocks(0, 100);
        const decisionBlocks = blocksRes.items.filter((b) => b.event_type === "ASSURANCE_DECISION");
        const targetBlock =
          decisionBlocks.length > 0
            ? decisionBlocks.reduce((max, b) => (b.index > max.index ? b : max), decisionBlocks[0])
            : blocksRes.items.find((b) => b.index > 0) || blocksRes.items[blocksRes.items.length - 1];

        if (targetBlock && targetBlock.index > 0) {
          await tamperAuditBlock(targetBlock.index);
        } else {
          await tamperAuditBlock(1);
        }

        const verifyRes = await verifyAuditChain();
        const isBreached = !verifyRes.valid;

        setStepProgress((prev) => {
          const updated = {
            ...prev,
            [stepNum]: {
              status: (isBreached ? "done-pass" : "done-mismatch") as any,
              resultChip: isBreached ? "BREACH DETECTED · valid: false" : "VALID",
              mismatchInfo: isBreached ? undefined : "expected valid: false, got valid: true",
            },
          };
          try {
            sessionStorage.setItem(storageProgressKey, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }

      // Automatically advance target glow to the next undone step
      setStepProgress((latest) => {
        let nextTarget = stepNum;
        for (let offset = 1; offset <= 6; offset++) {
          const candidate = ((stepNum - 1 + offset) % 6) + 1;
          const candidateStatus = latest[candidate]?.status;
          if (candidateStatus !== "done-pass" && candidateStatus !== "done-mismatch") {
            nextTarget = candidate;
            break;
          }
        }
        setTargetStep(nextTarget);
        try {
          sessionStorage.setItem(storageTargetKey, String(nextTarget));
        } catch {}
        return latest;
      });

      queryClient.invalidateQueries();
    } catch (e: any) {
      console.error("Failed to execute step", e);
      setStepProgress((prev) => {
        const updated = {
          ...prev,
          [stepNum]: {
            status: "done-mismatch" as const,
            mismatchInfo: `Error: ${e.message}`,
          },
        };
        try {
          sessionStorage.setItem(storageProgressKey, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  };

  // Orchestrator Effect for sequential runner
  useEffect(() => {
    if (!isRunnerActive) return;

    let active = true;

    const runNext = async () => {
      const currentStatus = stepProgress[targetStep]?.status;
      
      if (currentStatus === "running") return; // Already running

      const allDone = [1, 2, 3, 4, 5, 6].every(
        n => stepProgress[n]?.status === "done-pass" || stepProgress[n]?.status === "done-mismatch"
      );

      if (allDone) {
        setRunnerActive(false, null);
        return;
      }

      if (currentStatus !== "done-pass" && currentStatus !== "done-mismatch") {
        await executeStep(targetStep);
      }
    };

    runNext();

    return () => {
      active = false;
    };
  }, [stepProgress, targetStep, isRunnerActive, setRunnerActive]);

  const handleExecuteRemaining = () => {
    setRunnerActive(true, 'all-remaining');
    setMenuOpen(false);
  };

  const handleRerunAll = () => {
    try {
      sessionStorage.removeItem(storageProgressKey);
      sessionStorage.removeItem(storageTargetKey);
    } catch {}
    setStepProgress({
      1: { status: "next" },
      2: { status: "pending" },
      3: { status: "pending" },
      4: { status: "pending" },
      5: { status: "pending" },
      6: { status: "pending" },
    });
    setTargetStep(1);
    setRunnerActive(true, 'rerun-all');
    setMenuOpen(false);
  };

  const handleRestoreDemoEdits = async () => {
    if (!canWrite) return;
    setRestoringLedger(true);
    setRestoreStatus(null);
    try {
      const tampers = await getDemoTampers();
      for (const idx of tampers.audit_blocks) {
        await restoreAuditBlock(idx);
      }
      for (const recId of tampers.inference_records) {
        await restoreInferenceRecord(recId);
      }
      const verify = await verifyAuditChain();
      if (verify.valid) {
        setRestoreStatus("SYSTEM SECURE");
      } else {
        setRestoreStatus("Ledger restored with warnings (verification returned invalid)");
      }
      queryClient.invalidateQueries();
    } catch (e: any) {
      console.error("Restore error", e);
      setRestoreStatus(`Restore error: ${e.message}`);
    } finally {
      setRestoringLedger(false);
    }
  };

  const completedCount = STEP_DEFINITIONS.filter(
    (s) =>
      stepProgress[s.num]?.status === "done-pass" || stepProgress[s.num]?.status === "done-mismatch"
  ).length;

  const currentTargetDef = STEP_DEFINITIONS[targetStep - 1] || STEP_DEFINITIONS[0];
  const isRunningTarget = stepProgress[targetStep]?.status === "running";
  const isStep6Done =
    stepProgress[6]?.status === "done-pass" || stepProgress[6]?.status === "done-mismatch";

  return (
    <div className="space-y-8 pb-16">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
              OFFLINE DEFENCE THREAT LAB
            </span>
            <span className="text-xs font-mono text-slate-500">
              SIMULATED ADVERSARY WORKSPACE
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight flex items-center gap-2.5">
            <Flame className="w-7 h-7 text-rose-400" />
            <span>Adversarial Attack Lab</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleBootstrap(false)}
            disabled={!canWrite || bootstrapping}
            title={canWrite ? "Initialise synthetic attack assets" : "Admin access required"}
            className="px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-glass-edge hover:shadow-glow-cyan disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bootstrapping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Generating Assets (~8s)...</span>
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                <span>Initialise Attack Lab</span>
                {!canWrite && <Lock className="w-3 h-3 text-slate-400 ml-1" />}
              </>
            )}
          </button>

          <button
            onClick={() => setConfirmReset(true)}
            disabled={!canWrite}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={canWrite ? "Reset All Lab State" : "Admin access required"}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!canWrite && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-mono text-amber-300 flex items-center gap-2.5">
          <Lock className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Read-Only Mode:</strong> Only administrators can execute Attack Lab scenarios, inject backdoors, tamper with assets, or reset lab state. Operators and Clients view historical outcomes read-only.
          </span>
        </div>
      )}

      {bootstrapSuccess && (
        <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-xs font-mono text-cyan-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{bootstrapSuccess}</span>
        </div>
      )}

      {/* 6-Step Guided Demo Flow Assistant */}
      <GlassPanel className="p-5 border-cyan-500/30 bg-cyan-950/10 shadow-glow-cyan">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300">
              6-Step Threat Evaluation Sequence
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {completedCount} of 6 complete
          </span>
        </div>

        {/* Progress Bar: "3 of 6 complete" */}
        <div className="space-y-1 mb-4">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-300 font-bold">{completedCount} of 6 complete</span>
            <span className="text-cyan-400 font-mono font-bold">{Math.round((completedCount / 6) * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-black/50 border border-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 transition-all duration-500 rounded-full"
              style={{ width: `${(completedCount / 6) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 mb-4">
          {STEP_DEFINITIONS.map((s) => {
            const isTarget = targetStep === s.num;
            const rec = stepProgress[s.num] || { status: s.num === 1 ? "next" : "pending" };
            const isRunning = rec.status === "running";
            const isPass = rec.status === "done-pass";
            const isMismatch = rec.status === "done-mismatch";
            const isPending = !isPass && !isMismatch && !isRunning && !isTarget;

            // Visuals:
            // next: soft pulsing cyan ring (2s ease-in-out; static ring under prefers-reduced-motion)
            // running: spinner and "Running…", with card disabled
            // done-pass: green check badge, subtle green border, result chip, "View" link
            // done-mismatch: amber badge showing "expected X, got Y" and "View" link
            // pending: dimmed
            let cardClasses =
              "relative p-3 rounded-xl border text-xs font-mono transition-all flex flex-col justify-between select-none ";

            if (isRunning) {
              cardClasses += "bg-cyan-950/20 border-cyan-500/40 text-cyan-200 pointer-events-none opacity-90 cursor-wait";
            } else if (isPass) {
              cardClasses += "bg-emerald-950/20 border-emerald-500/40 text-emerald-200 cursor-pointer hover:border-emerald-400/60";
            } else if (isMismatch) {
              cardClasses += "bg-amber-950/20 border-amber-500/40 text-amber-200 cursor-pointer hover:border-amber-400/60";
            } else if (isTarget) {
              cardClasses += "bg-cyan-950/30 border-cyan-400/60 text-white cursor-pointer ring-2 ring-cyan-400/80 shadow-[0_0_15px_rgba(6,182,212,0.35)] motion-safe:animate-[pulse_2s_ease-in-out_infinite]";
            } else {
              cardClasses += "bg-black/40 border-white/5 text-slate-400 opacity-60 cursor-pointer hover:opacity-90 hover:border-white/20";
            }

            return (
              <div
                key={s.num}
                onClick={() => {
                  setTargetStep(s.num);
                  try {
                    sessionStorage.setItem(storageTargetKey, String(s.num));
                  } catch {}
                }}
                className={cardClasses}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5 gap-1">
                    <span className="font-bold text-white text-[11px] truncate">
                      Step {s.num}: {s.title}
                    </span>
                    {isRunning && (
                      <span className="flex items-center gap-1 text-[10px] text-cyan-300 font-bold shrink-0">
                        <Loader2 className="w-3 h-3 animate-spin" />
                      </span>
                    )}
                    {isPass && (
                      <span className="flex items-center text-emerald-400 font-bold shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {isMismatch && (
                      <span className="flex items-center text-amber-400 font-bold shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {isTarget && !isRunning && !isPass && !isMismatch && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-bold shrink-0">
                        NEXT
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-sans text-slate-300 line-clamp-2 mb-2">
                    {s.desc}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-1 text-[10px]">
                  {isRunning && (
                    <span className="text-cyan-300 font-mono text-[10px] flex items-center gap-1 font-bold">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Running…
                    </span>
                  )}
                  {isPass && (
                    <>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold truncate max-w-[110px]">
                        {rec.resultChip || "PASS"}
                      </span>
                      {rec.job_id ? (
                        <Link
                          to={`/jobs/${rec.job_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-cyan-400 hover:text-cyan-300 underline shrink-0 font-bold"
                        >
                          View →
                        </Link>
                      ) : s.num === 6 ? (
                        <Link
                          to="/audit"
                          onClick={(e) => e.stopPropagation()}
                          className="text-cyan-400 hover:text-cyan-300 underline shrink-0 font-bold"
                        >
                          View →
                        </Link>
                      ) : null}
                    </>
                  )}
                  {isMismatch && (
                    <>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold truncate max-w-[110px]" title={rec.mismatchInfo}>
                        {rec.mismatchInfo || "MISMATCH"}
                      </span>
                      {rec.job_id && (
                        <Link
                          to={`/jobs/${rec.job_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-amber-400 hover:text-amber-300 underline shrink-0 font-bold"
                        >
                          View →
                        </Link>
                      )}
                    </>
                  )}
                  {isPending && (
                    <span className="text-slate-500 text-[10px]">Pending</span>
                  )}
                  {isTarget && !isPass && !isMismatch && !isRunning && (
                    <span className="text-cyan-300 text-[10px] font-bold">Target</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Current Target & Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Current Target:</span>
            <strong className="text-cyan-300">
              Step {targetStep}: {currentTargetDef.title}
            </strong>
          </div>

          <div className="flex items-center gap-2 relative">
            <div className="flex rounded-xl shadow-glow-cyan overflow-visible z-10">
              <button
                onClick={() => {
                  if (isRunnerActive) {
                    setRunnerActive(false, null);
                  } else {
                    executeStep(targetStep);
                  }
                }}
                disabled={!canWrite || (!isRunnerActive && isRunningTarget)}
                title={canWrite ? (isRunnerActive ? "Stop Runner" : `Execute Step ${targetStep}`) : "Admin access required"}
                className={`px-4 py-2 rounded-l-xl ${isRunnerActive ? 'bg-rose-500/30 hover:bg-rose-500/40 border-rose-500/50 text-rose-200' : 'bg-cyan-500/30 hover:bg-cyan-500/40 border-cyan-500/50 text-cyan-200'} border-y border-l flex items-center gap-2 transition-all font-bold disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isRunningTarget && !isRunnerActive ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>Running…</span>
                  </>
                ) : isRunnerActive ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                    <span>Stop Runner</span>
                  </>
                ) : (
                  <>
                    <span>
                      Execute Step {targetStep}: {currentTargetDef.title} →
                    </span>
                    {!canWrite && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  </>
                )}
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  disabled={!canWrite || isRunnerActive}
                  className={`px-2 py-2 rounded-r-xl bg-cyan-500/30 hover:bg-cyan-500/40 text-cyan-200 border border-cyan-500/50 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed h-full border-l-cyan-500/80`}
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </button>
                {menuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-cyan-500/30 rounded-xl shadow-glow-cyan overflow-hidden z-50">
                      <button 
                        onClick={() => { executeStep(targetStep); setMenuOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-xs font-mono font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors border-b border-white/5"
                      >
                        Execute Step {targetStep}
                      </button>
                      <button 
                        onClick={handleExecuteRemaining}
                        className="w-full text-left px-4 py-2.5 text-xs font-mono font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors border-b border-white/5"
                      >
                        Execute all remaining
                      </button>
                      <button 
                        onClick={handleRerunAll}
                        className="w-full text-left px-4 py-2.5 text-xs font-mono font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                      >
                        Re-run all 6 steps
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Post-Step-6 Ledger Restore Card */}
        {isStep6Done && (
          <div className="mt-4 p-4 rounded-xl bg-violet-950/20 border border-violet-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono font-bold text-violet-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-400" />
                Demo complete. Restore the ledger?
              </div>
              <p className="text-[11px] font-sans text-slate-300 mt-1">
                Leaving the ledger compromised makes every subsequent assurance job quarantine. Restore demo edits to re-establish the cryptographic chain.
              </p>
              {restoreStatus && (
                <div
                  className={`text-xs font-mono font-bold mt-2 ${
                    restoreStatus.includes("SECURE") ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {restoreStatus}
                </div>
              )}
            </div>
            <button
              onClick={handleRestoreDemoEdits}
              disabled={!canWrite || restoringLedger}
              title={canWrite ? "Restore demo edits" : "Admin access required"}
              className="px-4 py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40 text-xs font-mono font-bold whitespace-nowrap flex items-center gap-2 transition-all disabled:opacity-50 shrink-0"
            >
              {restoringLedger ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Restoring…</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore demo edits</span>
                </>
              )}
            </button>
          </div>
        )}
      </GlassPanel>

      {/* Six Scenario Cards */}
      <div>
        <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3 px-1">
          Assurance Threat Scenarios ({scenarios ? Object.keys(scenarios).length : 0})
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {scenarios &&
            Object.entries(scenarios).map(([key, sc]) => {
              const prevJob = getJobForScenario(key);
              const isRunningThis = runningScenario === key;

              return (
                <GlassPanel
                  key={key}
                  className="p-5 border-white/10 flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-mono text-sm font-bold text-white uppercase tracking-tight">
                        {sc.title}
                      </h3>
                      <DecisionBadge decision={sc.expect} size="sm" />
                    </div>

                    <p className="text-xs font-sans text-slate-300 leading-relaxed mb-4 min-h-[48px]">
                      {sc.story}
                    </p>

                    <div className="space-y-1.5 text-[11px] font-mono bg-black/40 p-2.5 rounded-xl border border-white/5 mb-4">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Dataset:</span>
                        <span className="text-cyan-300 truncate max-w-[150px]">{sc.dataset}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Model:</span>
                        <span className="text-violet-300 truncate max-w-[150px]">{sc.model}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-white/5">
                        <span>Expected Verdict:</span>
                        <span className="font-bold text-slate-200">{sc.expect}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    {/* Previous Run Comparison */}
                    {prevJob && (
                      <div className="mb-3 p-2 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400">Previous Run:</span>
                        <div className="flex items-center gap-2">
                          <DecisionBadge decision={prevJob.decision} size="sm" />
                          {prevJob.decision === sc.expect && (
                            <span className="text-emerald-400 font-bold" title="Expected matches actual">
                              ✓ Matches Expectation
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => handleRunScenario(key)}
                      disabled={isRunningThis}
                      className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-glass-edge hover:shadow-glow-cyan disabled:opacity-50"
                    >
                      {isRunningThis ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          <span>Dispatching Job...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run Scenario Pipeline</span>
                        </>
                      )}
                    </button>
                  </div>
                </GlassPanel>
              );
            })}
        </div>
      </div>

      {/* Live Tamper Tools Section */}
      <div className="space-y-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-mono font-bold uppercase">
                Adversary Simulation
              </span>
              <span className="text-xs font-mono text-slate-400">
                Simulated Attacker with OS / Storage / File System Access
              </span>
            </div>
            <h2 className="text-lg font-bold font-mono text-white">
              Live Integrity Breach Injectors
            </h2>
          </div>
        </div>

        {tamperFeedback && (
          <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 text-xs font-mono text-rose-300">
            {tamperFeedback}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-5">
          {/* 1. Tamper Inference Record */}
          <GlassPanel className="p-4 border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase">
              <Binary className="w-4 h-4" />
              <span>Tamper Inference Record</span>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Attacker modifies the classification output of a previously signed inference record to forge an operational report.
            </p>

            <select
              value={selectedInferenceId}
              onChange={(e) => setSelectedInferenceId(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200 focus:border-cyan-400 outline-none"
            >
              <option value="">Select an inference record...</option>
              {inferenceRecords?.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.seq} — {r.id.slice(0, 10)} ({r.output?.top_class})
                </option>
              ))}
            </select>

            <button
              onClick={handleTamperInference}
              disabled={!selectedInferenceId}
              className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-mono font-semibold transition-colors disabled:opacity-50"
            >
              Inject Inference Tamper
            </button>
          </GlassPanel>

          {/* 2. Tamper Audit Block */}
          <GlassPanel className="p-4 border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold uppercase">
              <Layers className="w-4 h-4" />
              <span>Tamper Audit Block</span>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Attacker alters payload in an immutable block.{" "}
              <strong className="text-rose-400">
                Affects all subsequent blocks in the hash chain.
              </strong>
            </p>

            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-slate-400">Block Index:</label>
              <input
                type="number"
                min={1}
                max={auditData?.total ? auditData.total - 1 : 10}
                value={selectedAuditIndex}
                onChange={(e) => setSelectedAuditIndex(parseInt(e.target.value) || 1)}
                className="w-24 bg-black/60 border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200 focus:border-rose-400 outline-none"
              />
              <span className="text-[10px] font-mono text-slate-500">
                (Total: {auditData?.total ?? 0})
              </span>
            </div>

            <button
              onClick={handleTamperAudit}
              className="w-full py-2 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono font-semibold transition-colors"
            >
              Corrupt Ledger Block
            </button>
          </GlassPanel>

          {/* 3. Tamper Model File */}
          <GlassPanel className="p-4 border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-violet-400 font-mono text-xs font-bold uppercase">
              <FileKey className="w-4 h-4" />
              <span>Tamper Model File</span>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Attacker alters neural network weights on disk to trigger SHA-256 and feature signature discrepancies.
            </p>

            <select
              value={selectedModelAssetId}
              onChange={(e) => setSelectedModelAssetId(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200 focus:border-cyan-400 outline-none"
            >
              <option value="">Select model asset...</option>
              {modelAssets?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.sha256.slice(0, 8)}…)
                </option>
              ))}
            </select>

            <button
              onClick={handleTamperModel}
              disabled={!selectedModelAssetId}
              className="w-full py-2 px-3 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 text-xs font-mono font-semibold transition-colors disabled:opacity-50"
            >
              Flip Model Binary Bytes
            </button>
          </GlassPanel>

          {/* 4. Trojan Designer */}
          <GlassPanel className="p-4 border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-fuchsia-400 font-mono text-xs font-bold uppercase">
              <Flame className="w-4 h-4" />
              <span>Judge Designs a Trojan</span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans mb-2">
              Train a custom model backdoor. The model learns to misclassify inputs when the trigger is present.
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] font-mono text-slate-400">Target:</span>
                <select 
                  value={trojanTarget} 
                  onChange={e => setTrojanTarget(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/10 rounded-lg p-1.5 text-[11px] font-mono text-slate-200 focus:border-fuchsia-400 outline-none"
                >
                  <option value="speed-limit-30">speed-limit-30</option>
                  <option value="speed-limit-80">speed-limit-80</option>
                  <option value="stop-sign">stop-sign</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] font-mono text-slate-400">Pattern:</span>
                <select 
                  value={trojanPattern} 
                  onChange={e => setTrojanPattern(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/10 rounded-lg p-1.5 text-[11px] font-mono text-slate-200 focus:border-fuchsia-400 outline-none"
                >
                  <option value="yellow-square">yellow-square</option>
                  <option value="white-noise">white-noise</option>
                  <option value="checkerboard">checkerboard</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] font-mono text-slate-400">Position:</span>
                <select 
                  value={trojanPosition} 
                  onChange={e => setTrojanPosition(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/10 rounded-lg p-1.5 text-[11px] font-mono text-slate-200 focus:border-fuchsia-400 outline-none"
                >
                  <option value="bottom-right">bottom-right</option>
                  <option value="top-left">top-left</option>
                  <option value="center">center</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[10px] font-mono text-slate-400">Rate ({Math.round(trojanRate * 100)}%):</span>
                <input 
                  type="range" min="0.05" max="0.5" step="0.01"
                  value={trojanRate}
                  onChange={e => setTrojanRate(parseFloat(e.target.value))}
                  className="flex-1"
                />
              </div>
            </div>

            {trainingStatus === "running" && (
              <div className="mt-2 text-[10px] font-mono text-cyan-300">
                <div className="flex items-center gap-1.5 mb-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Training Model...
                </div>
                {trainingMetrics.slice(-2).map((m, idx) => (
                  <div key={idx} className="truncate text-slate-400">
                    Ep {m.epoch}: loss {m.metrics.loss?.toFixed(3)}
                  </div>
                ))}
              </div>
            )}
            
            {trainingStatus === "failed" && (
              <div className="mt-2 text-[10px] font-mono text-rose-400 truncate" title={trainingError || ""}>
                Error: {trainingError}
              </div>
            )}

            {trainingStatus === "completed" && (
              <div className="mt-2 text-[10px] font-mono text-emerald-400 truncate">
                Saved MDL-{trainingModelId?.slice(0, 4)}!
              </div>
            )}

            <button
              onClick={handleTrainTrojan}
              disabled={trainingStatus === "running"}
              className="w-full mt-2 py-2 px-3 rounded-xl bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/40 text-[11px] font-mono font-semibold transition-colors disabled:opacity-50"
            >
              {trainingStatus === "running" ? "Training in progress..." : "Train Trojan Model"}
            </button>
          </GlassPanel>
        </div>
      </div>

      {/* Confirmation Dialog for Reset */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <GlassPanel className="max-w-md w-full p-6 border-rose-500/40">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold font-mono text-white mb-2">
              Reset Entire Attack Lab?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6 font-sans">
              This will wipe all existing jobs, findings, tampered records, and regenerate a clean genesis block in the audit ledger.
            </p>
            <div className="flex items-center justify-end gap-3 font-mono text-xs">
              <button
                onClick={() => setConfirmReset(false)}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors"
              >
                Confirm Wipe & Reset
              </button>
            </div>
          </GlassPanel>
        </div>
      )}

      {GuardModal}
    </div>
  );
};
