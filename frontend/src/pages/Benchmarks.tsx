import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  BarChart2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Database,
  BrainCircuit,
  Wind,
  Binary,
  FileText,
  HelpCircle,
} from "lucide-react";
import { getBenchmarks, runBenchmark, listAssets } from "../api/endpoints";
import { getWsUrl } from "../api/ws";
import { GlassPanel } from "../components/ui/GlassPanel";
import { request } from "../api/client";
import { useLedgerGuard } from "../hooks/useLedgerGuard";
import { DecisionBadge } from "../components/ui/DecisionBadge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const SUITE_DURATIONS: Record<string, string> = {
  ci: "~30 seconds",
  smoke: "~2 minutes",
  standard: "10–20 minutes",
};

export const Benchmarks: React.FC = () => {
  const queryClient = useQueryClient();
  const { guardAction, GuardModal } = useLedgerGuard();

  const [selectedSuite, setSelectedSuite] = useState<string>("ci");
  const [selectedDataset, setSelectedDataset] = useState<string>("");

  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(() => sessionStorage.getItem("bench_run_id"));
  const [benchmarkLog, setBenchmarkLog] = useState<string[]>([]);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Expanded result card
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);

  const { data: datasets } = useQuery({
    queryKey: ["datasetAssets"],
    queryFn: () => listAssets("dataset"),
    staleTime: 30_000,
  });

  const { data: benchmarkResults, isLoading } = useQuery({
    queryKey: ["benchmarks"],
    queryFn: getBenchmarks,
    staleTime: 10_000,
  });

  const startElapsed = () => {
    setElapsed(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const stopElapsed = () => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  };

  const finishRun = () => {
    setRunning(false);
    stopElapsed();
    sessionStorage.removeItem("bench_run_id");
    queryClient.invalidateQueries({ queryKey: ["benchmarks"] });
  };

  const pollRun = useCallback((id: string) => {
    const poll = setInterval(async () => {
      try {
        const status = await request<any>(`/api/benchmarks/runs/${encodeURIComponent(id)}`);
        if (status.status === "COMPLETED" || status.status === "completed") {
          clearInterval(poll);
          finishRun();
        } else if (status.status === "FAILED" || status.status === "failed") {
          clearInterval(poll);
          setRunning(false);
          stopElapsed();
          setBenchmarkError(status.error || "Benchmark failed");
          sessionStorage.removeItem("bench_run_id");
        }
      } catch {
        // Keep polling
      }
    }, 3000);
    return () => clearInterval(poll);
  }, []);

  const attachWs = (id: string) => {
    const wsUrl = getWsUrl(`/ws/jobs/${id}`);
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.message) {
            setBenchmarkLog((prev) => [...prev.slice(-200), data.message]);
          }
          if (data.type === "complete") {
            finishRun();
            ws?.close();
          } else if (data.type === "failed") {
            setRunning(false);
            stopElapsed();
            setBenchmarkError(data.error || "Benchmark failed");
            sessionStorage.removeItem("bench_run_id");
            ws?.close();
          }
        } catch {
          setBenchmarkLog((prev) => [...prev.slice(-200), event.data]);
        }
      };

      ws.onerror = () => {
        pollRun(id);
      };

      ws.onclose = () => {
        if (running) pollRun(id);
      };
    } catch {
      pollRun(id);
    }
  };

  const recoverRun = async (id: string) => {
    try {
      const status = await request<any>(`/api/benchmarks/runs/${encodeURIComponent(id)}`);
      if (status.status === "RUNNING" || status.status === "running" || status.status === "queued") {
        setRunning(true);
        startElapsed();
        attachWs(id);
      } else {
        sessionStorage.removeItem("bench_run_id");
        setRunId(null);
      }
    } catch {
      sessionStorage.removeItem("bench_run_id");
      setRunId(null);
    }
  };

  // Recover running state on mount
  useEffect(() => {
    if (runId && !running) {
      recoverRun(runId);
    }
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [benchmarkLog]);

  useEffect(() => {
    return () => stopElapsed();
  }, []);

  const startExecution = async () => {
    try {
      setRunning(true);
      setBenchmarkError(null);
      setBenchmarkLog([]);
      startElapsed();

      const res = await runBenchmark(selectedSuite, selectedDataset || undefined);
      setRunId(res.run_id);
      sessionStorage.setItem("bench_run_id", res.run_id);
      attachWs(res.run_id);
    } catch (err: any) {
      if (err.status === 409) {
        // A benchmark is already running -> attach to it
        setBenchmarkError(null);
        setBenchmarkLog(["A benchmark is already running. Attaching to existing run…"]);
        const match = err.data?.run_id || err.message?.match(/run_id[:\s]+(\S+)/i);
        const existingId = typeof match === "string" ? match : match?.[1];

        if (existingId) {
          setRunId(existingId);
          sessionStorage.setItem("bench_run_id", existingId);
          attachWs(existingId);
        } else {
          // If ID not in response, try the latest known run
          setRunning(false);
          stopElapsed();
          setBenchmarkError("A benchmark is already running in the background. Please wait for completion.");
        }
      } else {
        setRunning(false);
        stopElapsed();
        setBenchmarkError(err.message || "Failed to start benchmark");
      }
    }
  };

  const handleRun = () => {
    guardAction(startExecution, `benchmark (${selectedSuite})`);
  };

  const fetchDetail = async (suite: string, timestamp: string, idx: number) => {
    if (expandedIdx === idx) {
      setExpandedIdx(null);
      setExpandedDetail(null);
      return;
    }
    try {
      setLoadingDetail(true);
      setExpandedIdx(idx);
      setShowRawMarkdown(false);
      const detail = await request<any>(
        `/api/benchmarks/results/${encodeURIComponent(suite)}/${encodeURIComponent(timestamp)}`
      );
      setExpandedDetail(detail);
    } catch (e: any) {
      setExpandedDetail({ error: e.message || "Failed to load details" });
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatFractionPercent = (val: number | undefined | null): string => {
    if (val == null || isNaN(val)) return "n/a";
    return `${(val * 100).toFixed(1)}%`;
  };

  const formatAuroc = (val: number | undefined | null): string => {
    if (val == null || isNaN(val)) return "n/a";
    return val.toFixed(4);
  };

  return (
    <div className="space-y-6">
      {GuardModal}

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight flex items-center gap-2.5">
          <BarChart2 className="w-7 h-7 text-cyan-400" />
          <span>Assurance Benchmarks & Metrics</span>
        </h1>
        <p className="text-slate-400 text-xs font-mono mt-1">
          Evaluate offline computer-vision models against threat distributions and inspect fused risk metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Run Controls */}
        <GlassPanel className="p-5 border-white/10 lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Execute Benchmark
            </h2>
            <span className="text-[10px] font-mono text-cyan-400 font-semibold">OFFLINE CORE</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Benchmark Suite</label>
              <select
                value={selectedSuite}
                onChange={(e) => setSelectedSuite(e.target.value)}
                disabled={running}
                className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200 focus:border-cyan-400 outline-none disabled:opacity-50"
              >
                <option value="ci">CI Suite (~30s, lightweight)</option>
                <option value="smoke">Smoke Suite (~2 min, standard)</option>
                <option value="standard">Standard Suite (10–20 min, comprehensive)</option>
              </select>
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>Expected Duration:</span>
                <span className="text-slate-300 font-bold">{SUITE_DURATIONS[selectedSuite]}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">
                Source Dataset (Optional)
              </label>
              <select
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
                disabled={running}
                className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200 focus:border-cyan-400 outline-none disabled:opacity-50"
              >
                <option value="">Synthetic Aerial Imagery (Default)</option>
                {datasets?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.id.substring(0, 8)})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRun}
              disabled={running}
              className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-glass-edge hover:shadow-glow-cyan disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Running Suite ({elapsed}s)…</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run {selectedSuite.toUpperCase()} Benchmark</span>
                </>
              )}
            </button>

            {running && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] font-mono text-amber-300 leading-snug">
                Heavy computation in progress, other pages may respond more slowly.
              </div>
            )}

            {benchmarkError && (
              <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/30 text-xs font-mono text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{benchmarkError}</span>
              </div>
            )}

            {/* Live Message Log Panel */}
            {benchmarkLog.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Execution Log</span>
                  <span>{elapsed}s elapsed</span>
                </div>
                <div className="p-2.5 rounded-lg bg-black/60 border border-white/10 max-h-48 overflow-y-auto space-y-1 text-[10px] font-mono text-slate-300">
                  {benchmarkLog.map((line, i) => (
                    <div key={i} className="leading-snug">
                      {line}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>
        </GlassPanel>

        {/* Results List */}
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : !benchmarkResults || benchmarkResults.length === 0 ? (
            <GlassPanel className="p-8 text-center text-slate-400 border-white/10 font-mono text-xs">
              No benchmark results saved. Run a benchmark suite above to evaluate models.
            </GlassPanel>
          ) : (
            benchmarkResults.map((res: any, idx: number) => {
              const isExpanded = expandedIdx === idx;
              const detailSummary = isExpanded ? expandedDetail?.summary : null;
              const fused = detailSummary?.performance?.fused_risk_metrics;

              // Check if result is invalid: false quarantine rate >= 0.9
              // or clean controls quarantined with AUDIT_LEDGER_COMPROMISED
              const falseQRate =
                fused?.false_quarantine_rate ?? res?.false_quarantine_rate ?? null;
              const isInvalid = falseQRate != null && falseQRate >= 0.9;

              return (
                <GlassPanel
                  key={idx}
                  className={`p-5 border transition-all ${
                    isInvalid ? "border-rose-500/40 bg-rose-950/10" : "border-white/10"
                  }`}
                >
                  {/* Card Header */}
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10 cursor-pointer"
                    onClick={() => fetchDetail(res.suite, res.generated_at || res.timestamp, idx)}
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {isInvalid ? (
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}

                      <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
                        {res.suite} Suite
                      </h3>

                      {isInvalid && (
                        <span
                          className="text-[9px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold uppercase tracking-wider"
                          title="This benchmark ran while the audit ledger was compromised. Every clean test case was quarantined with AUDIT_LEDGER_COMPROMISED, making the false-quarantine rate invalid."
                        >
                          INVALID: run while ledger compromised
                        </span>
                      )}

                      {isExpanded && expandedDetail?.signature_valid && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                          <ShieldCheck className="w-3 h-3" />
                          <span>ED25519 SIGNED</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(res.generated_at || res.timestamp).toLocaleString()}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Headline Tiles:
                      AUROC: 0.00-1.00 (not percentage)
                      TPR @ 5% FPR: %
                      Flagged (REVIEW+): %
                      False alarms (REVIEW+): %
                      Quarantined attacks: %
                      False quarantine: %
                  */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-3">
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                      <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">
                        AUROC
                      </div>
                      <div className="text-base text-cyan-300 font-bold font-mono">
                        {formatAuroc(res.auroc ?? fused?.auroc)}
                      </div>
                    </div>

                    <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                      <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">
                        TPR @ 5% FPR
                      </div>
                      <div className="text-base text-emerald-400 font-bold font-mono">
                        {formatFractionPercent(res.tpr_at_5pct_fpr ?? fused?.tpr_at_5pct_fpr)}
                      </div>
                    </div>

                    <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                      <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">
                        Test Cases
                      </div>
                      <div className="text-base text-white font-bold font-mono">
                        {res.cases ?? fused?.cases ?? "n/a"}
                      </div>
                    </div>

                    {isExpanded && fused && (
                      <>
                        <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">
                            Flagged (REVIEW+)
                          </div>
                          <div className="text-base text-cyan-300 font-bold font-mono">
                            {formatFractionPercent(fused.detect_rate_at_review_or_worse)}
                          </div>
                        </div>

                        <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">
                            False Alarms (REVIEW+)
                          </div>
                          <div className="text-base text-amber-300 font-bold font-mono">
                            {formatFractionPercent(fused.false_alarm_rate_at_review_or_worse)}
                          </div>
                        </div>

                        <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">
                            Quarantined Attacks
                          </div>
                          <div className="text-base text-rose-400 font-bold font-mono">
                            {formatFractionPercent(fused.detect_rate_at_quarantine)}
                          </div>
                        </div>

                        <div className="p-3 bg-black/40 rounded-xl border border-white/5 col-span-2 sm:col-span-3">
                          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">
                            False Quarantine
                          </div>
                          <div
                            className={`text-base font-bold font-mono ${
                              (fused.false_quarantine_rate ?? 0) >= 0.9
                                ? "text-rose-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {formatFractionPercent(fused.false_quarantine_rate)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Expanded View */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-white/10 space-y-6">
                      {loadingDetail ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                        </div>
                      ) : expandedDetail?.error ? (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-mono text-rose-300">
                          {expandedDetail.error}
                        </div>
                      ) : detailSummary ? (
                        <>
                          {/* 1. ROC Curve Chart */}
                          {fused?.roc_points && fused.roc_points.length > 0 && (
                            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                              <div className="flex items-center justify-between text-xs font-mono">
                                <span className="font-bold text-white uppercase tracking-wider">
                                  ROC Curve (TPR vs. FPR)
                                </span>
                                <span className="text-cyan-400">AUROC: {formatAuroc(fused.auroc)}</span>
                              </div>

                              <div className="h-44 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart
                                    data={fused.roc_points}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis
                                      dataKey="fpr"
                                      stroke="#94a3b8"
                                      fontSize={10}
                                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                    />
                                    <YAxis
                                      stroke="#94a3b8"
                                      fontSize={10}
                                      domain={[0, 1]}
                                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                    />
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: "#0f172a",
                                        borderColor: "rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                        fontFamily: "JetBrains Mono",
                                        fontSize: "11px",
                                      }}
                                    />
                                    <Line
                                      type="monotone"
                                      dataKey="tpr"
                                      stroke="#22d3ee"
                                      strokeWidth={2}
                                      dot={{ r: 3, fill: "#22d3ee" }}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}

                          {/* 2. Data Poisoning Table with Precision & Recall Bars */}
                          {detailSummary.data_poisoning?.by_attack && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Data Poisoning Detection by Attack</span>
                              </h4>
                              <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/40">
                                <table className="w-full text-left font-mono text-[11px]">
                                  <thead className="bg-white/5 text-slate-400 border-b border-white/5">
                                    <tr>
                                      <th className="p-2.5">Attack</th>
                                      <th className="p-2.5">Precision</th>
                                      <th className="p-2.5">Recall</th>
                                      <th className="p-2.5">F1</th>
                                      <th className="p-2.5">Detection Rate</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5">
                                    {Object.entries(detailSummary.data_poisoning.by_attack).map(
                                      ([attack, stats]: [string, any]) => (
                                        <tr key={attack} className="hover:bg-white/[0.02]">
                                          <td className="p-2.5 text-slate-200 font-bold uppercase">
                                            {attack}
                                          </td>
                                          <td className="p-2.5">
                                            <div className="flex items-center gap-2">
                                              <span className="w-12 text-slate-300">
                                                {formatFractionPercent(stats.precision)}
                                              </span>
                                              <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                  className="h-full bg-cyan-400 rounded-full"
                                                  style={{ width: `${(stats.precision || 0) * 100}%` }}
                                                />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="p-2.5">
                                            <div className="flex items-center gap-2">
                                              <span className="w-12 text-slate-300">
                                                {formatFractionPercent(stats.recall)}
                                              </span>
                                              <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                  className="h-full bg-emerald-400 rounded-full"
                                                  style={{ width: `${(stats.recall || 0) * 100}%` }}
                                                />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="p-2.5 text-slate-300">
                                            {stats.f1 != null ? stats.f1.toFixed(3) : "n/a"}
                                          </td>
                                          <td className="p-2.5 text-slate-300">
                                            {formatFractionPercent(stats.dataset_detection_rate)}
                                          </td>
                                        </tr>
                                      )
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* 3. Models Table */}
                          {detailSummary.models?.rows && detailSummary.models.rows.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                <BrainCircuit className="w-3.5 h-3.5 text-violet-400" />
                                <span>Model Integrity & True ASR</span>
                              </h4>
                              <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/40">
                                <table className="w-full text-left font-mono text-[11px]">
                                  <thead className="bg-white/5 text-slate-400 border-b border-white/5">
                                    <tr>
                                      <th className="p-2.5">Model</th>
                                      <th className="p-2.5">Kind</th>
                                      <th className="p-2.5">Verdict</th>
                                      <th className="p-2.5">Risk</th>
                                      <th className="p-2.5">Trigger Flagged</th>
                                      <th className="p-2.5">True ASR</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5">
                                    {detailSummary.models.rows.map((row: any, i: number) => (
                                      <tr key={i} className="hover:bg-white/[0.02]">
                                        <td className="p-2.5 text-slate-200">{row.model}</td>
                                        <td className="p-2.5 text-slate-400 uppercase text-[10px]">
                                          {row.kind}
                                        </td>
                                        <td className="p-2.5">
                                          <DecisionBadge decision={row.decision} size="sm" />
                                        </td>
                                        <td className="p-2.5 text-slate-300">
                                          {row.risk != null ? row.risk.toFixed(1) : "—"}
                                        </td>
                                        <td className="p-2.5">
                                          {row.trigger_flagged ? (
                                            <span className="text-rose-400 font-bold">YES</span>
                                          ) : (
                                            <span className="text-slate-500">NO</span>
                                          )}
                                        </td>
                                        <td className="p-2.5 text-slate-300">
                                          {formatFractionPercent(row.true_asr)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* 4. Drift Table & Inference Provenance */}
                          {detailSummary.drift && detailSummary.drift.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Wind className="w-3.5 h-3.5 text-amber-400" />
                                <span>Distribution Shift & Drift</span>
                              </h4>
                              <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/40">
                                <table className="w-full text-left font-mono text-[11px]">
                                  <thead className="bg-white/5 text-slate-400 border-b border-white/5">
                                    <tr>
                                      <th className="p-2.5">Condition</th>
                                      <th className="p-2.5">Verdict</th>
                                      <th className="p-2.5">Risk</th>
                                      <th className="p-2.5">MMD p-value</th>
                                      <th className="p-2.5">OOD Rate</th>
                                      <th className="p-2.5">Reported Shifts</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5">
                                    {detailSummary.drift.map((d: any, i: number) => (
                                      <tr key={i} className="hover:bg-white/[0.02]">
                                        <td className="p-2.5 text-slate-200 font-bold">{d.condition}</td>
                                        <td className="p-2.5">
                                          <DecisionBadge decision={d.decision} size="sm" />
                                        </td>
                                        <td className="p-2.5 text-slate-300">
                                          {d.risk != null ? d.risk.toFixed(1) : "—"}
                                        </td>
                                        <td className="p-2.5 text-slate-300">
                                          {d.mmd_p != null ? d.mmd_p.toFixed(4) : "—"}
                                        </td>
                                        <td className="p-2.5 text-slate-300">
                                          {formatFractionPercent(d.ood_rate)}
                                        </td>
                                        <td className="p-2.5 text-slate-400">
                                          {d.conditions_reported?.length > 0
                                            ? d.conditions_reported.join(", ")
                                            : "none"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* 5. Inference Results */}
                          {detailSummary.inference && (
                            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Binary className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Inference Provenance Validation</span>
                              </h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                                <div className="p-2 bg-white/[0.02] rounded border border-white/5">
                                  <span className="text-slate-500 block text-[9px] uppercase">
                                    Replay Detected
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      detailSummary.inference.replay_detected
                                        ? "text-emerald-400"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {detailSummary.inference.replay_detected ? "YES (BLOCKED)" : "NO"}
                                  </span>
                                </div>

                                <div className="p-2 bg-white/[0.02] rounded border border-white/5">
                                  <span className="text-slate-500 block text-[9px] uppercase">
                                    Edit Detected
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      detailSummary.inference.edit_detected
                                        ? "text-rose-400"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {detailSummary.inference.edit_detected ? "YES" : "NO"}
                                  </span>
                                </div>

                                <div className="p-2 bg-white/[0.02] rounded border border-white/5">
                                  <span className="text-slate-500 block text-[9px] uppercase">
                                    First Presentation
                                  </span>
                                  <span className="text-emerald-400 font-bold">
                                    {detailSummary.inference.first_presentation || "—"}
                                  </span>
                                </div>

                                <div className="p-2 bg-white/[0.02] rounded border border-white/5">
                                  <span className="text-slate-500 block text-[9px] uppercase">
                                    Replay Verdict
                                  </span>
                                  <span className="text-rose-400 font-bold">
                                    {detailSummary.inference.replay_presentation || "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 6. Known Weak Spots */}
                          {detailSummary.weak_spots && detailSummary.weak_spots.length > 0 && (
                            <div className="space-y-1.5">
                              <h4 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                <span>Known Weak Spots ({detailSummary.weak_spots.length})</span>
                              </h4>
                              <div className="space-y-1">
                                {detailSummary.weak_spots.map((spot: string, i: number) => (
                                  <div
                                    key={i}
                                    className="text-xs font-mono text-slate-300 p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg"
                                  >
                                    {spot}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 7. Raw Markdown Toggle */}
                          {expandedDetail.markdown && (
                            <div className="pt-2 border-t border-white/10 space-y-2">
                              <button
                                onClick={() => setShowRawMarkdown(!showRawMarkdown)}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 flex items-center gap-1.5 transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>{showRawMarkdown ? "Hide Raw Markdown" : "View Raw Markdown"}</span>
                              </button>

                              {showRawMarkdown && (
                                <pre className="p-4 rounded-xl bg-black/60 border border-white/10 text-[11px] font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-72">
                                  {expandedDetail.markdown}
                                </pre>
                              )}
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}
                </GlassPanel>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
